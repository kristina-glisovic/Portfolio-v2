  (function () {
    'use strict';

    const rootEl = document.documentElement;
    let translations = {};
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
    const compactMotionQuery = window.matchMedia('(max-width: 980px)');
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
    const lowPowerConnection = Boolean(connection?.saveData)
      || ['slow-2g', '2g', '3g'].includes(connection?.effectiveType || '');
    const lowSpecDevice = (typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 4)
      || (typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 6);
    const runtimePerformanceMode = false;
    const enablePointerReactiveEffects = true;

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

    function syncMobileMenuLabel(lang = rootEl.getAttribute('lang') || 'en') {
      const key = ham.classList.contains('open') ? 'ui.menuClose' : 'ui.menuOpen';
      const fallback = ham.classList.contains('open') ? 'Close menu' : 'Open menu';
      ham.setAttribute('aria-label', translateKey(lang, key) || fallback);
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

    /* ── Signature Draw Reveal ─────────────────────────────────────── */
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

    /* ── Project card glow tracking ─────────────────────────────────── */
    document.querySelectorAll('.project-card').forEach(card => {
      card.style.removeProperty('--glow-x');
      card.style.removeProperty('--glow-y');
    });

    /* ── Premium surface depth ──────────────────────────────────────── */
    const depthSurfaceSelector = '.education-card, .job-card, .project-card';

    const resetDepthSurface = (surface) => {
      surface.style.setProperty('--surface-tilt-x', '0deg');
      surface.style.setProperty('--surface-tilt-y', '0deg');
      surface.style.setProperty('--surface-scale', '1');
      surface.style.setProperty('--surface-shadow-x', '0px');
      surface.style.setProperty('--surface-shadow-y', '0px');
      surface.style.setProperty('--surface-shadow-blur', '34px');
      surface.style.setProperty('--surface-shadow-alpha', '.16');
      surface.style.setProperty('--surface-glow-blur', '16px');
      surface.style.setProperty('--surface-glow-alpha', '.04');
      surface.style.setProperty('--surface-content-shift-x', '0px');
      surface.style.setProperty('--surface-content-shift-y', '0px');
    };

    if (enablePointerReactiveEffects && finePointerQuery.matches && !isPerformanceMode()) {
      document.querySelectorAll(depthSurfaceSelector).forEach(surface => {
        const maxTilt = 2.2;
        const maxShift = 1.8;

        const updateDepthSurface = (clientX, clientY) => {
          const rect = surface.getBoundingClientRect();
          const relX = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
          const relY = Math.min(Math.max((clientY - rect.top) / rect.height, 0), 1);
          const dx = relX - 0.5;
          const dy = relY - 0.5;
          const distance = Math.min(Math.sqrt((dx * dx) + (dy * dy)) / 0.7071, 1);
          const intensity = 1 - distance;
          const tiltY = ((relX - 0.5) * maxTilt * 2).toFixed(2);
          const tiltX = ((0.5 - relY) * maxTilt * 2).toFixed(2);
          const shiftX = (dx * -maxShift).toFixed(2);
          const shiftY = (dy * -maxShift).toFixed(2);
          const shadowX = (dx * -8).toFixed(2);
          const shadowY = (5 + (intensity * 8)).toFixed(2);
          const shadowBlur = (30 + (intensity * 8)).toFixed(2);
          const shadowAlpha = (0.13 + (intensity * 0.07)).toFixed(3);
          const glowBlur = (10 + (intensity * 8)).toFixed(2);
          const glowAlpha = (0.025 + (intensity * 0.05)).toFixed(3);
          const scale = (1 + (intensity * 0.004)).toFixed(4);

          surface.style.setProperty('--surface-tilt-x', `${tiltX}deg`);
          surface.style.setProperty('--surface-tilt-y', `${tiltY}deg`);
          surface.style.setProperty('--surface-scale', scale);
          surface.style.setProperty('--surface-shadow-x', `${shadowX}px`);
          surface.style.setProperty('--surface-shadow-y', `${shadowY}px`);
          surface.style.setProperty('--surface-shadow-blur', `${shadowBlur}px`);
          surface.style.setProperty('--surface-shadow-alpha', shadowAlpha);
          surface.style.setProperty('--surface-glow-blur', `${glowBlur}px`);
          surface.style.setProperty('--surface-glow-alpha', glowAlpha);
          surface.style.setProperty('--surface-content-shift-x', `${shiftX}px`);
          surface.style.setProperty('--surface-content-shift-y', `${shiftY}px`);
        };

        surface.addEventListener('mouseenter', (event) => {
          updateDepthSurface(event.clientX, event.clientY);
        });

        surface.addEventListener('mousemove', (event) => {
          updateDepthSurface(event.clientX, event.clientY);
        });

        surface.addEventListener('mouseleave', () => {
          resetDepthSurface(surface);
        });
      });
    } else {
      document.querySelectorAll(depthSurfaceSelector).forEach(resetDepthSurface);
    }

    /* ── Form submit ─────────────────────────────────────────────────── */
    function translateKey(lang, key) {
      return translations[lang]?.[key] ?? translations.en?.[key] ?? '';
    }

    function normalizeTranslatedLineText(value) {
      return typeof value === 'string'
        ? value.replace(/\s+/g, ' ').trim()
        : '';
    }

    function normalizeTranslatedLineArray(lines) {
      if (!Array.isArray(lines)) {
        return [];
      }

      return lines
        .map(normalizeTranslatedLineText)
        .filter(Boolean);
    }

    function splitTranslatedTextIntoLines(element, text) {
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

    function renderTranslatedLines(element, value) {
      const usePlainText =
        window.matchMedia('(max-width: 768px)').matches &&
        Boolean(element.closest('#education'));
      const fixedLines = element.hasAttribute('data-i18n-fixed-lines');
      const normalizedArray = Array.isArray(value) ? normalizeTranslatedLineArray(value) : null;
      const explicitLines = fixedLines && normalizedArray?.length ? normalizedArray : null;
      const text = explicitLines
        ? ''
        : (normalizedArray?.join(' ') || normalizeTranslatedLineText(value));

      element._i18nLinesSource = Array.isArray(value) ? [...value] : value;

      if (usePlainText) {
        element.innerHTML = explicitLines && explicitLines.length
          ? explicitLines.join(' ')
          : text;
        return;
      }

      const lines = explicitLines && explicitLines.length
        ? explicitLines
        : splitTranslatedTextIntoLines(element, text);

      element.replaceChildren();

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

    let translatedLineRenderFrame = 0;

    const rerenderTranslatedLineBlocks = () => {
      document.querySelectorAll('[data-i18n-lines]').forEach(element => {
        renderTranslatedLines(element, element._i18nLinesSource || '');
      });

      syncScrollRevealMotion();
      translatedLineRenderFrame = 0;
    };

    const requestTranslatedLineRerender = () => {
      if (translatedLineRenderFrame) return;

      translatedLineRenderFrame = requestAnimationFrame(rerenderTranslatedLineBlocks);
    };

    /* ── Language Switcher ──────────────────────────────────────────── */
    // Load translations from JSON file
    fetch('assets/translations.json?v=20260829-contact')
      .then(response => response.json())
      .then(data => {
        translations = data;
        // Initialize language after translations are loaded
        const currentLang = localStorage.getItem('language') || 'en';
        rootEl.setAttribute('lang', currentLang);
        setLanguage(currentLang);
      })
      .catch(error => {
        console.error('Error loading translations:', error);
      });

    function setLanguage(lang) {
      if (!translations[lang] && !translations.en) return;
      
      rootEl.setAttribute('lang', lang);
      rootEl.setAttribute('data-lang', lang);
      localStorage.setItem('language', lang);

      const pageTitle = translateKey(lang, 'meta.title');
      if (pageTitle) {
        document.title = pageTitle;
      }
      
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const value = translateKey(lang, key);
        if (value) {
          el.innerHTML = value;
        }
      });

      document.querySelectorAll('[data-i18n-lines]').forEach(el => {
        const key = el.getAttribute('data-i18n-lines');
        const preferFluidText = el.classList.contains('hero-desc') || el.classList.contains('guarantee-text');
        const value = preferFluidText
          ? (translations[lang]?.[key] ?? translations.en?.[key])
          : (translations[lang]?.[`${key}.lines`]
            ?? translations.en?.[`${key}.lines`]
            ?? translations[lang]?.[key]
            ?? translations.en?.[key]);
        renderTranslatedLines(el, value);
      });

      syncScrollRevealMotion();

      document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        const value = translateKey(lang, key);
        if (value) {
          el.setAttribute('placeholder', value);
        }
      });

      document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
        const key = el.getAttribute('data-i18n-aria-label');
        const value = translateKey(lang, key);
        if (value) {
          el.setAttribute('aria-label', value);
        }
      });

      document.querySelectorAll('[data-i18n-alt]').forEach(el => {
        const key = el.getAttribute('data-i18n-alt');
        const value = translateKey(lang, key);
        if (value) {
          el.setAttribute('alt', value);
        }
      });

      document.querySelectorAll('[data-i18n-content]').forEach(el => {
        const key = el.getAttribute('data-i18n-content');
        const value = translateKey(lang, key);
        if (value) {
          el.setAttribute('content', value);
        }
      });

      document.querySelectorAll('.lang-btn').forEach(btn => {
        const isCurrentLanguage = btn.getAttribute('data-lang') === lang;
        btn.classList.toggle('active', isCurrentLanguage);
        btn.setAttribute('aria-pressed', String(isCurrentLanguage));
      });

      syncMobileMenuLabel(lang);

      if (typeof window.refreshScrollLineReveal === 'function') {
        window.refreshScrollLineReveal();
      }

      requestDesktopNavFit();
    }

    window.addEventListener('resize', requestTranslatedLineRerender);

    if (document.fonts?.ready) {
      document.fonts.ready.then(requestTranslatedLineRerender);
    }

    // Add event listeners to language buttons
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const lang = btn.getAttribute('data-lang');
        setLanguage(lang);
      });
    });

  }());
