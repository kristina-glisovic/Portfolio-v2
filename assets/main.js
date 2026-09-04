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
    const mobileMenuClose = mob?.querySelector('[data-mobile-menu-close]');
    const mainContent = document.getElementById('main-content');
    const footer = document.querySelector('.footer');
    const skipLink = document.querySelector('.skip-link');
    const navDesktopLinks = Array.from(document.querySelectorAll('.nav-links a'));
    const navMobileLinks = Array.from(document.querySelectorAll('.nav-mobile-link'));
    const navAllLinks = [...navDesktopLinks, ...navMobileLinks];
    const navBackgroundTargets = [navLogo, navLinksBar, navCta, navControls, ham, mainContent, footer, skipLink].filter(Boolean);
    const languageMenus = Array.from(document.querySelectorAll('[data-language-menu]'));
    let navFitFrame = 0;
    const navTopRevealThreshold = 56;
    const navHideStartThreshold = 112;
    const navDownTravelThreshold = 18;
    const navUpTravelThreshold = 10;
    const navJitterThreshold = 3;
    let navIsHidden = false;
    let navLastScrollY = Math.max(window.scrollY, 0);
    let navScrollDirection = 0;
    let navDirectionTravel = 0;
    let navVisibilityFrame = 0;
    let navVisibilityLockedUntil = 0;
    let navKeyboardMode = false;

    function navHasActiveInteraction() {
      const activeElement = document.activeElement;
      return ham.classList.contains('open')
        || languageMenus.some(menu => menu.classList.contains('is-open'))
        || (navKeyboardMode && activeElement instanceof Element && (nav.contains(activeElement) || mob.contains(activeElement)));
    }

    function setNavHidden(isHidden) {
      if (navIsHidden === isHidden) return;
      navIsHidden = isHidden;
      nav.classList.toggle('is-hidden', isHidden);
    }

    function revealNavForInteraction(lockDuration = 0) {
      setNavHidden(false);
      navLastScrollY = Math.max(window.scrollY, 0);
      navScrollDirection = 0;
      navDirectionTravel = 0;
      if (lockDuration > 0) navVisibilityLockedUntil = performance.now() + lockDuration;
    }

    function updateNavVisibility() {
      const currentScrollY = Math.max(window.scrollY, 0);
      const delta = currentScrollY - navLastScrollY;
      navLastScrollY = currentScrollY;

      if (currentScrollY <= navTopRevealThreshold || navHasActiveInteraction() || performance.now() < navVisibilityLockedUntil) {
        setNavHidden(false);
        navScrollDirection = 0;
        navDirectionTravel = 0;
        navVisibilityFrame = 0;
        return;
      }

      if (Math.abs(delta) < navJitterThreshold) {
        navVisibilityFrame = 0;
        return;
      }

      const direction = delta > 0 ? 1 : -1;
      if (direction !== navScrollDirection) {
        navScrollDirection = direction;
        navDirectionTravel = Math.abs(delta);
      } else {
        navDirectionTravel += Math.abs(delta);
      }

      if (direction > 0 && currentScrollY > navHideStartThreshold && navDirectionTravel >= navDownTravelThreshold) {
        setNavHidden(true);
        navDirectionTravel = 0;
      } else if (direction < 0 && navDirectionTravel >= navUpTravelThreshold) {
        setNavHidden(false);
        navDirectionTravel = 0;
      }

      navVisibilityFrame = 0;
    }

    function requestNavVisibilityUpdate() {
      if (!navVisibilityFrame) navVisibilityFrame = requestAnimationFrame(updateNavVisibility);
    }

    function getLanguageMenuParts(menu) {
      return {
        trigger: menu.querySelector('.language-menu-trigger'),
        popover: menu.querySelector('.language-menu-popover'),
        options: Array.from(menu.querySelectorAll('.language-menu-option'))
      };
    }

    function closeLanguageMenu(menu, { restoreFocus = false } = {}) {
      const { trigger, popover } = getLanguageMenuParts(menu);
      if (!trigger || !popover) return;
      menu.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
      popover.hidden = true;
      if (restoreFocus) trigger.focus({ preventScroll: true });
    }

    function closeLanguageMenus(except = null) {
      languageMenus.forEach(menu => {
        if (menu !== except) closeLanguageMenu(menu);
      });
    }

    function openLanguageMenu(menu, focusTarget = 'current') {
      const { trigger, popover, options } = getLanguageMenuParts(menu);
      if (!trigger || !popover || !options.length) return;
      revealNavForInteraction();
      closeLanguageMenus(menu);
      menu.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      popover.hidden = false;
      const target = focusTarget === 'last'
        ? options.at(-1)
        : (options.find(option => option.hasAttribute('aria-current')) || options[0]);
      window.requestAnimationFrame(() => target?.focus({ preventScroll: true }));
    }

    languageMenus.forEach(menu => {
      const { trigger, popover, options } = getLanguageMenuParts(menu);
      if (!trigger || !popover || !options.length) return;

      const toggleLanguageMenu = () => {
        if (trigger.getAttribute('aria-expanded') === 'true') {
          closeLanguageMenu(menu, { restoreFocus: true });
        } else {
          openLanguageMenu(menu);
        }
      };

      trigger.addEventListener('click', toggleLanguageMenu);

      trigger.addEventListener('keydown', event => {
        if (['Enter', ' ', 'Spacebar'].includes(event.key)) {
          event.preventDefault();
          toggleLanguageMenu();
          return;
        }
        if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
          event.preventDefault();
          openLanguageMenu(menu, event.key === 'ArrowUp' ? 'last' : 'current');
        }
      });

      popover.addEventListener('keydown', event => {
        const currentIndex = options.indexOf(document.activeElement);
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          closeLanguageMenu(menu, { restoreFocus: true });
          return;
        }
        if (event.key === 'Tab') {
          closeLanguageMenu(menu);
          return;
        }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        let nextIndex = currentIndex;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = options.length - 1;
        if (event.key === 'ArrowDown') nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % options.length;
        if (event.key === 'ArrowUp') nextIndex = currentIndex < 0 ? options.length - 1 : (currentIndex - 1 + options.length) % options.length;
        options[nextIndex]?.focus({ preventScroll: true });
      });
    });

    document.addEventListener('click', event => {
      if (!(event.target instanceof Element) || !event.target.closest('[data-language-menu]')) closeLanguageMenus();
    });

    document.addEventListener('keydown', () => {
      navKeyboardMode = true;
    }, true);

    document.addEventListener('pointerdown', () => {
      navKeyboardMode = false;
    }, { capture: true, passive: true });

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
        .filter(element => !element.hasAttribute('inert') && !element.closest('[hidden]') && element.getClientRects().length);
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
      closeLanguageMenus();
      if (isOpen) revealNavForInteraction();
      ham.classList.toggle('open', isOpen);
      ham.setAttribute('aria-expanded', String(isOpen));
      nav.classList.toggle('menu-open', isOpen);
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

    window.addEventListener('scroll', () => {
      syncNavSurface();
      requestNavVisibilityUpdate();
    }, { passive: true });
    window.addEventListener('resize', () => {
      requestDesktopNavFit();
      revealNavForInteraction();

      if (window.innerWidth > 1180 && ham.classList.contains('open')) {
        setNavOpen(false, { restoreFocus: false });
      }
    });

    ham.addEventListener('click', () => {
      setNavOpen(!ham.classList.contains('open'));
    });

    mobileMenuClose?.addEventListener('click', () => {
      setNavOpen(false);
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

    document.addEventListener('focusin', event => {
      if (event.target instanceof Element && (nav.contains(event.target) || mob.contains(event.target))) {
        revealNavForInteraction();
      }
    });

    document.querySelectorAll('.nav a[href^="#"], .nav-mobile a[href^="#"]').forEach(link => {
      link.addEventListener('click', () => {
        revealNavForInteraction(700);
        requestActiveNavLinkUpdate();
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
    requestNavVisibilityUpdate();
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
      const viewport = slider.querySelector('.client-feedback-viewport');
      const statusTemplate = slider.dataset.statusTemplate || '{current} / {total}';
      let currentIndex = 0;
      let touchStartX = null;
      let touchStartY = null;
      let heightFrame = 0;

      if (!slides.length) return;

      const syncActiveHeight = () => {
        heightFrame = 0;
        if (!viewport) return;
        const activeSlide = slides[currentIndex];
        const activeHeight = activeSlide.offsetHeight;
        if (activeHeight > 0) viewport.style.height = `${activeHeight}px`;
      };

      const requestActiveHeightSync = () => {
        if (heightFrame) return;
        heightFrame = requestAnimationFrame(syncActiveHeight);
      };

      const updateSlider = (nextIndex, { announce = true, direction = 1 } = {}) => {
        currentIndex = (nextIndex + slides.length) % slides.length;

        slides.forEach((slide, index) => {
          const isCurrent = index === currentIndex;
          slide.setAttribute('aria-hidden', String(!isCurrent));
          slide.classList.toggle('is-active', isCurrent);
          slide.style.order = String((index - currentIndex + slides.length) % slides.length);

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
        requestActiveHeightSync();
      };

      previous?.addEventListener('click', () => updateSlider(currentIndex - 1, { direction: -1 }));
      next?.addEventListener('click', () => updateSlider(currentIndex + 1, { direction: 1 }));
      slides.forEach((slide, index) => {
        slide.addEventListener('click', event => {
          if (index === currentIndex || event.target.closest('a, button, input, select, textarea')) return;
          updateSlider(index, { direction: 1 });
        });
      });

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

      if ('ResizeObserver' in window) {
        const activeSlideObserver = new ResizeObserver(entries => {
          if (entries.some(entry => entry.target === slides[currentIndex])) requestActiveHeightSync();
        });
        slides.forEach(slide => activeSlideObserver.observe(slide));
      }

      window.addEventListener('resize', requestActiveHeightSync);
      document.fonts?.ready.then(requestActiveHeightSync);
      slides.forEach(slide => {
        slide.querySelectorAll('img').forEach(image => {
          if (!image.complete) image.addEventListener('load', requestActiveHeightSync, { once: true });
        });
      });

      updateSlider(0, { announce: false });
    });

    /* ── Case-study progressive disclosure ─────────────────────────── */
    document.querySelectorAll('[data-case-study-toggle]').forEach(toggle => {
      const detailsId = toggle.getAttribute('aria-controls');
      const details = detailsId ? document.getElementById(detailsId) : null;
      const label = toggle.querySelector('[data-case-study-toggle-label]');
      if (!details || !label) return;

      const setExpanded = expanded => {
        toggle.setAttribute('aria-expanded', String(expanded));
        label.textContent = expanded ? toggle.dataset.labelCollapse : toggle.dataset.labelExpand;
        details.hidden = !expanded;
        details.classList.toggle('is-expanded', expanded);

        if (expanded) {
          details.querySelectorAll('.reveal').forEach(element => element.classList.add('visible'));
        }
      };

      toggle.hidden = false;
      setExpanded(false);
      toggle.addEventListener('click', () => {
        setExpanded(toggle.getAttribute('aria-expanded') !== 'true');
      });
    });

    /* ── Project inquiry form ───────────────────────────────────────── */
    document.querySelectorAll('[data-contact-form]').forEach(form => {
      const fields = Array.from(form.querySelectorAll('[data-contact-field]'));
      const submit = form.querySelector('[data-contact-submit]');
      const submitLabel = submit?.querySelector('span');
      const status = form.querySelector('[data-contact-status]');
      const endpoint = form.dataset.contactEndpoint?.trim() || '';

      submit?.removeAttribute('disabled');

      const clearFieldError = field => {
        const error = field.closest('.contact-field')?.querySelector('[data-contact-error]');
        field.removeAttribute('aria-invalid');
        if (error) error.textContent = '';
      };

      const validateField = field => {
        clearFieldError(field);
        let message = '';
        if (field.validity.valueMissing) {
          message = status?.dataset.errorRequired || '';
        } else if (field.validity.typeMismatch) {
          message = status?.dataset.errorEmail || '';
        } else if (field.validity.tooShort) {
          message = status?.dataset.errorDetails || '';
        }

        if (message) {
          field.setAttribute('aria-invalid', 'true');
          const error = field.closest('.contact-field')?.querySelector('[data-contact-error]');
          if (error) error.textContent = message;
          return false;
        }
        return true;
      };

      const setStatus = (message, state = '') => {
        if (!status) return;
        status.textContent = message;
        if (state) status.dataset.state = state;
        else delete status.dataset.state;
      };

      fields.forEach(field => {
        field.addEventListener('blur', () => validateField(field));
        field.addEventListener('input', () => {
          if (field.getAttribute('aria-invalid') === 'true') validateField(field);
          if (status?.dataset.state) setStatus('');
        });
        field.addEventListener('change', () => {
          if (field.getAttribute('aria-invalid') === 'true') validateField(field);
          if (status?.dataset.state) setStatus('');
        });
      });

      form.addEventListener('submit', async event => {
        event.preventDefault();
        const results = fields.map(validateField);
        const firstInvalid = fields[results.findIndex(result => !result)];
        if (firstInvalid) {
          firstInvalid.focus();
          return;
        }

        if (!endpoint || form.dataset.contactEndpointStatus !== 'configured') {
          setStatus(status?.dataset.messageUnavailable || '', 'error');
          return;
        }

        submit?.setAttribute('disabled', '');
        submit?.setAttribute('aria-disabled', 'true');
        if (submitLabel) submitLabel.textContent = submit.dataset.labelSending || '';
        setStatus('', 'pending');

        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(Object.fromEntries(new FormData(form)))
          });
          if (!response.ok) throw new Error(`Contact endpoint returned ${response.status}`);
          form.reset();
          fields.forEach(clearFieldError);
          setStatus(status?.dataset.messageSuccess || '', 'success');
        } catch {
          setStatus(status?.dataset.messageError || '', 'error');
        } finally {
          submit?.removeAttribute('disabled');
          submit?.removeAttribute('aria-disabled');
          if (submitLabel) submitLabel.textContent = submit.dataset.labelDefault || '';
        }
      });
    });

    /* ── Active nav link ─────────────────────────────────────────────── */
    const navSectionIds = [...new Set(navAllLinks
      .map(link => link.getAttribute('href'))
      .filter(href => href?.startsWith('#'))
      .map(href => href.slice(1)))];
    const sections = navSectionIds.map(id => document.getElementById(id)).filter(Boolean);

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

      const maximumScrollY = Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);
      if (window.scrollY >= maximumScrollY - 2 && sections.length) {
        activeSectionId = sections.at(-1).id;
      }

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
