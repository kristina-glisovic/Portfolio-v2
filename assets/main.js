  (function () {
    'use strict';

    const rootEl = document.documentElement;
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
    const navDesktopLinks = Array.from(document.querySelectorAll('.nav-links a'));
    const navMobileLinks = Array.from(document.querySelectorAll('.nav-mobile-link'));
    const navAllLinks = [...navDesktopLinks, ...navMobileLinks];
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

    function setNavOpen(isOpen) {
      ham.classList.toggle('open', isOpen);
      ham.setAttribute('aria-expanded', String(isOpen));
      mob.classList.toggle('open', isOpen);
      mob.setAttribute('aria-hidden', String(!isOpen));
      document.body.style.overflow = isOpen ? 'hidden' : '';
      syncNavSurface();
    }

    window.addEventListener('scroll', syncNavSurface, { passive: true });
    window.addEventListener('resize', () => {
      requestDesktopNavFit();

      if (window.innerWidth > 860 && ham.classList.contains('open')) {
        setNavOpen(false);
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
      if (e.key === 'Escape' && ham.classList.contains('open')) {
        setNavOpen(false);
      }
    });

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
    const signatureFrame = document.querySelector('.guarantee-signature-frame');
    const signatureDrawPath = signatureFrame?.querySelector('[data-signature-path]');
    const signatureRevealTarget = document.querySelector('.guarantee-signoff');
    const signatureTipMotion = signatureFrame?.querySelector('.guarantee-signature-tip-motion');

    if (signatureFrame && signatureDrawPath) {
      const signatureLength = Math.ceil(signatureDrawPath.getTotalLength());

      signatureDrawPath.id = 'guarantee-signature-motion-path';
      signatureFrame.style.setProperty('--signature-length', String(signatureLength));
      signatureDrawPath.style.strokeDasharray = String(signatureLength);
      signatureDrawPath.style.strokeDashoffset = String(signatureLength);
      signatureFrame.classList.add('is-ready');

      const completeSignature = () => {
        signatureFrame.classList.remove('is-signing');
        signatureFrame.classList.add('is-signed');
        signatureDrawPath.style.strokeDashoffset = '0';
      };

      if (isPerformanceMode()) {
        completeSignature();
      } else {
        const startSignatureDraw = () => {
          if (signatureFrame.classList.contains('is-signing') || signatureFrame.classList.contains('is-signed')) return;

          signatureFrame.classList.add('is-signing');
          signatureTipMotion?.beginElement?.();

          const handleSignatureEnd = (event) => {
            if (event.target !== signatureDrawPath || event.animationName !== 'signatureStrokeDraw') return;

            signatureDrawPath.removeEventListener('animationend', handleSignatureEnd);
            completeSignature();
          };

          signatureDrawPath.addEventListener('animationend', handleSignatureEnd);
        };

        const signatureObserver = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (!entry.isIntersecting) return;

            startSignatureDraw();
            signatureObserver.disconnect();
          });
        }, { threshold: 0.28, rootMargin: '0px 0px -8% 0px' });

        signatureObserver.observe(signatureRevealTarget || signatureFrame);

        bindMediaChange(prefersReducedMotion, () => {
          if (prefersReducedMotion.matches) {
            completeSignature();
          }
        });
      }
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

    /* ── Active nav link ─────────────────────────────────────────────── */
    const sections = Array.from(document.querySelectorAll('section[id]'));

    function setActiveNavLink(id) {
      navAllLinks.forEach(link => {
        const isActive = id && link.getAttribute('href') === `#${id}`;
        link.classList.toggle('is-active', Boolean(isActive));

        if (isActive) {
          link.setAttribute('aria-current', 'page');
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
    const depthSurfaceSelector = '.education-card, .certificate-card, .job-card, .project-card, .testimonials-slider, .guarantee-card, .contact-form';

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
      surface.style.setProperty('--skill-card-glow-x', '50%');
      surface.style.setProperty('--skill-card-glow-y', '42%');
      surface.style.setProperty('--skill-card-glow-opacity', '0');
    };

    if (enablePointerReactiveEffects && finePointerQuery.matches && !isPerformanceMode()) {
      document.querySelectorAll(depthSurfaceSelector).forEach(surface => {
        const maxTilt = surface.matches('.guarantee-card, .contact-form, .testimonials-slider') ? 1.35 : 2.2;
        const maxShift = surface.matches('.guarantee-card, .contact-form') ? 1.05 : 1.8;

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

    /* ── Skills card tilt ───────────────────────────────────────────── */
    const skillCards = document.querySelectorAll('#skills .skill-category');

    if (enablePointerReactiveEffects && finePointerQuery.matches && !isPerformanceMode()) {
      skillCards.forEach(card => {
        const resetSkillCard = () => {
          card.style.transform = '';
          card.style.setProperty('--skill-card-glow-x', '50%');
          card.style.setProperty('--skill-card-glow-y', '42%');
          card.style.setProperty('--skill-card-glow-opacity', '0');
        };

        const updateSkillCard = (clientX, clientY) => {
          const rect = card.getBoundingClientRect();
          const relX = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
          const relY = Math.min(Math.max((clientY - rect.top) / rect.height, 0), 1);
          const dx = relX - 0.5;
          const dy = relY - 0.5;
          const distance = Math.min(Math.sqrt((dx * dx) + (dy * dy)) / 0.7071, 1);
          const intensity = 1 - distance;
          const rotateY = (dx * 4.6).toFixed(2);
          const rotateX = ((0.5 - relY) * 4.6).toFixed(2);
          const scale = (1 + (intensity * 0.008)).toFixed(4);

          card.style.transform = `perspective(1400px) translate3d(0,-3px,0) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${scale})`;
          card.style.setProperty('--skill-card-glow-x', `${(relX * 100).toFixed(2)}%`);
          card.style.setProperty('--skill-card-glow-y', `${(relY * 100).toFixed(2)}%`);
          card.style.setProperty('--skill-card-glow-opacity', (0.08 + (intensity * 0.22)).toFixed(3));
        };

        card.addEventListener('mouseenter', event => {
          updateSkillCard(event.clientX, event.clientY);
        });

        card.addEventListener('mousemove', event => {
          updateSkillCard(event.clientX, event.clientY);
        });

        card.addEventListener('mouseleave', resetSkillCard);
      });
    } else {
      skillCards.forEach(card => {
        card.style.transform = '';
        card.style.setProperty('--skill-card-glow-opacity', '0');
      });
    }

    /* ── Testimonials slider ────────────────────────────────────────── */
    const testimonialSlider = document.getElementById('testimonials-slider');

    if (testimonialSlider) {
      const testimonialTrack = document.getElementById('testimonial-track');
      const testimonialViewport = testimonialSlider.querySelector('.testimonial-slider-viewport');
      const testimonialSlides = Array.from(testimonialSlider.querySelectorAll('.testimonial-slide'));
      const testimonialDots = Array.from(testimonialSlider.querySelectorAll('.testimonial-dot'));
      const testimonialPrev = document.getElementById('testimonial-prev');
      const testimonialNext = document.getElementById('testimonial-next');
      const testimonialCurrent = document.getElementById('testimonial-current');
      const testimonialTotal = document.getElementById('testimonial-total');
      const totalSlides = testimonialSlides.length;
      let activeSlideIndex = 0;
      let testimonialAutoplay = 0;
      let testimonialDragState = null;
      let testimonialSettleTimeout = 0;
      let testimonialSwitchTimeout = 0;

      const formatSlideNumber = (value) => String(value + 1).padStart(2, '0');
      const clampValue = (value, min, max) => Math.min(Math.max(value, min), max);

      const setTestimonialDragFeedback = (offsetPx = 0) => {
        const slideWidth = testimonialViewport?.clientWidth || testimonialSlider.clientWidth || 1;
        const progress = clampValue(offsetPx / slideWidth, -1, 1);
        const strength = Math.abs(progress);

        testimonialSlider.style.setProperty('--testimonial-drag-progress', progress.toFixed(3));
        testimonialSlider.style.setProperty('--testimonial-drag-strength', strength.toFixed(3));
        testimonialSlider.style.setProperty('--testimonial-drag-offset', `${offsetPx.toFixed(1)}px`);
      };

      const renderTestimonialSlider = (offsetPx = 0) => {
        const slideWidth = testimonialViewport?.clientWidth || testimonialSlider.clientWidth || 1;
        testimonialTrack.style.transform = `translate3d(${(-activeSlideIndex * slideWidth) + offsetPx}px, 0, 0)`;
        setTestimonialDragFeedback(offsetPx);

        if (testimonialCurrent) {
          testimonialCurrent.textContent = formatSlideNumber(activeSlideIndex);
        }

        if (testimonialTotal) {
          testimonialTotal.textContent = String(totalSlides).padStart(2, '0');
        }

        testimonialSlides.forEach((slide, index) => {
          slide.setAttribute('aria-hidden', String(index !== activeSlideIndex));
        });

        testimonialDots.forEach((dot, index) => {
          dot.classList.toggle('active', index === activeSlideIndex);
          dot.setAttribute('aria-pressed', String(index === activeSlideIndex));
        });
      };

      const clearTestimonialSwitchState = () => {
        testimonialSlider.classList.remove('is-switching');
        testimonialSlides.forEach((slide) => {
          slide.classList.remove('is-entering', 'is-exiting');
        });
      };

      const triggerTestimonialSwitch = (previousIndex, nextIndex, direction = 0) => {
        if (isPerformanceMode() || !direction || previousIndex === nextIndex) return;

        window.clearTimeout(testimonialSwitchTimeout);
        clearTestimonialSwitchState();
        testimonialSlider.style.setProperty('--testimonial-switch-direction', String(direction));

        requestAnimationFrame(() => {
          testimonialSlider.classList.add('is-switching');
          testimonialSlides[previousIndex]?.classList.add('is-exiting');
          testimonialSlides[nextIndex]?.classList.add('is-entering');
        });

        testimonialSwitchTimeout = window.setTimeout(() => {
          clearTestimonialSwitchState();
        }, 820);
      };

      const triggerTestimonialSettle = (direction = 0, strength = 0.6) => {
        if (isPerformanceMode() || !direction) return;

        window.clearTimeout(testimonialSettleTimeout);
        testimonialSlider.style.setProperty('--testimonial-settle-direction', String(direction));
        testimonialSlider.style.setProperty('--testimonial-settle-strength', clampValue(strength, 0.22, 0.58).toFixed(3));
        testimonialSlider.classList.remove('is-settling');
        void testimonialSlider.offsetWidth;
        testimonialSlider.classList.add('is-settling');

        testimonialSettleTimeout = window.setTimeout(() => {
          testimonialSlider.classList.remove('is-settling');
        }, 560);
      };

      const goToTestimonialSlide = (index, direction = 0) => {
        const previousIndex = activeSlideIndex;
        activeSlideIndex = (index + totalSlides) % totalSlides;
        renderTestimonialSlider();
        triggerTestimonialSwitch(previousIndex, activeSlideIndex, direction);
      };

      const stopTestimonialAutoplay = () => {
        if (testimonialAutoplay) {
          window.clearInterval(testimonialAutoplay);
          testimonialAutoplay = 0;
        }
      };

      const startTestimonialAutoplay = () => {
        stopTestimonialAutoplay();

        if (isPerformanceMode() || totalSlides < 2) return;

        testimonialAutoplay = window.setInterval(() => {
          goToTestimonialSlide(activeSlideIndex + 1, -1);
        }, 6500);
      };

      if (testimonialPrev) {
        testimonialPrev.addEventListener('click', () => {
          goToTestimonialSlide(activeSlideIndex - 1, 1);
          triggerTestimonialSettle(1, 0.58);
          startTestimonialAutoplay();
        });
      }

      if (testimonialNext) {
        testimonialNext.addEventListener('click', () => {
          goToTestimonialSlide(activeSlideIndex + 1, -1);
          triggerTestimonialSettle(-1, 0.58);
          startTestimonialAutoplay();
        });
      }

      testimonialDots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
          const direction = index === activeSlideIndex ? 0 : (index > activeSlideIndex ? -1 : 1);
          goToTestimonialSlide(index, direction);
          triggerTestimonialSettle(direction, 0.5);
          startTestimonialAutoplay();
        });
      });

      testimonialSlider.addEventListener('mouseenter', stopTestimonialAutoplay);
      testimonialSlider.addEventListener('mouseleave', () => {
        if (!testimonialDragState) {
          startTestimonialAutoplay();
        }
      });
      testimonialSlider.addEventListener('focusin', stopTestimonialAutoplay);
      testimonialSlider.addEventListener('focusout', () => {
        if (!testimonialDragState) {
          startTestimonialAutoplay();
        }
      });

      if (testimonialViewport && totalSlides > 1) {
        const clearTestimonialDrag = (shouldResumeAutoplay = true) => {
          testimonialDragState = null;
          testimonialSlider.classList.remove('is-dragging');
          testimonialTrack.style.removeProperty('will-change');
          renderTestimonialSlider();

          if (shouldResumeAutoplay) {
            startTestimonialAutoplay();
          }
        };

        testimonialViewport.addEventListener('pointerdown', (event) => {
          if (event.pointerType === 'mouse' && event.button !== 0) return;

          testimonialDragState = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            lastX: event.clientX,
            isHorizontal: null
          };

          testimonialViewport.setPointerCapture?.(event.pointerId);
          stopTestimonialAutoplay();
        });

        testimonialViewport.addEventListener('pointermove', (event) => {
          if (!testimonialDragState || event.pointerId !== testimonialDragState.pointerId) return;

          const deltaX = event.clientX - testimonialDragState.startX;
          const deltaY = event.clientY - testimonialDragState.startY;
          testimonialDragState.lastX = event.clientX;

          if (testimonialDragState.isHorizontal === null) {
            if (Math.abs(deltaX) < 6 && Math.abs(deltaY) < 6) return;
            testimonialDragState.isHorizontal = Math.abs(deltaX) > Math.abs(deltaY);
          }

          if (!testimonialDragState.isHorizontal) return;

          event.preventDefault();
          testimonialSlider.classList.add('is-dragging');
          testimonialTrack.style.willChange = 'transform';
          renderTestimonialSlider(deltaX);
        });

        const finishTestimonialDrag = (event) => {
          if (!testimonialDragState || event.pointerId !== testimonialDragState.pointerId) return;

          const deltaX = testimonialDragState.lastX - testimonialDragState.startX;
          const slideWidth = testimonialViewport.clientWidth || testimonialSlider.clientWidth || 1;
          const swipeThreshold = Math.min(140, slideWidth * 0.18);
          const didSwipe = testimonialDragState.isHorizontal && Math.abs(deltaX) > swipeThreshold;
          const nextIndex = didSwipe ? activeSlideIndex + (deltaX < 0 ? 1 : -1) : activeSlideIndex;
          const settleDirection = deltaX < 0 ? -1 : 1;
          const settleStrength = clampValue(Math.abs(deltaX) / slideWidth, 0.45, 1);

          testimonialViewport.releasePointerCapture?.(event.pointerId);
          testimonialSlider.classList.remove('is-dragging');
          testimonialTrack.style.removeProperty('will-change');
          testimonialDragState = null;

          goToTestimonialSlide(nextIndex, didSwipe ? settleDirection : 0);
          triggerTestimonialSettle(settleDirection, didSwipe ? settleStrength : settleStrength * 0.55);
          startTestimonialAutoplay();
        };

        testimonialViewport.addEventListener('pointerup', finishTestimonialDrag);
        testimonialViewport.addEventListener('pointercancel', (event) => {
          if (!testimonialDragState || event.pointerId !== testimonialDragState.pointerId) return;

          testimonialViewport.releasePointerCapture?.(event.pointerId);
          clearTestimonialDrag();
        });

        window.addEventListener('resize', () => {
          if (!testimonialDragState) {
            renderTestimonialSlider();
          }
        });
      }

      bindMediaChange(prefersReducedMotion, startTestimonialAutoplay);
      bindMediaChange(compactMotionQuery, startTestimonialAutoplay);

      renderTestimonialSlider();
      startTestimonialAutoplay();
    }

    /* ── Form submit ─────────────────────────────────────────────────── */
    let translations = {};

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

    window.handleFormSubmit = function(e) {
      e.preventDefault();
      const btn  = document.getElementById('form-submit');
      const span = btn.querySelector('span');
      const svg  = btn.querySelector('svg');
      const currentLang = rootEl.getAttribute('lang') || localStorage.getItem('language') || 'en';
      btn.disabled = true;
      span.textContent = translateKey(currentLang, 'contact.form.submit.sending') || 'Sending…';
      svg.innerHTML = '<circle cx="12" cy="12" r="9" stroke-dasharray="56" stroke-dashoffset="56" style="animation:dashAnim 1.2s ease-in-out infinite;transform-origin:center"/>';
      setTimeout(() => {
        span.textContent = translateKey(currentLang, 'contact.form.submit.sent') || 'Message Sent!';
        svg.innerHTML = '<polyline points="20 6 9 17 4 12"/>';
        btn.style.background = 'linear-gradient(135deg,#10b981,#059669)';
        setTimeout(() => {
          btn.disabled = false;
          span.textContent = translateKey(currentLang, 'contact.form.submit.default') || 'Send Message';
          svg.innerHTML = '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>';
          btn.style.background = '';
          e.target.reset();
        }, 3000);
      }, 1800);
    };

    /* ── Keyframes ───────────────────────────────────────────────────── */
    const s = document.createElement('style');
    s.textContent = '@keyframes dashAnim{0%{stroke-dashoffset:56}50%{stroke-dashoffset:0}100%{stroke-dashoffset:-56}}';
    document.head.appendChild(s);

    const skillChipLogos = {
      html: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill="#E44D26" d="M4 3h16l-1.45 16.38L12 21l-6.55-1.62L4 3Z"/><path fill="#F16529" d="M12 4.35v15.27l5.3-1.3 1.2-13.97H12Z"/><path fill="#EBEBEB" d="m12 10.42-2.66-.01-.18-2.1H12V6.27H6.93l.05.55.48 5.65H12v-2.05Zm0 5.32-.01.01-2.24-.54-.14-1.66H7.59l.28 3.3 4.12 1.02h.01v-2.13Z"/><path fill="#fff" d="M11.99 10.42v2.05h2.47l-.23 2.74-2.24.54v2.13l4.13-1.02.03-.35.47-5.55.05-.54h-4.91Zm0-4.15v2.04h4.69l.04-.46.09-1.03.05-.55h-4.87Z"/></svg>`,
      css: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill="#1572B6" d="M4 3h16l-1.45 16.38L12 21l-6.55-1.62L4 3Z"/><path fill="#33A9DC" d="M12 4.35v15.27l5.3-1.3 1.2-13.97H12Z"/><path fill="#EBEBEB" d="M12 10.3H9.34l-.18-2H12V6.27H6.93l.05.55.48 5.53H12V10.3Zm0 5.36-.01.01-2.24-.54-.14-1.71H7.59l.27 3.32 4.13 1.02v-2.1Z"/><path fill="#fff" d="M16.64 8.3 16.8 6.27H11.99V8.3h4.65Zm-.35 4.05.02-.22.16-1.83h-4.48v2.05h2.45l-.23 2.78-2.22.54v2.1l4.12-1.02.03-.36.32-4.04Z"/></svg>`,
      javascript: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4" fill="#F7DF1E"/><path fill="#111827" d="M15.2 16.85c.44.72 1.01 1.24 2.02 1.24.85 0 1.4-.43 1.4-1.02 0-.7-.55-.95-1.48-1.36l-.51-.22c-1.47-.63-2.45-1.43-2.45-3.1 0-1.54 1.17-2.72 3.01-2.72 1.31 0 2.25.45 2.92 1.65l-1.6 1.03c-.35-.63-.74-.88-1.32-.88-.6 0-.98.38-.98.88 0 .61.38.86 1.26 1.24l.51.22c1.73.74 2.71 1.5 2.71 3.22 0 1.84-1.45 2.85-3.39 2.85-1.9 0-3.12-.9-3.72-2.08l1.62-.95ZM8.15 17.03c.32.57.61 1.05 1.31 1.05.67 0 1.09-.26 1.09-1.28v-6.94h1.99v6.97c0 2.11-1.24 3.07-3.05 3.07-1.64 0-2.58-.85-3.06-1.87l1.72-1Z"/></svg>`,
      sass: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill="#CC6699" d="M19.22 13.08c-.35-.07-.68-.12-1-.15.12-.48.18-.9.18-1.25 0-1.37-.53-2.27-1.52-2.27-1.01 0-2.13.97-2.13 2.33 0 .57.21 1.06.6 1.46-.18.34-.39.7-.63 1.07-.48-.1-.98-.2-1.48-.3-1.23-.24-2.36-.44-3.23-.44-.42 0-.81.03-1.17.1.45-.9 1.57-1.83 3.4-2.87 1.55-.88 3.07-1.72 4.04-2.74.79-.82 1.14-1.58 1.14-2.43 0-1.36-1.08-2.29-2.74-2.29-2.23 0-4.8 1.35-6.61 3.12C5.34 8.23 4.3 10.28 4.3 12.1c0 1.64.9 2.57 2.45 2.57.53 0 1.08-.1 1.66-.27-.4.85-.63 1.71-.63 2.49 0 1.35.87 2.18 2.26 2.18 1.7 0 3.21-1.25 4.33-3.41.28.06.56.12.82.18 1.16.26 2.09.5 2.7.88-.08.03-.17.08-.27.13-.94.47-1.54 1.22-1.54 1.93 0 .55.4.9 1.04.9.74 0 1.45-.42 1.94-1.14.41-.59.63-1.33.63-2.08 0-.14-.01-.28-.03-.41.65.07 1.46.22 2.06.54l.55-1.59a6.67 6.67 0 0 0-2.31-.81Zm-2.17-2.03c.4 0 .55.47.55.9 0 .2-.03.45-.1.76-.39-.23-.58-.56-.58-.96 0-.41.18-.7.13-.7ZM9.7 17.42c-.44 0-.64-.28-.64-.77 0-.58.24-1.32.66-2.08.25-.1.5-.22.75-.35.91-.46 1.7-1 2.35-1.57l.42-.37.4.08c.13.03.25.05.38.08-.81 1.57-2.28 4.98-4.32 4.98Zm7.61.5c-.1 0-.15-.04-.15-.1 0-.12.16-.38.68-.67.01.07.02.14.02.2 0 .32-.23.57-.55.57Z"/></svg>`,
      bootstrap: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="4" fill="#7952B3"/><path fill="#fff" d="M8.16 7.5h4.8c2.38 0 3.84 1.13 3.84 3 0 1.26-.7 2.16-1.92 2.52v.05c1.6.17 2.5 1.22 2.5 2.86 0 2.08-1.6 3.32-4.34 3.32H8.16V7.5Zm2.4 4.73h1.86c1.2 0 1.89-.52 1.89-1.44 0-.9-.68-1.4-1.93-1.4h-1.82v2.84Zm0 5.15h2.18c1.52 0 2.26-.53 2.26-1.65 0-1.05-.77-1.58-2.26-1.58h-2.18v3.23Z"/></svg>`,
      tailwind: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill="#38BDF8" d="M12 7.2c-2.2 0-3.58 1.08-4.15 3.24.86-1.08 1.86-1.49 3-1.23.65.15 1.11.58 1.63 1.06.84.8 1.81 1.73 4.02 1.73 2.2 0 3.58-1.08 4.15-3.24-.86 1.08-1.86 1.49-3 1.23-.65-.15-1.11-.58-1.63-1.06-.84-.8-1.81-1.73-4.02-1.73Zm-4.15 4.8C5.65 12 4.27 13.08 3.7 15.24c.86-1.08 1.86-1.49 3-1.23.65.15 1.11.58 1.63 1.06.84.8 1.81 1.73 4.02 1.73 2.2 0 3.58-1.08 4.15-3.24-.86 1.08-1.86 1.49-3 1.23-.65-.15-1.11-.58-1.63-1.06-.84-.8-1.81-1.73-4.02-1.73Z"/></svg>`,
      blazor: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill="#7C3AED" d="M6.5 5h6.57c3.3 0 5.43 1.59 5.43 4.15 0 1.78-.94 2.97-2.65 3.4v.08c2.1.24 3.3 1.6 3.3 3.69 0 2.84-2.25 4.68-5.92 4.68H6.5V5Zm3.1 6.06h2.52c1.48 0 2.3-.62 2.3-1.75 0-1.1-.83-1.68-2.37-1.68H9.6v3.43Zm0 7.31h2.97c1.76 0 2.67-.65 2.67-1.94 0-1.24-.91-1.88-2.67-1.88H9.6v3.82Z"/></svg>`,
      shopify: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill="#95BF47" d="M6.54 6.18 4.9 20.6l13.9.95 1.3-11.34-3.26-.98c-.22-1.7-1.33-2.7-2.72-3.23-.64-2.03-1.8-2.86-2.79-2.86-.08 0-.16 0-.24.02-.08-.1-.18-.15-.27-.15-.77 0-1.5.96-2.03 2.72-1.1.33-2.24 1.42-2.57 3.45l-1.78.53Z"/><path fill="#5E8E3E" d="m12.91 5.98-.98 15.02 6.87.47 1.3-11.34-3.26-.98c-.22-1.7-1.33-2.7-2.72-3.23-.3-.95-.72-1.61-1.21-1.94Z"/><path fill="#fff" d="m13.72 9.15-.8 2.37a4.4 4.4 0 0 0-1.9-.5c-.8 0-1.2.39-1.2.84 0 .5.46.84 1.02 1.26.82.61 1.9 1.38 1.9 2.8 0 1.82-1.3 3.06-3.42 3.06-1.01 0-1.94-.3-2.57-.66l.55-1.77c.56.34 1.43.64 2.22.64.72 0 1.23-.29 1.23-.87 0-.54-.43-.9-.95-1.3-.86-.65-1.98-1.46-1.98-2.74 0-1.75 1.26-3.05 3.38-3.05.91 0 1.63.19 2.07.4Z"/></svg>`,
      csharp: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill="#68217A" d="m12 2.6 7.9 4.55v9.7L12 21.4l-7.9-4.55v-9.7L12 2.6Z"/><path fill="#fff" d="M9.6 15.7c-2 0-3.37-1.35-3.37-3.67s1.4-3.71 3.44-3.71c.92 0 1.7.28 2.29.8l-.72 1.2a2.33 2.33 0 0 0-1.49-.54c-1.05 0-1.8.78-1.8 2.2 0 1.39.73 2.16 1.75 2.16.64 0 1.21-.23 1.63-.61l.7 1.17c-.6.64-1.52 1-2.43 1Zm7.74-2.01h-1.03v1.02h-.93V13.7h-1v-.92h1v-1h.93v1h1.03v.92Z"/></svg>`,
      dotnet: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="4" fill="#512BD4"/><path fill="#fff" d="M7.2 15.8v-7h2.46c2.26 0 3.6 1.27 3.6 3.48 0 2.23-1.35 3.52-3.6 3.52H7.2Zm1.68-1.37h.67c1.35 0 2.01-.74 2.01-2.15 0-1.4-.66-2.11-2.01-2.11h-.67v4.26Zm5.34 1.37v-5.04h1.56v.76c.33-.55.83-.88 1.55-.88.16 0 .32.02.47.06v1.43a1.6 1.6 0 0 0-.58-.1c-.62 0-1.05.34-1.29.94v2.83h-1.71Z"/></svg>`,
      git: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill="#F05133" d="M21.35 10.95 13.05 2.65a2.22 2.22 0 0 0-3.14 0L8.18 4.38l2.2 2.2a2.64 2.64 0 0 1 3.34 3.36l2.12 2.12a2.65 2.65 0 1 1-1.26 1.18l-1.98-1.98v5.2a2.65 2.65 0 1 1-1.72 0V11.2a2.64 2.64 0 0 1-1.43-3.46l-2.18-2.18-5.62 5.61a2.22 2.22 0 0 0 0 3.14l8.3 8.3a2.22 2.22 0 0 0 3.14 0l8.26-8.26a2.22 2.22 0 0 0 0-3.14Z"/></svg>`,
      github: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill="#F8FAFC" d="M12 3.2a8.8 8.8 0 0 0-2.78 17.15c.44.08.6-.18.6-.41v-1.43c-2.44.53-2.95-1.03-2.95-1.03-.4-1-.97-1.27-.97-1.27-.8-.54.06-.53.06-.53.88.06 1.35.9 1.35.9.79 1.34 2.06.95 2.57.73.08-.57.31-.95.55-1.16-1.95-.22-4-1-4-4.32 0-.95.34-1.73.9-2.34-.09-.22-.39-1.12.09-2.33 0 0 .74-.24 2.42.9a8.3 8.3 0 0 1 4.4 0c1.67-1.14 2.4-.9 2.4-.9.5 1.2.2 2.1.1 2.33.57.61.9 1.39.9 2.34 0 3.33-2.05 4.1-4.02 4.31.32.28.6.82.6 1.66v2.47c0 .23.15.5.6.41A8.8 8.8 0 0 0 12 3.2Z"/></svg>`,
      gitlab: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill="#E24329" d="m12 20.85 3.16-9.72H8.84L12 20.85Z"/><path fill="#FC6D26" d="M12 20.85 8.84 11.13H4.41L12 20.85Z"/><path fill="#FCA326" d="M4.41 11.13 3.45 14.1a.66.66 0 0 0 .24.75L12 20.85 4.41 11.13Z"/><path fill="#E24329" d="m4.41 11.13 4.43 0L6.94 5.3c-.1-.3-.52-.3-.62 0l-1.9 5.83Z"/><path fill="#FC6D26" d="m12 20.85 3.16-9.72h4.43L12 20.85Z"/><path fill="#FCA326" d="m19.59 11.13.96 2.97a.66.66 0 0 1-.24.75L12 20.85l7.59-9.72Z"/><path fill="#E24329" d="M19.59 11.13h-4.43L17.06 5.3c.1-.3.52-.3.62 0l1.9 5.83Z"/></svg>`,
      vscode: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill="#29B6F6" d="M17.5 3.75 8.2 12l9.3 8.25c.38.34.99.07.99-.44V4.18c0-.5-.6-.78-.99-.43Z"/><path fill="#007ACC" d="m14.37 6.29-6.84 5.1-3.1-2.37a.83.83 0 0 0-1.05.04L2 10.31c-.29.27-.27.73.04.97l3.05 2.5-3.05 2.5a.73.73 0 0 0-.04.97l1.38 1.25c.3.27.76.29 1.05.04l3.1-2.38 6.84 5.1c.48.36 1.17.01 1.17-.59V6.88c0-.6-.69-.95-1.17-.59Z"/></svg>`,
      visualstudio: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill="#5C2D91" d="m17.86 2.97-7.52 2.44a1.12 1.12 0 0 0-.77.82L8.4 12l1.17 5.77c.08.38.36.68.73.8l7.56 2.47A1.12 1.12 0 0 0 19.33 20V4.03a1.12 1.12 0 0 0-1.47-1.06Z"/><path fill="#A67AF4" d="M19.33 4.03 11.2 12l8.13 7.97V4.03Z"/><path fill="#7F52FF" d="M4.67 7.2 8.4 12l-3.73 4.8a.76.76 0 0 1-1.2.05l-1.76-1.9a.76.76 0 0 1 .02-1.06L4.9 12 1.73 9.1a.76.76 0 0 1-.02-1.06l1.76-1.9a.76.76 0 0 1 1.2.05Z"/></svg>`,
      postgresql: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill="#336791" d="M11.66 4.1c-1.8 0-3.2.78-4.1 2.1-.83 1.2-1.26 2.74-1.26 4.44 0 2.95 1.29 5.17 3.56 6.17l-.36 2.74 1.93-.95c.32.06.66.1 1.02.1 2.2 0 4.01-1.28 4.83-3.4.18-.47.62-.84 1.12-.94l.99-.19-.82-1.32c-.27-.44-.32-.97-.13-1.45.3-.75.46-1.59.46-2.49 0-2.91-1.78-4.81-4.54-4.81h-.31c-.62-.64-1.45-1-2.39-1Zm-.37 1.88c.45 0 .81.17 1.06.48.25.3.37.72.37 1.23 0 .53-.13.95-.38 1.27-.26.32-.61.48-1.05.48-.43 0-.78-.16-1.03-.47-.25-.32-.38-.74-.38-1.28 0-.52.12-.93.37-1.24.25-.31.59-.47 1.04-.47Zm3.56 7.9c-.27.7-.86 1.14-1.63 1.14-.8 0-1.4-.48-1.66-1.23h3.29c.04.03.03.06 0 .09Z"/><path fill="#fff" d="M9.62 10.84c.45.44 1.05.68 1.68.68.64 0 1.24-.24 1.7-.7l.46.7c.52.8.55 1.83.09 2.67-.36.64-1.04 1.03-1.79 1.03-.75 0-1.42-.38-1.8-1.02a2.57 2.57 0 0 1 .01-2.67l.45-.69Z"/></svg>`,
      figma: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill="#F24E1E" d="M9.5 3.5a3.5 3.5 0 1 1 0 7h-2a3.5 3.5 0 1 1 0-7h2Z"/><path fill="#FF7262" d="M16.5 3.5a3.5 3.5 0 1 1 0 7h-7a3.5 3.5 0 1 1 0-7h7Z"/><path fill="#A259FF" d="M9.5 10.5a3.5 3.5 0 1 1 0 7h-2a3.5 3.5 0 1 1 0-7h2Z"/><path fill="#1ABCFE" d="M16.5 10.5A3.5 3.5 0 1 1 13 14a3.5 3.5 0 0 1 3.5-3.5Z"/><path fill="#0ACF83" d="M9.5 17.5a3.5 3.5 0 1 1 0 7h-2a3.5 3.5 0 1 1 0-7h2Z" transform="translate(0 -4)"/></svg>`,
      postman: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#FF6C37"/><path fill="#fff" d="M8.3 11.2h5.62l-1.7-1.7 1.03-1.02 3.47 3.47-3.47 3.47-1.03-1.02 1.7-1.7H8.3v-1.5Z"/></svg>`,
      swagger: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill="#85EA2D" d="M12 3.2c2.63 0 4.53 1.18 5.53 3.42l-1.87 1.08c-.68-1.46-1.9-2.18-3.66-2.18-1.35 0-2.38.34-3.1 1.03-.71.7-1.07 1.62-1.07 2.78 0 1.1.3 1.97.9 2.62.62.64 1.5 1.08 2.65 1.3l1.35.27c1.74.35 3 1 3.8 1.95.8.95 1.2 2.05 1.2 3.32 0 .47-.06.94-.17 1.39h-2.3c.1-.37.16-.73.16-1.08 0-.86-.27-1.55-.81-2.07-.54-.53-1.42-.92-2.63-1.17l-1.33-.26c-1.7-.35-3-1.02-3.88-2-.87-.99-1.3-2.21-1.3-3.68 0-1.82.64-3.33 1.92-4.54C8.39 3.8 10.03 3.2 12 3.2Zm-6.3 15.9h2.36v2.37H5.7V19.1Zm10.25 0h2.35v2.37h-2.35V19.1Z"/></svg>`,
      pagespeed: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill="#34A853" d="M12 4a8 8 0 0 0-8 8h3.2a4.8 4.8 0 1 1 4.8 4.8v3.2A8 8 0 1 0 12 4Z"/><path fill="#4285F4" d="M12 4v3.2A4.8 4.8 0 0 1 16.8 12H20A8 8 0 0 0 12 4Z"/><path fill="#FBBC04" d="m11.2 12.8 5.9-5.28-3.67 6.99a1.8 1.8 0 1 1-2.22-1.71Z"/></svg>`,
      searchconsole: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="3.5" width="10.5" height="13" rx="2" fill="#4285F4"/><path fill="#fff" d="M7 7h4.5v1.5H7V7Zm0 3h4.5v1.5H7V10Zm0 3h3v1.5H7V13Z"/><circle cx="16.7" cy="16.7" r="3.1" stroke="#34A853" stroke-width="2"/><path stroke="#34A853" stroke-linecap="round" stroke-width="2" d="m19 19 2 2"/></svg>`,
      analytics: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="11" width="3.2" height="8" rx="1.6" fill="#F9AB00"/><rect x="10.4" y="6" width="3.2" height="13" rx="1.6" fill="#F57C00"/><circle cx="17.8" cy="16.2" r="2.8" fill="#E8710A"/></svg>`,
      instagram: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="5" fill="#D62976"/><path fill="#FEDA75" d="M12 8.2c-2.09 0-3.8 1.7-3.8 3.8s1.7 3.8 3.8 3.8 3.8-1.7 3.8-3.8-1.7-3.8-3.8-3.8Zm0 5.8A2 2 0 1 1 12 10a2 2 0 0 1 0 4Zm4.28-6.46a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8Z"/><circle cx="12" cy="12" r="3.6" stroke="#fff" stroke-width="1.8"/><circle cx="16.3" cy="7.7" r="1" fill="#fff"/></svg>`,
      facebook: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#1877F2"/><path fill="#fff" d="M13.15 19v-6.12h2.06l.3-2.38h-2.36V8.98c0-.69.2-1.15 1.19-1.15H15.6V5.7c-.22-.03-.96-.1-1.83-.1-1.8 0-3.03 1.1-3.03 3.12v1.78H8.7v2.38h2.04V19h2.4Z"/></svg>`,
      meta: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill="#0A7CFF" d="M6.32 16.43c.87 0 1.68-.94 2.66-2.95.86-1.78 1.45-2.66 1.94-2.66.53 0 1.03.79 1.87 2.39 1.03 1.95 2.02 3.22 3.3 3.22 1.56 0 2.6-1.57 2.6-3.82 0-2.83-1.44-5.07-3.52-5.07-1.37 0-2.42 1.02-3.74 3.53-1.06-2.2-2.1-3.3-3.43-3.3-2.26 0-4.06 2.4-4.06 5.4 0 1.98 1.1 3.26 2.38 3.26Zm.1-1.66c-.52 0-.95-.68-.95-1.56 0-1.83 1.05-3.84 2.18-3.84.73 0 1.41.85 2.5 3.37-.94 1.7-1.74 2.03-2.4 2.03Zm10.88 0c-.8 0-1.42-.76-2.56-3.07.92-1.64 1.72-2.33 2.39-2.33.96 0 1.88 1.58 1.88 3.46 0 1.16-.63 1.94-1.71 1.94Z"/></svg>`,
      photoshop: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4" fill="#001E36"/><path fill="#31A8FF" d="M7.44 16.8V7.2h3.7c2 0 3.29 1.15 3.29 2.95 0 1.93-1.48 3.04-3.53 3.04H9.54v3.6h-2.1Zm2.1-5.28h1.3c1 0 1.56-.46 1.56-1.32 0-.84-.56-1.3-1.52-1.3H9.54v2.62Zm7.86 5.44c-.95 0-1.8-.18-2.45-.54v-1.83c.74.48 1.57.72 2.4.72.92 0 1.39-.27 1.39-.82 0-.43-.27-.67-1.1-.96l-.63-.22c-1.48-.5-2.08-1.25-2.08-2.45 0-1.55 1.26-2.54 3.2-2.54.82 0 1.56.12 2.13.37v1.75a4.17 4.17 0 0 0-2.01-.5c-.82 0-1.22.27-1.22.78 0 .36.23.58.98.84l.67.22c1.59.52 2.2 1.22 2.2 2.5 0 1.62-1.24 2.68-3.48 2.68Z"/></svg>`,
      canva: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#00C4CC"/><path fill="#fff" d="M13.2 16.88c-2.32 0-3.9-1.73-3.9-4.53 0-2.81 1.68-4.7 4.24-4.7.98 0 1.82.23 2.52.67v1.94a3.7 3.7 0 0 0-2.34-.83c-1.46 0-2.4 1.07-2.4 2.83 0 1.73.9 2.77 2.35 2.77.92 0 1.7-.32 2.36-.92v1.9c-.65.56-1.58.87-2.83.87Z"/></svg>`,
      capcut: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill="#fff" d="M6.64 5h8.88c1.65 0 2.48 2 1.32 3.17l-2.3 2.3 2.3 2.31c1.16 1.16.33 3.17-1.32 3.17H6.64l4.3-3.48L6.64 9.01 11.03 5H6.64Zm10.72 14H8.48c-1.65 0-2.48-2-1.32-3.17l2.3-2.3-2.3-2.31C5.99 10.06 6.82 8.05 8.48 8.05h8.88l-4.3 3.48L17.36 15l-4.39 4Z"/></svg>`,
      slack: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="10.3" width="5" height="3.4" rx="1.7" fill="#36C5F0"/><rect x="7.3" y="4" width="3.4" height="8.6" rx="1.7" fill="#36C5F0"/><rect x="10.3" y="4" width="3.4" height="5" rx="1.7" fill="#2EB67D"/><rect x="10.3" y="7.3" width="8.6" height="3.4" rx="1.7" fill="#2EB67D"/><rect x="15" y="10.3" width="5" height="3.4" rx="1.7" fill="#ECB22E"/><rect x="13.3" y="10.3" width="3.4" height="8.6" rx="1.7" fill="#ECB22E"/><rect x="10.3" y="15" width="3.4" height="5" rx="1.7" fill="#E01E5A"/><rect x="4" y="13.3" width="8.6" height="3.4" rx="1.7" fill="#E01E5A"/></svg>`,
      notion: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4.2" y="4.2" width="15.6" height="15.6" rx="2" fill="#fff" stroke="#111827" stroke-width="1.6"/><path fill="#111827" d="M8.3 8.2h2.13l3.7 6V8.2h1.63v7.62h-1.95l-3.88-6.28v6.28H8.3V8.2Z"/></svg>`,
      asana: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="7.2" r="3.2" fill="#F06A6A"/><circle cx="7.1" cy="15.8" r="3.2" fill="#F06A6A"/><circle cx="16.9" cy="15.8" r="3.2" fill="#F8B26A"/></svg>`,
      cloudflare: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill="#F38020" d="M16.52 10.06a4.1 4.1 0 0 0-7.95-1.33A3.38 3.38 0 0 0 5.2 11.9c0 .12.01.23.02.34a2.52 2.52 0 0 0 .27 5.03h10.6a3.56 3.56 0 0 0 .43-7.21Z"/><path fill="#FAAE40" d="M17.48 17.26H8.26a1.1 1.1 0 0 1-.2-2.18l8.22-1.02a.89.89 0 0 0-.1-1.77h-9.8a2.52 2.52 0 0 0-.9 4.97h12Z"/></svg>`,
      cpanel: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="4" fill="#FF6C2C"/><path fill="#fff" d="M11.28 14.95a3.98 3.98 0 0 1-2.9 1.1c-2.27 0-3.87-1.56-3.87-3.79 0-2.28 1.65-3.88 4.01-3.88.94 0 1.82.24 2.48.68v1.8a3.26 3.26 0 0 0-2.23-.84c-1.33 0-2.2.88-2.2 2.24 0 1.34.82 2.2 2.12 2.2.9 0 1.66-.29 2.28-.85v1.34h.43c.5 0 .76-.26.76-.81V8.52h1.97v5.86c0 1.2-.68 1.88-1.88 1.88h-.97v-1.31Z"/></svg>`
    };
    const skillChipLogoMatchers = [
      { key: 'vscode', pattern: /\bvs code\b|\bvisual studio code\b/ },
      { key: 'visualstudio', pattern: /\bvisual studio\b/ },
      { key: 'github', pattern: /\bgithub\b/ },
      { key: 'gitlab', pattern: /\bgitlab\b/ },
      { key: 'git', pattern: /\bgit\b/ },
      { key: 'html', pattern: /\bhtml5?\b/ },
      { key: 'tailwind', pattern: /\btailwind\b/ },
      { key: 'css', pattern: /\bcss3?\b/ },
      { key: 'sass', pattern: /\bsass\b|\bscss\b/ },
      { key: 'javascript', pattern: /\bjavascript\b|\bes6\b/ },
      { key: 'bootstrap', pattern: /\bbootstrap\b/ },
      { key: 'blazor', pattern: /\bblazor\b/ },
      { key: 'shopify', pattern: /\bshopify\b|\bliquid\b/ },
      { key: 'csharp', pattern: /c#/ },
      { key: 'dotnet', pattern: /asp\.net|\.net/ },
      { key: 'postgresql', pattern: /\bpostgresql\b/ },
      { key: 'figma', pattern: /\bfigma\b/ },
      { key: 'postman', pattern: /\bpostman\b/ },
      { key: 'swagger', pattern: /\bswagger\b/ },
      { key: 'pagespeed', pattern: /\bpagespeed\b/ },
      { key: 'searchconsole', pattern: /google search console/ },
      { key: 'analytics', pattern: /google analytics/ },
      { key: 'instagram', pattern: /\binstagram\b/ },
      { key: 'facebook', pattern: /\bfacebook\b/ },
      { key: 'meta', pattern: /\bmeta\b/ },
      { key: 'canva', pattern: /\bcanva\b/ },
      { key: 'photoshop', pattern: /adobe photoshop|photoshop/ },
      { key: 'capcut', pattern: /\bcapcut\b/ },
      { key: 'slack', pattern: /\bslack\b/ },
      { key: 'notion', pattern: /\bnotion\b/ },
      { key: 'asana', pattern: /\basana\b/ },
      { key: 'cloudflare', pattern: /\bcloudflare\b/ },
      { key: 'cpanel', pattern: /\bcpanel\b/ }
    ];

    function normalizeSkillChipLabel(value) {
      return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function getSkillChipLogoKey(label) {
      const normalized = normalizeSkillChipLabel(label);
      const match = skillChipLogoMatchers.find(entry => entry.pattern.test(normalized));
      return match?.key || '';
    }

    function enhanceSkillChips() {
      document.querySelectorAll('.skill-chip').forEach(chip => {
        chip.classList.remove('has-logo');
        chip.removeAttribute('data-logo');
        chip.querySelector('.skill-chip-logo')?.remove();

        const logoKey = getSkillChipLogoKey(chip.textContent || '');
        const logoMarkup = skillChipLogos[logoKey];

        if (!logoMarkup) return;

        chip.classList.add('has-logo');
        chip.setAttribute('data-logo', logoKey);
        chip.insertAdjacentHTML('afterbegin', `<span class="skill-chip-logo" aria-hidden="true">${logoMarkup}</span>`);
      });

      document.querySelectorAll('.skill-chips').forEach(container => {
        const chips = Array.from(container.querySelectorAll('.skill-chip'));
        if (!chips.length) return;

        const withLogos = chips.filter(chip => chip.classList.contains('has-logo'));
        const textOnly = chips.filter(chip => !chip.classList.contains('has-logo'));

        [...withLogos, ...textOnly].forEach(chip => {
          container.appendChild(chip);
        });
      });
    }

    /* ── Language Switcher ──────────────────────────────────────────── */
    // Load translations from JSON file
    fetch('assets/translations.json')
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

      enhanceSkillChips();

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
        btn.classList.toggle('active', btn.getAttribute('data-lang') === lang);
      });

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
