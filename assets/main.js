  (function () {
    'use strict';

    const rootEl = document.documentElement;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const compactMotionQuery = window.matchMedia('(max-width: 980px)');
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
    const lowPowerConnection = Boolean(connection?.saveData)
      || ['slow-2g', '2g', '3g'].includes(connection?.effectiveType || '');
    const lowSpecDevice = (typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 4)
      || (typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 6);
    const runtimePerformanceMode = false;

    const bindMediaChange = (target, handler) => {
      if (!target || typeof handler !== 'function') return;

      if (typeof target.addEventListener === 'function') {
        target.addEventListener('change', handler);
      } else if (typeof target.addListener === 'function') {
        target.addListener(handler);
      }
    };

    const isPerformanceMode = () => (
      runtimePerformanceMode
      || prefersReducedMotion.matches
      || compactMotionQuery.matches
      || lowPowerConnection
      || lowSpecDevice
    );

    const syncPerformanceMode = () => {
      rootEl.classList.toggle('performance-mode', isPerformanceMode());
    };

    syncPerformanceMode();
    bindMediaChange(prefersReducedMotion, syncPerformanceMode);
    bindMediaChange(compactMotionQuery, syncPerformanceMode);

    if (connection) {
      bindMediaChange(connection, syncPerformanceMode);
    }

    /* ── Navbar ──────────────────────────────────────────────────────── */
    const nav = document.getElementById('nav');
    const ham = document.getElementById('hamburger');
    const mob = document.getElementById('nav-mobile');
    const navInner = nav?.querySelector('.nav-inner');
    const navLogo = nav?.querySelector('.nav-logo');
    const navLinksBar = nav?.querySelector('.nav-links');
    const navRight = nav?.querySelector('.nav-right');
    const navCta = nav?.querySelector('.nav-cta');
    const navControls = nav?.querySelector('.nav-controls');
    const mainContent = document.getElementById('main-content');
    const footer = document.querySelector('.footer');
    const skipLink = document.querySelector('.skip-link');
    const navDesktopLinks = Array.from(document.querySelectorAll('.nav-links a'));
    const navMobileLinks = Array.from(document.querySelectorAll('.nav-mobile-link'));
    const navAllLinks = [...navDesktopLinks, ...navMobileLinks];
    const navBackgroundTargets = [navLogo, navLinksBar, navCta, navControls, mainContent, footer, skipLink].filter(Boolean);
    let navFitFrame = 0;

    function syncNavSurface() {
      nav.classList.toggle('scrolled', window.scrollY > 24 || ham.classList.contains('open'));
    }

    function desktopNavNeedsMoreSpace() {
      if (!navInner || !navLogo || !navLinksBar || !navRight) return false;

      const reservedSpace = navLogo.offsetWidth + navRight.offsetWidth + 32;
      const availableLinkWidth = navInner.clientWidth - reservedSpace;

      return navLinksBar.scrollWidth > availableLinkWidth;
    }

    function syncDesktopNavFit() {
      if (!navInner) return;

      navInner.classList.remove('nav-fit-compact', 'nav-fit-tight');

      if (window.innerWidth <= 860 || !navLinksBar || !navCta) return;

      if (desktopNavNeedsMoreSpace()) {
        navInner.classList.add('nav-fit-compact');
      }

      if (desktopNavNeedsMoreSpace()) {
        navInner.classList.add('nav-fit-tight');
      }
    }

    function requestDesktopNavFit() {
      if (navFitFrame) return;

      navFitFrame = requestAnimationFrame(() => {
        syncDesktopNavFit();
        navFitFrame = 0;
      });
    }

    function getMobileMenuFocusables() {
      return Array.from(mob.querySelectorAll('a[href], button:not([disabled])'))
        .filter(element => !element.hasAttribute('inert'));
    }

    function syncMobileMenuLabel() {
      const isOpen = ham.classList.contains('open');
      const label = isOpen ? ham.dataset.labelClose : ham.dataset.labelOpen;
      ham.setAttribute('aria-label', label || (isOpen ? 'Close menu' : 'Open menu'));
    }

    function setBackgroundInert(isInert) {
      navBackgroundTargets.forEach(element => {
        element.toggleAttribute('inert', isInert);
      });
    }

    function setNavOpen(isOpen, { restoreFocus = !isOpen } = {}) {
      ham.classList.toggle('open', isOpen);
      ham.setAttribute('aria-expanded', String(isOpen));
      mob.classList.toggle('open', isOpen);
      mob.setAttribute('aria-hidden', String(!isOpen));
      mob.toggleAttribute('inert', !isOpen);
      setBackgroundInert(isOpen);
      document.body.style.overflow = isOpen ? 'hidden' : '';
      syncMobileMenuLabel();
      syncNavSurface();

      if (isOpen) {
        window.setTimeout(() => {
          if (ham.classList.contains('open')) {
            getMobileMenuFocusables()[0]?.focus({ preventScroll: true });
          }
        }, 50);
      } else if (restoreFocus) {
        window.setTimeout(() => {
          if (!ham.classList.contains('open')) {
            ham.focus({ preventScroll: true });
          }
        }, 50);
      }
    }

    window.addEventListener('scroll', syncNavSurface, { passive: true });
    window.addEventListener('resize', () => {
      requestDesktopNavFit();

      if (window.innerWidth > 860 && ham.classList.contains('open')) {
        setNavOpen(false, { restoreFocus: false });
      }
    });

    ham.addEventListener('click', () => {
      setNavOpen(!ham.classList.contains('open'));
    });

    mob.addEventListener('click', e => {
      if (e.target === mob) {
        setNavOpen(false);
      }
    });

    mob.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        setNavOpen(false);
      });
    });

    window.addEventListener('keydown', e => {
      if (!ham.classList.contains('open')) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        setNavOpen(false);
        return;
      }

      if (e.key !== 'Tab') return;

      const focusables = getMobileMenuFocusables();
      if (!focusables.length) {
        e.preventDefault();
        ham.focus({ preventScroll: true });
        return;
      }

      const firstFocusable = focusables[0];
      const lastFocusable = focusables[focusables.length - 1];
      const activeElement = document.activeElement;

      if (!mob.contains(activeElement)) {
        e.preventDefault();
        firstFocusable.focus();
      } else if (e.shiftKey && activeElement === firstFocusable) {
        e.preventDefault();
        lastFocusable.focus();
      } else if (!e.shiftKey && activeElement === lastFocusable) {
        e.preventDefault();
        firstFocusable.focus();
      }
    });

    setNavOpen(false, { restoreFocus: false });
    syncNavSurface();
    requestDesktopNavFit();

    if (navInner) {
      const navResizeObserver = new ResizeObserver(requestDesktopNavFit);
      navResizeObserver.observe(navInner);
    }

    if (document.fonts?.ready) {
      document.fonts.ready.then(requestDesktopNavFit);
    }

    /* ── Scroll Reveal ───────────────────────────────────────────────── */
    const revealObs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          revealObs.unobserve(e.target);
        }
      });
    }, { threshold: 0.01, rootMargin: '0px 0px 12% 0px' });
    document.querySelectorAll('.reveal, .divider').forEach(el => revealObs.observe(el));

    /* ── Premium Section State ──────────────────────────────────────── */
    const premiumSections = document.querySelectorAll('[data-premium-section]');
    const premiumDividers = Array.from(document.querySelectorAll('.divider'));

    if (isPerformanceMode()) {
      premiumSections.forEach(section => section.classList.add('in-view'));
    } else {
      const premiumSectionObs = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          entry.target.classList.toggle('in-view', entry.isIntersecting);
        });
      }, { threshold: 0.02, rootMargin: '0px 0px 10% 0px' });

      premiumSections.forEach(section => premiumSectionObs.observe(section));
    }

    if (premiumSections.length) {
      const sectionEntranceObs = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;

          entry.target.classList.add('section-animated');
          sectionEntranceObs.unobserve(entry.target);
        });
      }, { threshold: 0.16, rootMargin: '0px 0px -8% 0px' });

      premiumSections.forEach(section => sectionEntranceObs.observe(section));
    }

    /* ── Divider Parallax ───────────────────────────────────────────── */
    if (premiumDividers.length) {
      const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
      let dividerMotionFrame = 0;

      const resetDividerMotion = () => {
        premiumDividers.forEach(divider => {
          divider.style.setProperty('--divider-strength', '0');
          divider.style.setProperty('--divider-travel', '.5');
          divider.style.setProperty('--divider-shell-shift', '0px');
          divider.style.setProperty('--divider-line-shift', '0px');
          divider.style.setProperty('--divider-line-drift', '0px');
        });
      };

      const updateDividerMotion = () => {
        if (isPerformanceMode()) {
          resetDividerMotion();
          dividerMotionFrame = 0;
          return;
        }

        const viewportHeight = window.innerHeight || 1;

        premiumDividers.forEach(divider => {
          const rect = divider.getBoundingClientRect();
          const dividerMid = rect.top + (rect.height * 0.5);
          const normalized = clamp((dividerMid - (viewportHeight * 0.5)) / viewportHeight, -1, 1);
          const strength = 1 - clamp(Math.abs(normalized) * 1.9, 0, 1);
          const travel = clamp(0.5 - (normalized * 0.72), 0, 1);
          const shellShift = -normalized * 24;
          const lineShift = -normalized * 10;
          const lineDrift = (travel - 0.5) * 22;

          divider.style.setProperty('--divider-strength', strength.toFixed(3));
          divider.style.setProperty('--divider-travel', travel.toFixed(3));
          divider.style.setProperty('--divider-shell-shift', `${shellShift.toFixed(2)}px`);
          divider.style.setProperty('--divider-line-shift', `${lineShift.toFixed(2)}px`);
          divider.style.setProperty('--divider-line-drift', `${lineDrift.toFixed(2)}px`);
        });

        dividerMotionFrame = 0;
      };

      const requestDividerMotionFrame = () => {
        if (!dividerMotionFrame) {
          dividerMotionFrame = requestAnimationFrame(updateDividerMotion);
        }
      };

      window.addEventListener('scroll', requestDividerMotionFrame, { passive: true });
      window.addEventListener('resize', requestDividerMotionFrame);
      bindMediaChange(prefersReducedMotion, requestDividerMotionFrame);
      bindMediaChange(compactMotionQuery, requestDividerMotionFrame);
      requestDividerMotionFrame();
    }

    /* ── Scroll Line Reveal ─────────────────────────────────────────── */
    let scrollRevealLines = [];

    const collectScrollRevealLines = () => {
      scrollRevealLines = Array.from(document.querySelectorAll('.scroll-reveal-line'));
    };

    const setScrollRevealProgress = (line, progress) => {
      line.style.setProperty('--line-progress', progress.toFixed(3));
    };

    const updateScrollRevealLines = () => {
      const viewportHeight = window.innerHeight || 1;
      const start = viewportHeight * 0.94;
      const end = viewportHeight * 0.5;
      const distance = Math.max(start - end, 1);

      scrollRevealLines.forEach(line => {
        const rect = line.getBoundingClientRect();
        const anchor = rect.top + (rect.height * 0.5);
        const progress = Math.max(0, Math.min(1, (start - anchor) / distance));
        setScrollRevealProgress(line, progress);
      });
    };

    let scrollRevealFrame = 0;
    const requestScrollRevealUpdate = () => {
      if (isPerformanceMode()) {
        scrollRevealLines.forEach(line => setScrollRevealProgress(line, 1));
        return;
      }

      if (!scrollRevealFrame) {
        scrollRevealFrame = requestAnimationFrame(() => {
          updateScrollRevealLines();
          scrollRevealFrame = 0;
        });
      }
    };

    const syncScrollRevealMotion = () => {
      collectScrollRevealLines();

      if (isPerformanceMode()) {
        scrollRevealLines.forEach(line => setScrollRevealProgress(line, 1));
        return;
      }

      requestScrollRevealUpdate();
    };

    window.refreshScrollLineReveal = syncScrollRevealMotion;
    window.addEventListener('scroll', requestScrollRevealUpdate, { passive: true });
    window.addEventListener('resize', requestScrollRevealUpdate);

    bindMediaChange(prefersReducedMotion, syncScrollRevealMotion);
    bindMediaChange(compactMotionQuery, syncScrollRevealMotion);

    /* ── Client feedback slider ─────────────────────────────────────── */
    document.querySelectorAll('[data-testimonial-slider]').forEach(slider => {
      const slides = Array.from(slider.querySelectorAll('[data-testimonial-slide]'));
      const previous = slider.querySelector('[data-testimonial-previous]');
      const next = slider.querySelector('[data-testimonial-next]');
      const counter = slider.querySelector('[data-testimonial-counter]');
      const status = slider.querySelector('[data-testimonial-status]');
      const statusTemplate = slider.dataset.statusTemplate || '{current} / {total}';
      let currentIndex = 0;
      let touchStartX = null;
      let touchStartY = null;

      if (!slides.length) return;

      const updateSlider = (nextIndex, { announce = true, direction = 1 } = {}) => {
        currentIndex = (nextIndex + slides.length) % slides.length;

        slides.forEach((slide, index) => {
          const isCurrent = index === currentIndex;
          slide.hidden = !isCurrent;
          slide.setAttribute('aria-hidden', String(!isCurrent));

          if (isCurrent && !prefersReducedMotion.matches) {
            slide.dataset.direction = direction > 0 ? 'next' : 'previous';
            slide.classList.add('is-entering');
            requestAnimationFrame(() => slide.classList.remove('is-entering'));
          } else {
            slide.classList.remove('is-entering');
            delete slide.dataset.direction;
          }
        });

        const current = String(currentIndex + 1).padStart(2, '0');
        const total = String(slides.length).padStart(2, '0');
        if (counter) counter.textContent = `${current} / ${total}`;
        if (status) {
          const message = statusTemplate
            .replace('{current}', String(currentIndex + 1))
            .replace('{total}', String(slides.length));
          if (announce) status.textContent = '';
          requestAnimationFrame(() => { status.textContent = message; });
        }
      };

      previous?.addEventListener('click', () => updateSlider(currentIndex - 1, { direction: -1 }));
      next?.addEventListener('click', () => updateSlider(currentIndex + 1, { direction: 1 }));

      slider.addEventListener('keydown', event => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          updateSlider(currentIndex - 1, { direction: -1 });
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          updateSlider(currentIndex + 1, { direction: 1 });
        }
      });

      slider.addEventListener('touchstart', event => {
        const touch = event.changedTouches[0];
        touchStartX = touch?.clientX ?? null;
        touchStartY = touch?.clientY ?? null;
      }, { passive: true });

      slider.addEventListener('touchend', event => {
        if (touchStartX === null || touchStartY === null) return;
        const touch = event.changedTouches[0];
        const deltaX = (touch?.clientX ?? touchStartX) - touchStartX;
        const deltaY = (touch?.clientY ?? touchStartY) - touchStartY;
        touchStartX = null;
        touchStartY = null;

        if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
        updateSlider(currentIndex + (deltaX < 0 ? 1 : -1), { direction: deltaX < 0 ? 1 : -1 });
      }, { passive: true });

      updateSlider(0, { announce: false });
    });

    /* ── Active nav link ─────────────────────────────────────────────── */
    const sections = Array.from(document.querySelectorAll('section[id]'));

    function setActiveNavLink(id) {
      navAllLinks.forEach(link => {
        const isActive = id && link.getAttribute('href') === `#${id}`;
        link.classList.toggle('is-active', Boolean(isActive));

        if (isActive) {
          link.setAttribute('aria-current', 'location');
        } else {
          link.removeAttribute('aria-current');
        }
      });
    }

    let navSectionFrame = 0;

    function updateActiveNavLink() {
      const anchorLine = window.scrollY + nav.offsetHeight + 80;
      let activeSectionId = '';

      sections.forEach(section => {
        if (anchorLine >= section.offsetTop) {
          activeSectionId = section.id;
        }
      });

      setActiveNavLink(activeSectionId);
      navSectionFrame = 0;
    }

    function requestActiveNavLinkUpdate() {
      if (!navSectionFrame) {
        navSectionFrame = requestAnimationFrame(updateActiveNavLink);
      }
    }

    window.addEventListener('scroll', requestActiveNavLinkUpdate, { passive: true });
    window.addEventListener('resize', requestActiveNavLinkUpdate);
    requestActiveNavLinkUpdate();

    /* ── Progressive line reveal enhancement ────────────────────────── */
    function normalizeLineText(value) {
      return typeof value === 'string'
        ? value.replace(/\s+/g, ' ').trim()
        : '';
    }

    function splitStaticTextIntoLines(element, text) {
      const width = Math.round(element.getBoundingClientRect().width);

      if (!text || width <= 0) {
        return text ? [text] : [];
      }

      const computedStyle = window.getComputedStyle(element);
      const measure = document.createElement('div');

      measure.setAttribute('aria-hidden', 'true');
      measure.style.position = 'absolute';
      measure.style.left = '-9999px';
      measure.style.top = '0';
      measure.style.visibility = 'hidden';
      measure.style.pointerEvents = 'none';
      measure.style.width = `${Math.max(width + 14, width)}px`;
      measure.style.padding = '0';
      measure.style.margin = '0';
      measure.style.border = '0';
      measure.style.whiteSpace = 'normal';
      measure.style.wordBreak = computedStyle.wordBreak;
      measure.style.overflowWrap = computedStyle.overflowWrap;
      measure.style.letterSpacing = computedStyle.letterSpacing;
      measure.style.wordSpacing = computedStyle.wordSpacing;
      measure.style.lineHeight = computedStyle.lineHeight;
      measure.style.font = computedStyle.font;
      measure.style.fontKerning = computedStyle.fontKerning;
      measure.style.fontFeatureSettings = computedStyle.fontFeatureSettings;
      measure.style.fontVariationSettings = computedStyle.fontVariationSettings;
      measure.style.textTransform = computedStyle.textTransform;
      measure.style.textIndent = computedStyle.textIndent;

      const computedTextWrap = computedStyle.getPropertyValue('text-wrap');
      if (computedTextWrap) {
        measure.style.setProperty('text-wrap', computedTextWrap);
      }

      text.split(/\s+/).filter(Boolean).forEach((word, index, words) => {
        const token = document.createElement('span');
        token.textContent = index === words.length - 1 ? word : `${word} `;
        measure.appendChild(token);
      });

      document.body.appendChild(measure);

      const lines = [];
      let currentTop = null;
      let currentLine = '';

      Array.from(measure.children).forEach(token => {
        const tokenTop = Math.round(token.offsetTop);

        if (currentTop === null) {
          currentTop = tokenTop;
        }

        if (tokenTop !== currentTop) {
          const trimmedLine = currentLine.trim();

          if (trimmedLine) {
            lines.push(trimmedLine);
          }

          currentLine = '';
          currentTop = tokenTop;
        }

        currentLine += token.textContent || '';
      });

      const trimmedLine = currentLine.trim();

      if (trimmedLine) {
        lines.push(trimmedLine);
      }

      measure.remove();
      return lines.length ? lines : [text];
    }

    function renderStaticLines(element, value) {
      const text = normalizeLineText(value);
      const lines = splitStaticTextIntoLines(element, text);

      element.replaceChildren();
      element.classList.add('is-line-enhanced');

      lines.forEach(textLine => {
        const line = document.createElement('span');
        line.className = 'scroll-reveal-line';

        const base = document.createElement('span');
        base.className = 'scroll-reveal-line-base';
        base.innerHTML = textLine;

        const ink = document.createElement('span');
        ink.className = 'scroll-reveal-line-ink';
        ink.innerHTML = textLine;
        ink.setAttribute('aria-hidden', 'true');

        line.append(base, ink);
        element.appendChild(line);
      });
    }

    let staticLineRenderFrame = 0;

    const rerenderStaticLineBlocks = () => {
      document.querySelectorAll('[data-line-reveal-source]').forEach(element => {
        renderStaticLines(element, element._lineRevealSourceHtml || '');
      });

      syncScrollRevealMotion();
      staticLineRenderFrame = 0;
    };

    const requestStaticLineRerender = () => {
      if (staticLineRenderFrame) return;

      staticLineRenderFrame = requestAnimationFrame(rerenderStaticLineBlocks);
    };

    document.querySelectorAll('[data-line-reveal-source]').forEach(element => {
      element._lineRevealSourceHtml = element.innerHTML;
    });
    rerenderStaticLineBlocks();

    window.addEventListener('resize', requestStaticLineRerender);

    if (document.fonts?.ready) {
      document.fonts.ready.then(requestStaticLineRerender);
    }

  }());
