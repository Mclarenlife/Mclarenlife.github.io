/* ═══════════════════════════════════════════════════════════════
   main.js — bleibtgleich replica
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  gsap.registerPlugin(ScrollTrigger, SplitText, CustomEase);

  CustomEase.create('ease-io', '0.76, 0, 0.24, 1');
  CustomEase.create('hero-out', '0.16, 1, 0.3, 1');

  const $  = (s, c) => (c || document).querySelector(s);
  const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isTouch = window.matchMedia('(hover: none)').matches;

  /* ═══════════════════════════════════════════════════════════
     SMOOTH SCROLL
     ═══════════════════════════════════════════════════════════ */
  const lenis = new Lenis({
    duration: 1.1,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    touchMultiplier: 1.6
  });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  /* ═══════════════════════════════════════════════════════════
     SPLIT HELPER
     ═══════════════════════════════════════════════════════════ */
  function splitLines(el) {
    if (reduce) return null;
    try {
      return SplitText.create
        ? SplitText.create(el, { type: 'lines', mask: 'lines', autoSplit: true, linesClass: 'split-line' })
        : new SplitText(el, { type: 'lines', mask: 'lines', autoSplit: true, linesClass: 'split-line' });
    } catch (e) {
      console.warn('[split] failed', e);
      return null;
    }
  }

  /* ═══════════════════════════════════════════════════════════
     EFFECT 1 · PRELOADER
     ═══════════════════════════════════════════════════════════ */
  const preloader = $('#preloader');
  const countEl   = $('[data-preloader="count"]');
  const fillEl    = $('[data-preloader="fill"]');

  const progress = { v: 0 };

  function runPreloader() {
    if (reduce) {
      preloader.classList.add('is-done');
      gsap.set(preloader, { display: 'none' });
      lenis.start();
      document.body.classList.add('is-loaded');
      revealAll();
      return;
    }

    gsap.set(fillEl, { scaleY: 0, transformOrigin: '50% 100%' });
    gsap.set(preloader, { pointerEvents: 'auto' });

    const state = { n: 0 };

    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      onComplete: () => {
        preloader.classList.add('is-done');
        gsap.set(preloader, { pointerEvents: 'none' });
        document.body.classList.add('is-loaded');
        lenis.start();
        heroReveal();
      }
    });

    /* 1 ─ 一条 tween 同时推黑色和数字。
       以前是两条（数字一条、竖线一条），各自 ease 各自计时，中途一定会有一帧
       对不上；现在黑色就是进度本身，数字只是这个数的另一种写法。 */
    tl.to(progress, {
      v: 100,
      duration: 2.1,
      ease: 'power1.inOut',
      onUpdate: () => {
        gsap.set(fillEl, { scaleY: progress.v / 100 });
        const n = Math.round(progress.v);
        if (n !== state.n) {
          state.n = n;
          countEl.textContent = n + '%';
        }
      }
    }, 0.15);

    /* 2 ─ 满屏的黑，停一下 */
    tl.to({}, { duration: 0.28 });

    /* 3 ─ 数字先撤净，黑色再从底边沉下去。
       顺序不能反：数字是 difference 混合的，黑色一旦沉干净它就只剩白底可反，
       会闪一下黑字。 */
    tl.to(countEl, { opacity: 0, duration: 0.35, ease: 'power2.in' });
    tl.to(fillEl, { scaleY: 0, duration: 0.7, ease: 'expo.inOut' }, '-=0.1');

    tl.set(preloader, { display: 'none' });
  }

  /* ═══════════════════════════════════════════════════════════
     EFFECT 4 · HERO WARP
     The hero headline sits under a turbulence displacement map whose scale
     is pinned at zero, so at rest it costs nothing and looks untouched. The
     pointer arriving ramps the scale up; leaving ramps it back. Only the
     attribute moves, the text is never re-rendered.
     ═══════════════════════════════════════════════════════════ */
  function initHeroWarp() {
    const el = $('[data-warp]');
    const map = $('#heroWarpMap');
    if (!el || !map) return;
    if (reduce || isTouch) return;

    /* .cell-hero is pointer-events:none so the headline can never emit its
       own enter/leave. Hit-test the pointer instead: the warp still triggers,
       and swipes that start on the type keep reaching the poster host below.
       SplitText moves the painted line boxes away from the group box, so the
       hit area is taken from the split lines themselves -- testing the group
       alone puts the trigger band ~140px above the visible glyphs. */
    let on = false;
    const set = (next) => {
      if (next === on) return;
      on = next;
      gsap.to(map, {
        attr: { scale: next ? 34 : 0 },
        duration: next ? 1.1 : 1.4,
        ease: next ? 'power3.out' : 'power3.inOut',
        overwrite: 'auto'
      });
    };

    const boxes = [];
    const collect = () => {
      const lines = el.querySelectorAll('.split-line');
      boxes.length = 0;
      const src = lines.length ? lines : [el];
      for (let i = 0; i < src.length; i++) boxes.push(src[i]);
    };
    collect();
    /* autoSplit rebuilds the line boxes on resize / font swap, which moves the
       painted glyphs; a resize observer keeps the cached hit area honest. */
    if (window.ResizeObserver) new ResizeObserver(collect).observe(el);
    window.addEventListener('resize', collect, { passive: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(collect);

    const hit = (x, y) => {
      for (let i = 0; i < boxes.length; i++) {
        const r = boxes[i].getBoundingClientRect();
        if (!r.width || !r.height) continue;
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
      }
      return false;
    };

    window.addEventListener('pointermove', (e) => {
      set(hit(e.clientX, e.clientY));
    }, { passive: true });

    window.addEventListener('blur', () => set(false));
    document.addEventListener('mouseleave', () => set(false));
  }

  /* hero type reveal, fired once the preloader clears */
  function heroReveal() {
    /* .cell-hero, not .intro-inner: the headline is a body-level floating
       overlay now, it left the hero's stacking context on purpose (see the
       comment in index.html). */
    const groups = $$('.cell-hero [data-reveal="text"]');
    const others = $$('.cell-hero [data-reveal="div"]');

    groups.forEach((el) => {
      const split = splitLines(el);
      const targets = split ? split.lines : [el];
      el.style.visibility = 'visible';
      gsap.set(targets, { yPercent: 108 });
      gsap.to(targets, {
        yPercent: 0,
        duration: 1.15,
        ease: 'hero-out',
        stagger: 0.075,
        delay: 0.05
      });
    });

    /* nothing carries data-reveal="div" inside the intro any more — the tile
       wall moved to the palette dock — and an empty target makes GSAP warn */
    if (others.length) {
      gsap.to(others, {
        opacity: 1, y: 0, duration: .9, stagger: .06, ease: 'power2.out',
        startAt: { opacity: 0, y: 18 },
        onStart: () => others.forEach((o) => (o.style.visibility = 'visible'))
      });
    }
  }

  /* ═══════════════════════════════════════════════════════════
     HERO TITLE · 悬浮 + 滚动淡出
     The hero headline is a fixed overlay now (see .cell-hero): it stays put
     while the page scrolls away underneath and fades out on scroll instead.

     The trigger is .intro, never the headline itself — a fixed element's rect
     is pinned to the viewport, so ScrollTrigger would measure a zero-length
     range from it and the fade would never advance.

     No pointer-events juggling needed on the way out: .cell-hero is
     pointer-events:none already, so the invisible title never intercepts a
     click meant for the content that scrolled up behind it.
     ═══════════════════════════════════════════════════════════ */
  function initHeroTitleFade() {
    const el = $('.cell-hero');
    if (!el) return;

    /* prefers-reduced-motion: no scrubbed interpolation, but the title still
       has to leave once the hero is gone — otherwise it hangs over the next
       section forever, which is worse than any motion. */
    if (reduce) {
      ScrollTrigger.create({
        trigger: '.intro',
        start: 'top top-=30%',
        once: true,
        onEnter: () => gsap.set(el, { opacity: 0 })
      });
      return;
    }

    gsap.to(el, {
      opacity: 0,
      ease: 'none',
      scrollTrigger: {
        trigger: '.intro',
        start: 'top top',
        end: '+=40%',
        scrub: 0.6,
        invalidateOnRefresh: true
      }
    });
  }

  function revealAll() {
    $$('[data-reveal]').forEach((el) => (el.style.visibility = 'visible'));
  }

  /* ═══════════════════════════════════════════════════════════
     EFFECT 3 · SCROLL-SCRUBBED TEXT BLUR
     Below-the-fold copy sits blurred and sharpened continuously
     as the wheel drives it through the viewport.
     ═══════════════════════════════════════════════════════════ */
  function initScrubBlur() {
    $$('[data-scrub-reveal]').forEach((el) => {
      if (reduce) { el.style.visibility = 'visible'; return; }

      const split = splitLines(el);
      const targets = split ? split.lines : [el];
      el.style.visibility = 'visible';

      gsap.fromTo(targets,
        { filter: 'blur(16px)', opacity: 0.12, yPercent: 14 },
        {
          filter: 'blur(0px)',
          opacity: 1,
          yPercent: 0,
          ease: 'none',
          stagger: 0.4,
          scrollTrigger: {
            trigger: el,
            start: 'top 92%',
            end: 'top 30%',
            scrub: 0.9,
            invalidateOnRefresh: true
          }
        });
    });
  }

  /* ═══════════════════════════════════════════════════════════
     GENERIC REVEALS
     ═══════════════════════════════════════════════════════════ */
  function initReveals() {
    // masked line reveals
    $$('[data-reveal="text"]').forEach((el) => {
      if (el.closest('.cell-hero')) return;             // handled by heroReveal
      if (reduce) { el.style.visibility = 'visible'; return; }

      const split = splitLines(el);
      const targets = split ? split.lines : [el];

      ScrollTrigger.create({
        trigger: el,
        start: 'top 88%',
        once: true,
        onEnter: () => {
          el.style.visibility = 'visible';
          gsap.fromTo(targets,
            { yPercent: 112 },
            { yPercent: 0, duration: 1.05, ease: 'hero-out', stagger: 0.07, delay: 0.05 });
        }
      });
    });

    // plain block reveals
    $$('[data-reveal="div"], [data-reveal="w"]').forEach((el) => {
      if (el.closest('.cell-hero')) return;
      if (reduce) { el.style.visibility = 'visible'; return; }

      ScrollTrigger.create({
        trigger: el,
        start: 'top 90%',
        once: true,
        onEnter: () => {
          el.style.visibility = 'visible';
          gsap.fromTo(el,
            { opacity: 0, y: 26 },
            { opacity: 1, y: 0, duration: .9, ease: 'power2.out' });
        }
      });
    });
  }

  function initParallax() {
    $$('[data-parallax="img"] img').forEach((img) => {
      gsap.fromTo(img,
        { yPercent: -6, scale: 1.1 },
        {
          yPercent: 6,
          ease: 'none',
          scrollTrigger: { trigger: img, start: 'top bottom', end: 'bottom top', scrub: true }
        });
    });
  }

  /* ═══════════════════════════════════════════════════════════
     EFFECT 2 · FLUID REVEAL + NAME SCENE
     The fluid erodes a cover; the name underneath is what the cover
     is cut away from. The name turns its own treatment on a clock and
     is not connected to the pointer at all -- the pointer's only job
     here is taking the cover away.
     ═══════════════════════════════════════════════════════════ */
  let fluid = null;
  let poster = null;

  function initPoster() {
    const host = $('[data-poster]');
    if (!host || !window.Poster) return;
    if (isTouch || reduce) { host.style.display = 'none'; return; }

    poster = Poster.create(host);
    if (!poster) { host.style.display = 'none'; return; }

    /* Nothing is wired to onLoop on purpose. The lap used to reseed the
       cover on the theory that a finished cycle left a hole behind --
       it does not. The poster only cycles how MCLARY is drawn (solid,
       sparse, halftone, outline) and never moves anything, and the
       track the pointer cut is the user's own, which the recovery pass
       already closes on its own clock. Reseeding threw all of it away
       every twenty seconds. */
  }

  function initFluid() {
    const host = $('[data-fluid-reveal]');
    if (!host) return;
    if (isTouch || reduce) { host.style.display = 'none'; return; }

    const bg = getComputedStyle(document.body).getPropertyValue('--bg').trim() || '#ffffff';

    try {
      fluid = FluidCover.create(host, {
        color: bg,
        simRes: 128,
        dyeRes: 1024,
        /* force and curl are both far below the 5400 / 50 this started
           on, and that is the point rather than a side effect. Momentum
           is what smears a mass into a ribbon behind the pointer, and
           vorticity is what frays its edge; a blob only reads as a blob
           while it is still sitting roughly where it was put. */
        radius: 0.0036,
        force: 2600,
        curl: 28,
        /* How wide the hole the pointer opens in the cover is, as a
           fraction of the dab the velocity field gets. It is a separate
           multiplier precisely so the reveal can be resized without
           touching the fluid: `radius` is how much momentum the pointer
           injects and how the dye then spreads, and turning that down
           instead would shrink the wake along with the hole and take the
           trail with it. */
        dyeRadiusMul: 0.90,
        /* How much cover density one dab removes at its centre, and
           therefore where the visible edge lands: the hole is the set
           of points where this has pushed the density under `edge`, so
           the visible radius goes as the square root of log(1/edge) and
           every other number here has to be read through it.

           That coupling is the trap. Turning it down does not soften the
           edge, it shrinks the hole and eventually deletes it -- an
           earlier pass put it at 0.9 against an `edge` of 0.30, which
           needs 0.7 removed, so no point in the dab ever crossed the
           threshold and the reveal stopped happening at all. Anything
           under about 1.0 is a hole you cannot see. It is back at the
           1.5 it has always had; the area came down through `radius`
           instead, which is the knob that does what it looks like. */
        erode: 1.5,
        /* Twice the old 0.006, and this is load-bearing for the shape
           rather than cosmetic: the dabs are spaced further apart now,
           so scattering them off the travel line is what keeps a stroke
           from reading as a row of beads. */
        jitter: 0.014,
        /* How far the pointer travels between two dabs, as a multiple of
           the visible blob radius. This is the knob that makes a slow
           drag look like a slow drag instead of a smooth ribbon, and it
           is here rather than buried in fluid.js because it is a design
           decision, not a simulation constant. Raise it and the stroke
           breaks into separate spots; lower it and the dabs bury
           themselves in each other again. */
        dabSpacing: 0.5,
        /* The per-frame thread that keeps the trail from growing in
           jumps between spaced dabs. Below about 0.15 it would take ten
           frames to cross the visible threshold and the mark would lag
           the cursor; much above 0.35 and a single pass becomes visible
           on its own, which puts a soft thread back on the outline and
           starts smoothing the lobes the spacing exists to keep. */
        seamStrength: 0.22,
        /* The reveal does not fade on a timer. It holds -- the hole stays
           at full size for these many seconds -- and then closes, fast,
           along a quadratic. A constant fade rate is the wrong shape
           here even though it looks like one: it spends most of the hole's
           life as a faint stain and gives the pointer almost nothing to
           push against. Hold-then-close is what makes the gesture read.

           The curve runs from the hold to fully covered in one second
           after it, so a mark is finally gone at about 3.1s. The hold is
           what sets the total, and it is deliberately generous: the old
           constant fade spread the same 2.2s thin and fast, and the
           thing worth keeping is the mark sitting there long enough to
           be looked at before it is taken away. A shorter hold would
           have shortened the trail as a side effect of reshaping it. */
        recoverHold: 2.6,
        recoverRate: 0.30,
        /* A tighter ramp than the old 0.14. A blob whose edge snaps on
           over four hundredths of a unit reads as a cut-out stencil;
           this one still bleeds, just not so far that the silhouette
           stops being legible. */
        edge: 0.30
      });
    } catch (e) {
      console.warn('[fluid] init failed', e);
    }
  }

  /* ═══════════════════════════════════════════════════════════
     TOOL + THEME SWITCHER
     Every swatch is one tool in one colour. Picking it repaints
     the whole site and swaps the working panel below the hero.
     ═══════════════════════════════════════════════════════════ */
  let activeTool = null;
  let activeTheme = '2';

  function initThemes() {
    const switches = $$('.palette-chip');
    const overlay = $('.theme-overlay');
    const dot = overlay ? $('.theme-overlay span') : null;
    const toggle = $('[data-palette-toggle]');
    const ids = (window.Tools && window.Tools.ids()) || [];

    /* Persist the tool, not the colour — the colour is derived from the
       tool, so the two can never drift apart on reload. */
    const stored = (() => { try { return sessionStorage.getItem('tool-id'); } catch (e) { return null; } })();
    const declared = (document.body.className.match(/tool-(\w+)/) || [])[1];

    activeTool = (stored && ids.indexOf(stored) > -1) ? stored
               : (declared && ids.indexOf(declared) > -1) ? declared
               : 'home';

    const sw0 = switches.filter((s) => s.dataset.tool === activeTool)[0];
    activeTheme = sw0 ? sw0.dataset.theme : '0';
    function apply(i) {
      document.body.className = document.body.className.replace(/theme-\d+/g, '').trim() + ' theme-' + i;
      let on = null;
      switches.forEach((s) => {
        const hit = s.dataset.tool === activeTool;
        if (hit) on = s;
        s.classList.toggle('is-active', hit);
        if (hit) s.setAttribute('aria-current', 'page');
        else s.removeAttribute('aria-current');
      });
      /* the closed button reads out which of the twelve you are on */
      if (on) {
        toggle.dataset.cur = $('.chip-name', on).textContent.trim();
        if (toggle.getAttribute('aria-expanded') !== 'true') {
          toggle.setAttribute('aria-label', '打开调色盘 · 当前 ' + toggle.dataset.cur);
        }
      }
      try { sessionStorage.setItem('tool-id', activeTool); } catch (e) {}

      const bg = getComputedStyle(document.body).getPropertyValue('--bg').trim();
      if (fluid) fluid.setColor(bg);
      /* The poster is deliberately not theme-bound any more: one white sheet
         and one ink, the same in all fifteen palettes. */
    }

    /* one entry point, shared by the swatches and the tool-index rows */
    function select(toolId, themeIdx, origin) {
      if (window.Palette && window.Palette.isBusy()) return;
      if (toolId) activeTool = toolId;
      if (themeIdx != null) activeTheme = String(themeIdx);

      const from = origin || switches.filter((s) => s.dataset.tool === activeTool)[0];
      const fromSwatch = !!(from && from.classList.contains('palette-chip'));

      const commit = () => {
        apply(activeTheme);
        if (window.Tools) window.Tools.activate(activeTool);
        /* A dock swatch means "go there", not just "repaint". The swap runs
           under the veil, so the scroll starts while the screen is still
           covered and the two read as one move. Home has no tool bench to
           land on, so it goes back to the top of the page instead. */
        if (fromSwatch) {
          if (activeTool === 'home') lenis.scrollTo(0, { duration: 1.2 });
          else lenis.scrollTo('#tools', { offset: 0, duration: 1.2 });
        }
      };

      /* a swatch takes the screen over in its own colour; the index rows
         keep the small dot wipe. Two different entrances on purpose. */
      if (fromSwatch) {
        if (window.Palette && window.Palette.takeover) window.Palette.takeover(from, commit);
        else commit();
      } else if (dot && !reduce && from) {
        const r = from.getBoundingClientRect();
        gsap.set(dot, { x: r.left + r.width / 2, y: r.top + r.height / 2, scale: 1, transformOrigin: '50% 50%' });
        gsap.timeline()
          .to(dot, { scale: 260, duration: 0.7, ease: 'expo.inOut' })
          .add(commit)
          .to(dot, { scale: 0, duration: 0.55, ease: 'expo.inOut' });
      } else {
        commit();
      }
    }

    switches.forEach((sw) => {
      sw.addEventListener('click', () => {
        select(sw.dataset.tool, sw.dataset.theme, sw);
      });
    });

    apply(activeTheme);

    /* the nav's "首页" entry is the same state as chip 00, but it arrives
       from a full-screen menu — hand it the dot wipe, not the takeover */
    window.__selectTool = function (toolId) {
      const t = (switches.filter((s) => s.dataset.tool === toolId)[0]);
      if (t) select(toolId, t.dataset.theme, null);
    };

    if (window.Tools) {
      window.Tools.init({
        initial: activeTool,
        onPick: (toolId, themeIdx) => {
          const same = (toolId === activeTool);
          select(toolId, themeIdx, null);
          if (!same) lenis.scrollTo('#tools', { offset: 0, duration: 1.2 });
        }
      });
    }
  }

  /* A palette of colour wells. The paper remains independent of the selected tool. */
  function initPalette() {
    const root = $('[data-palette]');
    const toggle = $('[data-palette-toggle]');
    const panel = $('#palette-panel');
    const veil = $('[data-palette-veil]');
    if (!root || !toggle || !panel || !veil) return;

    const close = $('[data-palette-close]', panel);
    const chips = $('.palette-chip', panel);
    const circle = (radius, x, y) => `circle(${radius}px at ${x}px ${y}px)`;
    const reach = (x, y) => Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 4;
    function dockOrigin() {
      const r = toggle.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    let open = false;
    let busy = false;
    let previousOverflow = '';
    let background = [];

    function modal(state) {
      open = state;
      toggle.setAttribute('aria-expanded', String(state));
      toggle.setAttribute('aria-label', state ? '关闭调色盘' : '打开调色盘 · 当前 ' + (toggle.dataset.cur || ''));
      if (state) {
        previousOverflow = document.body.style.overflow;
        background = Array.from(document.body.children)
          .filter(el => ![root, $('#cursor')].includes(el) && !['SCRIPT', 'STYLE'].includes(el.tagName))
          .map(el => [el, el.inert]);
        background.forEach(([el]) => { el.inert = true; });
        document.body.style.overflow = 'hidden';
        lenis.stop();
        panel.inert = false;
        panel.setAttribute('aria-hidden', 'false');
      } else {
        background.forEach(([el, inert]) => { el.inert = inert; });
        background = [];
        document.body.style.overflow = previousOverflow;
        // A navigation menu may already have stopped Lenis before opening.
        if (!$('.nav-menu.is-open')) lenis.start();
        toggle.focus({ preventScroll: true });
        panel.inert = true;
        panel.setAttribute('aria-hidden', 'true');
      }
    }

    function show() {
      if (busy || open) return;
      busy = true;
      panel.scrollTop = 0;
      modal(true);
      gsap.set(panel, { autoAlpha: 1, clearProps: 'clipPath' });
      close.focus({ preventScroll: true });
      if (reduce) { busy = false; return; }
      const { x, y } = dockOrigin();
      gsap.timeline({ onComplete: () => { gsap.set(panel, { clearProps: 'clipPath' }); busy = false; } })
        .fromTo(panel, { clipPath: circle(0, x, y) }, { clipPath: circle(reach(x, y), x, y), duration: .65, ease: 'power3.inOut' })
        .fromTo(chips, { y: 18, opacity: 0, scale: .94 }, { y: 0, opacity: 1, scale: 1, duration: .42, stagger: .018, ease: 'power2.out', clearProps: 'transform,opacity' }, '-=.32');
    }

    function hide() {
      if (busy || !open) return;
      busy = true;
      modal(false);
      if (reduce) { gsap.set(panel, { autoAlpha: 0 }); busy = false; return; }
      const { x, y } = dockOrigin();
      gsap.fromTo(panel, { clipPath: circle(reach(x, y), x, y) }, { clipPath: circle(0, x, y), duration: .45, ease: 'power3.inOut', onComplete: () => {
        gsap.set(panel, { autoAlpha: 0, clearProps: 'clipPath' });
        busy = false;
      } });
    }

    function takeover(chip, done) {
      if (busy) return;
      if (!open) { if (done) done(); return; }
      busy = true;
      veil.style.setProperty('--tile', getComputedStyle(chip).getPropertyValue('--tile').trim());
      if (reduce) {
        modal(false);
        gsap.set(panel, { autoAlpha: 0 });
        if (done) done();
        busy = false;
        return;
      }
      const swatch = $('.chip-swatch', chip).getBoundingClientRect();
      const x = swatch.left + swatch.width / 2, y = swatch.top + swatch.height / 2;
      gsap.timeline({ onComplete: () => { busy = false; } })
        .fromTo(veil, { opacity: 1, clipPath: circle(swatch.width / 2, x, y) }, { clipPath: circle(reach(x, y), x, y), duration: .55, ease: 'power3.inOut' })
        .add(() => {
          modal(false);
          gsap.set(panel, { autoAlpha: 0 });
          if (done) done();
        })
        .to(veil, { opacity: 0, duration: .4, ease: 'power2.out', clearProps: 'clipPath' });
    }

    toggle.addEventListener('click', () => { if (open) hide(); else show(); });
    close.addEventListener('click', hide);
    document.addEventListener('keydown', e => {
      if (!open) return;
      if (e.key === 'Escape') { e.preventDefault(); hide(); }
      if (e.key !== 'Tab') return;
      const buttons = $$('button', panel);
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    window.Palette = { takeover, isBusy: () => busy };
  }


  /* ═══════════════════════════════════════════════════════════
     NAV
     ═══════════════════════════════════════════════════════════ */
  function initNav() {
    /* The logo is the same "go home" gesture as the menu's 首页 entry, minus
       the menu: pick the home state, then scroll to the top. Wired here rather
       than in initThemes because initThemes owns the state and this owns
       lenis — the two halves of the navigation belong in the same place. It
       sits above the nav guard so a missing menu cannot cost us the logo. */
    const logo = $('[data-logo-home]');
    if (logo) {
      logo.addEventListener('click', () => {
        if (window.__selectTool) window.__selectTool('home');
        const t = document.querySelector('#top');
        if (t) lenis.scrollTo(t, { offset: 0, duration: 1.2 });
      });
    }

    const btn = $('[data-nav="button"]');
    const menu = $('#nav-menu');
    if (!btn || !menu) return;

    const links = $$('.menu-link', menu);
    let open = false;

    gsap.set(menu, { clipPath: 'inset(0% 0% 100% 0%)' });
    gsap.set(links, { yPercent: 110, opacity: 0 });

    function toggle(force) {
      open = typeof force === 'boolean' ? force : !open;
      btn.setAttribute('aria-expanded', String(open));
      menu.setAttribute('aria-hidden', String(!open));
      menu.classList.toggle('is-open', open);
      document.body.style.overflow = open ? 'hidden' : '';

      if (open) {
        lenis.stop();
        gsap.timeline()
          .to(menu, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.75, ease: 'ease-io' })
          .to(links, { yPercent: 0, opacity: 1, duration: 0.7, stagger: 0.06, ease: 'hero-out' }, '-=0.4');
      } else {
        lenis.start();
        gsap.timeline()
          .to(links, { yPercent: 110, opacity: 0, duration: 0.35, stagger: 0.03, ease: 'power2.in' })
          .to(menu, { clipPath: 'inset(0% 0% 100% 0%)', duration: 0.6, ease: 'ease-io' }, '-=0.15');
      }
    }

    btn.addEventListener('click', () => toggle());
    links.forEach((a) => a.addEventListener('click', (e) => {
      const href = a.getAttribute('href') || '';
      if (href.startsWith('#')) {
        e.preventDefault();
        toggle(false);
        if (a.hasAttribute('data-goto-home') && window.__selectTool) window.__selectTool('home');
        const t = document.querySelector(href);
        if (t) lenis.scrollTo(t, { offset: 0, duration: 1.2 });
      }
    }));

    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) toggle(false); });
  }

  /* ═══════════════════════════════════════════════════════════
     STICKY NAME BAR
     ═══════════════════════════════════════════════════════════ */
  function initStickyName() {
    const bar = $('.sticky-name');
    if (!bar) return;
    gsap.set(bar, { yPercent: 110 });

    const show = gsap.quickTo(bar, 'yPercent', { duration: 0.6, ease: 'power3.out' });
    ScrollTrigger.create({
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => {
        const y = window.scrollY || document.documentElement.scrollTop;
        show(y > window.innerHeight * 1.1 && self.progress < 0.94 ? 0 : 110);
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════
     CUSTOM SCROLLBAR
     ═══════════════════════════════════════════════════════════ */
  function initScrollbar() {
    const thumb = $('.scrollbar-thumb');
    if (!thumb) return;
    const setY = gsap.quickTo(thumb, 'y', { duration: 0.2, ease: 'power2.out' });

    function update() {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const p = max > 0 ? (window.scrollY || doc.scrollTop) / max : 0;
      const trackH = window.innerHeight - 8;
      setY(p * Math.max(0, trackH - 16));
    }
    lenis.on('scroll', update);
    window.addEventListener('resize', update);
    update();
  }

  /* ═══════════════════════════════════════════════════════════
     FOOTER WORDMARK
     Two jobs, both cheap:

     1. fit — the row is laid out at a provisional 100px, measured,
        and re-set to whatever size makes it span the container
        exactly. Full-bleed at any width without a single
        letter-spacing guess, and without scaling glyphs sideways.
     2. pull — each glyph springs toward the pointer with a distance
        falloff, stretches and rotates, and drags a red and a blue
        ghost of itself along the pull vector. That offset pair is
        the chromatic aberration; the spring is the drag.
     ═══════════════════════════════════════════════════════════ */
  function initWordmark() {
    const wrap = $('[data-wordmark]');
    const row = $('[data-wm-row]');
    if (!wrap || !row) return;

    const PROBE = 100;
    const RADIUS = 0.22;         /* falloff reach, as a fraction of the mark's width */
    const PULL = 0.26;          /* how hard a glyph is dragged at full strength   */

    const letters = $$('.wm-ch', row).map((el) => {
      const r = $('.wm-r', el);
      const b = $('.wm-b', el);
      return {
        el, r, b,
        x: gsap.quickTo(el, 'x', { duration: .85, ease: 'elastic.out(1, .38)' }),
        y: gsap.quickTo(el, 'y', { duration: .85, ease: 'elastic.out(1, .38)' }),
        rot: gsap.quickTo(el, 'rotation', { duration: .95, ease: 'elastic.out(1, .5)' }),
        sx: gsap.quickTo(el, 'scaleX', { duration: .95, ease: 'elastic.out(1, .5)' }),
        sy: gsap.quickTo(el, 'scaleY', { duration: .7, ease: 'elastic.out(1, .55)' }),
        grx: gsap.quickTo(r, 'x', { duration: .55, ease: 'power3.out' }),
        gry: gsap.quickTo(r, 'y', { duration: .55, ease: 'power3.out' }),
        gro: gsap.quickTo(r, 'opacity', { duration: .35, ease: 'power2.out' }),
        gbx: gsap.quickTo(b, 'x', { duration: .7, ease: 'power3.out' }),
        gby: gsap.quickTo(b, 'y', { duration: .7, ease: 'power3.out' }),
        gbo: gsap.quickTo(b, 'opacity', { duration: .35, ease: 'power2.out' }),
        ox: 0, oy: 0, ow: 0, oh: 0
      };
    });

    /* ---------------------------------------------------- fit to the width */
    function fit() {
      row.style.fontSize = PROBE + 'px';
      measure();
      /* The row is a block-level flex box, so its own rect is the
         container width, not the width of the type. The mark's real
         width is the furthest right edge of the last glyph. */
      let natural = 0;
      for (const L of letters) natural = Math.max(natural, L.ox + L.ow);
      if (!natural) return;
      /* CSS puts letter-spacing after the last glyph too, so the measured
         right edge sits one track past the ink. Take it back off, or the
         solved mark rests a few pixels short of the margin. */
      const track = parseFloat(getComputedStyle(row).letterSpacing) || 0;
      natural -= track;
      if (natural <= 0) return;
      /* 0.998 keeps the solved mark a hair inside the margins, so a
         sub-pixel overflow can never trigger a horizontal scrollbar */
      row.style.fontSize = (PROBE * (wrap.clientWidth / natural) * 0.998) + 'px';
      measure();
    }

    /* Offsets, not viewport rects: a glyph is being transformed by the
       pull while we measure, and Lenis scrolls the page with a
       transform rather than scrollTop, so both a rect read and a
       scroll offset would feed the effect its own output. offsetLeft
       and friends are pure layout and stay honest. */
    function measure() {
      letters.forEach((L) => {
        L.ox = L.el.offsetLeft;
        L.oy = L.el.offsetTop;
        L.ow = L.el.offsetWidth;
        L.oh = L.el.offsetHeight;
      });
    }

    function rest(L) {
      L.x(0); L.y(0); L.rot(0); L.sx(1); L.sy(1);
      L.grx(0); L.gry(0); L.gro(0);
      L.gbx(0); L.gby(0); L.gbo(0);
    }

    /* ------------------------------------------------------------- pointer */
    function onMove(e) {
      const reach = Math.max(120, wrap.clientWidth * RADIUS);
      const wr = wrap.getBoundingClientRect();
      const mx = e.clientX, my = e.clientY;

      for (const L of letters) {
        const cx = wr.left + L.ox + L.ow / 2;
        const cy = wr.top + L.oy + L.oh / 2;
        const dx = mx - cx;
        const dy = my - cy;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        if (d > reach) { rest(L); continue; }

        /* smoothstep the falloff so letters ease in rather than pop */
        let f = 1 - d / reach;
        f = f * f * (3 - 2 * f);
        if (f < 0.004) { rest(L); continue; }

        const nx = dx / d, ny = dy / d;
        L.x(dx * f * PULL);
        L.y(dy * f * PULL * 0.55);
        L.rot(dx * f * 0.055);
        L.sx(1 + f * 0.14);
        L.sy(1 + f * 0.15);

        /* the two ghosts split along the pull vector, hard red one way
           and softer blue the other, so the fringe reads as dispersion
           rather than a drop shadow. Kept on a short leash — push the
           offset and the word stops being a word. */
        const c = f * 18;
        L.gro(f * 0.85); L.grx(-nx * c); L.gry(-ny * c);
        L.gbo(f * 0.85); L.gbx(nx * c * 0.9); L.gby(ny * c * 0.9);
      }
    }

    if (!isTouch && !reduce) {
      wrap.addEventListener('pointermove', onMove, { passive: true });
      wrap.addEventListener('pointerleave', () => letters.forEach(rest), { passive: true });
    }

    const refit = () => {
      if (reduce) return;
      letters.forEach(rest);
      fit();
    };
    window.addEventListener('resize', refit);
    window.addEventListener('load', refit);
    /* webfonts change the natural width after first paint */
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit);

    if (!reduce) fit(); else measure();
  }

  /* ═══════════════════════════════════════════════════════════
     CUSTOM CURSOR
     ═══════════════════════════════════════════════════════════ */
  function initCursor() {
    if (isTouch || reduce) return;
    const cur = $('#cursor');
    if (!cur) return;

    const dot = $('.cursor-dot', cur);
    const ring = $('.cursor-ring', cur);
    const label = $('.cursor-label', cur);
    let x = window.innerWidth / 2, y = window.innerHeight / 2;
    let rx = x, ry = y;

    document.body.classList.add('has-cursor');
    gsap.set(cur, { opacity: 1 });

    window.addEventListener('pointermove', (e) => {
      x = e.clientX; y = e.clientY;
      gsap.set(dot, { x: x, y: y });
    }, { passive: true });

    gsap.ticker.add(() => {
      rx += (x - rx) * 0.16;
      ry += (y - ry) * 0.16;
      gsap.set(ring, { x: rx, y: ry });
    });

    /* Delegated so that elements created later — the tool results, for
       instance — get their label without re-running this setup. */
    let hovered = null;

    function enter(el) {
      const text = el.dataset.cursor || '';
      label.textContent = text;
      gsap.to(ring, { scale: text ? 2.6 : 1.9, duration: 0.4, ease: 'power3.out' });
      gsap.to(dot, { scale: 0, duration: 0.3 });
      gsap.to(label, { opacity: text ? 1 : 0, duration: 0.25 });
    }
    function leave() {
      gsap.to(ring, { scale: 1, duration: 0.4, ease: 'power3.out' });
      gsap.to(dot, { scale: 1, duration: 0.3 });
      gsap.to(label, { opacity: 0, duration: 0.2 });
    }

    document.addEventListener('pointerover', (e) => {
      const el = e.target && e.target.closest ? e.target.closest('[data-cursor]') : null;
      if (el === hovered) return;
      if (hovered) leave();
      hovered = el;
      if (el) enter(el);
    }, { passive: true });

    document.addEventListener('pointerout', (e) => {
      if (!hovered) return;
      const to = e.relatedTarget;
      if (to && hovered.contains && hovered.contains(to)) return;
      hovered = null;
      leave();
    }, { passive: true });

    document.addEventListener('pointerdown', () => gsap.to(ring, { scale: .8, duration: .2 }));
    document.addEventListener('pointerup',   () => gsap.to(ring, { scale: 1,   duration: .2 }));
  }

  /* ═══════════════════════════════════════════════════════════
     BOOT
     ═══════════════════════════════════════════════════════════ */
  function boot() {
    document.body.style.overflow = 'hidden';
    lenis.stop();

    initThemes();
    initPalette();
    initPoster();
    initFluid();
    initHeroWarp();
    initHeroTitleFade();
    initScrubBlur();
    initReveals();
    initParallax();
    initNav();
    initStickyName();
    initScrollbar();
    initWordmark();
    initCursor();

    document.fonts && document.fonts.ready.then(() => ScrollTrigger.refresh());

    runPreloader();
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(boot, 0);
  } else {
    document.addEventListener('DOMContentLoaded', boot);
  }

  // safety cap: never leave the visitor stuck behind the preloader
  setTimeout(() => {
    if (!document.body.classList.contains('is-loaded') && preloader) {
      gsap.killTweensOf('*', false);
      gsap.set(fillEl, { scaleY: 0 });
      preloader.style.display = 'none';
      document.body.classList.add('is-loaded');
      document.body.style.overflow = '';
      lenis.start();
      revealAll();
    }
  }, 9000);

  window.__replica = {
    lenis: lenis,
    get fluid() { return fluid; },
    get poster() { return poster; },
    ScrollTrigger: ScrollTrigger
  };
})();
