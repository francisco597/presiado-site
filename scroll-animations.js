/**
 * PRESIADO HOME IMPROVEMENT
 * Scroll Animations v2.0
 * Black & Gold Ultra-Premium — White Glove Authority
 */
(function () {
  'use strict';

  /* ─────────────────────────────────────────────
   * 1. SCROLL PROGRESS BAR (gold, top of screen)
   * ───────────────────────────────────────────── */
  var progressBar = document.getElementById('scroll-progress');
  function updateProgress() {
    var scrollTop = window.scrollY || document.documentElement.scrollTop;
    var docHeight = document.documentElement.scrollHeight - window.innerHeight;
    var pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    if (progressBar) progressBar.style.width = pct + '%';
  }

  /* ─────────────────────────────────────────────
   * 2. HERO PARALLAX
   * ───────────────────────────────────────────── */
  var heroImg = document.querySelector('.hero-image');
  function updateParallax() {
    if (!heroImg) return;
    var scrollY = window.scrollY;
    var heroBottom = document.getElementById('hero').getBoundingClientRect().bottom + scrollY;
    if (scrollY < heroBottom) {
      heroImg.style.transform = 'translateY(' + scrollY * 0.28 + 'px) scale(1.04)';
    }
  }

  /* ─────────────────────────────────────────────
   * 3. SCROLL EVENT (batched via rAF)
   * ───────────────────────────────────────────── */
  var ticking = false;
  function onScroll() {
    if (!ticking) {
      requestAnimationFrame(function () {
        updateProgress();
        updateParallax();
        ticking = false;
      });
      ticking = true;
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  updateProgress();
  updateParallax();

  /* ─────────────────────────────────────────────
   * 4. HERO ENTRANCE — staggered on load
   * ───────────────────────────────────────────── */
  var heroTargets = [
    { sel: '.hero-badge',   delay: 180 },
    { sel: '.hero h1',      delay: 360 },
    { sel: '.hero > .container p', delay: 500 },
    { sel: '.hero-actions', delay: 640 },
    { sel: '.hero-stats',   delay: 780 }
  ];
  heroTargets.forEach(function (t) {
    var el = document.querySelector(t.sel);
    if (!el) return;
    el.style.opacity = '0';
    el.style.transform = 'translateY(28px)';
    el.style.transition = 'opacity 0.9s cubic-bezier(0.16,1,0.3,1), transform 0.9s cubic-bezier(0.16,1,0.3,1)';
    setTimeout(function () {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    }, t.delay);
  });

  // Hero image zoom-out on load
  if (heroImg) {
    heroImg.style.transform = 'scale(1.08)';
    heroImg.style.transition = 'transform 1.6s cubic-bezier(0.16,1,0.3,1)';
    setTimeout(function () {
      heroImg.style.transform = 'scale(1.04)';
    }, 80);
  }

  /* ─────────────────────────────────────────────
   * 5. TRUST BAR — infinite ticker
   * ───────────────────────────────────────────── */
  var trustItems = document.querySelector('.trust-items');
  if (trustItems) {
    // Duplicate children for seamless loop
    var clone = trustItems.innerHTML;
    trustItems.innerHTML = clone + clone;
    trustItems.style.animation = 'none';
    trustItems.style.display = 'flex';
    trustItems.style.width = 'max-content';
    trustItems.style.alignItems = 'center';
    trustItems.style.animation = 'presiadoTicker 28s linear infinite';
  }

  /* ─────────────────────────────────────────────
   * 6. ENHANCED INTERSECTION OBSERVER
   *    Replaces the basic inline one
   * ───────────────────────────────────────────── */
  // Re-initialize reveal elements (upgrade to cubic easing)
  document.querySelectorAll('.reveal').forEach(function (el) {
    el.style.opacity = '0';
    el.style.transform = 'translateY(44px)';
    el.style.transition = 'opacity 0.85s cubic-bezier(0.16,1,0.3,1), transform 0.85s cubic-bezier(0.16,1,0.3,1)';
    el.classList.remove('visible');
  });

  // Process steps: alternate left / right
  document.querySelectorAll('.process-step').forEach(function (el, i) {
    el.classList.remove('reveal', 'reveal-delay-1', 'reveal-delay-2');
    el.style.opacity = '0';
    el.style.transform = i % 2 === 0 ? 'translateX(-48px)' : 'translateX(48px)';
    el.style.transition = 'opacity 0.85s cubic-bezier(0.16,1,0.3,1), transform 0.85s cubic-bezier(0.16,1,0.3,1)';
    el.style.transitionDelay = (i * 0.12) + 's';
    el.dataset.pxAnim = 'true';
  });

  // Portfolio cards: scale reveal
  document.querySelectorAll('.portfolio-card').forEach(function (el, i) {
    el.classList.remove('reveal', 'reveal-delay-1', 'reveal-delay-2');
    el.style.opacity = '0';
    el.style.transform = 'scale(0.90) translateY(24px)';
    el.style.transition = 'opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1)';
    el.style.transitionDelay = (i * 0.08) + 's';
    el.dataset.pxAnim = 'true';
  });

  // Testimonial cards
  document.querySelectorAll('.testimonial-card').forEach(function (el, i) {
    el.classList.remove('reveal');
    el.style.opacity = '0';
    el.style.transform = 'translateY(36px)';
    el.style.transition = 'opacity 0.75s cubic-bezier(0.16,1,0.3,1), transform 0.75s cubic-bezier(0.16,1,0.3,1)';
    el.style.transitionDelay = (i * 0.15) + 's';
    el.dataset.pxAnim = 'true';
  });

  function revealEl(el) {
    el.style.opacity = '1';
    el.style.transform = 'translateY(0) translateX(0) scale(1)';
    el.classList.add('visible');
  }

  var mainObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        revealEl(entry.target);
        mainObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  document.querySelectorAll('.reveal, [data-px-anim]').forEach(function (el) {
    mainObserver.observe(el);
  });

  /* ─────────────────────────────────────────────
   * 7. GOLD LINE DRAW — section headers
   * ───────────────────────────────────────────── */
  document.querySelectorAll('.section-header').forEach(function (header) {
    var line = document.createElement('div');
    line.className = 'px-gold-line';
    line.style.cssText = [
      'display:block',
      'height:1px',
      'background:linear-gradient(90deg,#C6A768 0%,rgba(198,167,104,0.15) 100%)',
      'width:0',
      'margin:20px auto 0',
      'transition:width 1.1s cubic-bezier(0.16,1,0.3,1)',
      'max-width:120px'
    ].join(';');
    header.appendChild(line);

    var lineObserver = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) {
        setTimeout(function () { line.style.width = '80px'; }, 200);
        lineObserver.disconnect();
      }
    }, { threshold: 0.5 });
    lineObserver.observe(header);
  });

  /* ─────────────────────────────────────────────
   * 8. COUNTER ANIMATION — hero stats
   * ───────────────────────────────────────────── */
  var counters = [
    { sel: '.hero-stats .hero-stat-num:nth-child(1)', target: 100, suffix: '%', prefix: '' },
  ];

  // Generic counter function
  function animateCount(el, start, end, duration, prefix, suffix) {
    var startTime = null;
    function step(ts) {
      if (!startTime) startTime = ts;
      var progress = Math.min((ts - startTime) / duration, 1);
      // Ease out cubic
      var ease = 1 - Math.pow(1 - progress, 3);
      var current = Math.floor(start + (end - start) * ease);
      el.textContent = prefix + current + suffix;
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // Observe hero stats section
  var heroStats = document.querySelector('.hero-stats');
  if (heroStats) {
    var statsObserver = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      statsObserver.disconnect();

      var statEls = heroStats.querySelectorAll('.hero-stat-num');
      if (statEls[0]) animateCount(statEls[0], 0, 100, 1400, '', '%');
      // stat[1] = 5.0★ — animate decimal
      if (statEls[1]) {
        var s = 0, e = 50, dur = 1200;
        var st = null;
        function stepDec(ts) {
          if (!st) st = ts;
          var p = Math.min((ts - st) / dur, 1);
          var ease = 1 - Math.pow(1 - p, 3);
          var v = (s + (e - s) * ease) / 10;
          statEls[1].textContent = v.toFixed(1) + ' \u2605';
          if (p < 1) requestAnimationFrame(stepDec);
        }
        requestAnimationFrame(stepDec);
      }
      // stat[2] = 24hr — count up
      if (statEls[2]) animateCount(statEls[2], 0, 24, 1000, '', 'hr');
    }, { threshold: 0.5 });
    statsObserver.observe(heroStats);
  }

  /* ─────────────────────────────────────────────
   * 9. CTA SECTION — ambient gold pulse
   * ───────────────────────────────────────────── */
  var ctaSection = document.querySelector('.cta-section');
  if (ctaSection) {
    var ctaObserver = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) {
        ctaSection.classList.add('px-cta-active');
      } else {
        ctaSection.classList.remove('px-cta-active');
      }
    }, { threshold: 0.3 });
    ctaObserver.observe(ctaSection);
  }

  /* ─────────────────────────────────────────────
   * 10. SERVICE CARDS — gold border on scroll
   * ───────────────────────────────────────────── */
  document.querySelectorAll('.service-card').forEach(function (card, i) {
    card.style.transitionDelay = (i * 0.1) + 's';
  });

  /* ─────────────────────────────────────────────
   * INJECT DYNAMIC STYLES
   * ───────────────────────────────────────────── */
  var style = document.createElement('style');
  style.textContent = [
    /* Trust ticker */
    '@keyframes presiadoTicker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}',
    /* CTA ambient pulse */
    '@keyframes presiadoGlow{0%,100%{opacity:0.06}50%{opacity:0.18}}',
    '.px-cta-active::before{animation:presiadoGlow 3s ease-in-out infinite!important}',
    /* Scroll progress bar */
    '#scroll-progress{position:fixed;top:0;left:0;height:2px;background:linear-gradient(90deg,#C6A768,#e8d5a3);z-index:10000;width:0%;box-shadow:0 0 10px rgba(198,167,104,0.7);pointer-events:none;transition:width 0.05s linear}',
    /* Ensure trust-bar doesn't clip the ticker */
    '.trust-bar{overflow:hidden}',
    /* Pause ticker on hover */
    '.trust-bar:hover .trust-items{animation-play-state:paused}',
    /* On mobile: no parallax shift issues */
    '@media(max-width:768px){.hero-image{transform:none!important}}'
  ].join('');
  document.head.appendChild(style);

  /* ─────────────────────────────────────────────
   * SCROLL PROGRESS BAR ELEMENT
   *  (inject if not in HTML yet)
   * ───────────────────────────────────────────── */
  if (!document.getElementById('scroll-progress')) {
    var bar = document.createElement('div');
    bar.id = 'scroll-progress';
    document.body.insertBefore(bar, document.body.firstChild);
    progressBar = bar;
  }

})();
