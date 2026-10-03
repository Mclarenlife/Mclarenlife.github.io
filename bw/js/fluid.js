/* ==========================================================================
   fluid.js -- WebGL fluid-simulation cover for the hero block.

   A full-screen opaque "cover" is painted in the page background colour.
   Pointer velocity injects force into a Navier-Stokes solver; the solver
   advects a scalar field that erodes the cover wherever the fluid has
   been. Tiles sitting underneath are therefore uncovered by moving the
   pointer, then slowly flood back.

   Exposes:  window.FluidCover.create(element, options) -> handle
   ========================================================================== */
(function (global) {
  'use strict';

  /* ---------------------------------------------------------------- shaders */

  var VERT_BASE = [
    'precision highp float;',
    'attribute vec2 aPosition;',
    'varying vec2 vUv;',
    'varying vec2 vL, vR, vT, vB;',
    'void main () {',
    '  vUv = aPosition * 0.5 + 0.5;',
    '  vL = vUv - vec2(1.0, 0.0);',
    '  vR = vUv + vec2(1.0, 0.0);',
    '  vT = vUv + vec2(0.0, 1.0);',
    '  vB = vUv - vec2(0.0, 1.0);',
    '  gl_Position = vec4(aPosition, 0.0, 1.0);',
    '}'
  ].join('\n');

  /* manual bilinear, so we never depend on float-linear filtering */
  var BILERP = [
    'vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {',
    '  vec2 st = uv / tsize - 0.5;',
    '  vec2 iuv = floor(st);',
    '  vec2 fuv = fract(st);',
    '  vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);',
    '  vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);',
    '  vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);',
    '  vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);',
    '  return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);',
    '}'
  ].join('\n');

  var F_ADVECT = [
    'precision highp float;',
    'precision highp sampler2D;',
    'varying vec2 vUv;',
    'uniform sampler2D uVelocity;',
    'uniform sampler2D uSource;',
    'uniform vec2 texelSize;',
    'uniform vec2 dyeTexelSize;',
    'uniform float dt;',
    'uniform float dissipation;',
    BILERP,
    'void main () {',
    '  vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;',
    '  vec4 result = bilerp(uSource, coord, dyeTexelSize);',
    '  float decay = 1.0 + dissipation * dt;',
    '  gl_FragColor = result / decay;',
    '}'
  ].join('\n');

  var F_DIVERGENCE = [
    'precision highp float;',
    'precision highp sampler2D;',
    'varying vec2 vUv, vL, vR, vT, vB;',
    'uniform sampler2D uVelocity;',
    'void main () {',
    '  float L = texture2D(uVelocity, vL).x;',
    '  float R = texture2D(uVelocity, vR).x;',
    '  float T = texture2D(uVelocity, vT).y;',
    '  float B = texture2D(uVelocity, vB).y;',
    '  vec2 C = texture2D(uVelocity, vUv).xy;',
    '  if (vL.x < 0.0) { L = -C.x; }',
    '  if (vR.x > 1.0) { R = -C.x; }',
    '  if (vT.y > 1.0) { T = -C.y; }',
    '  if (vB.y < 0.0) { B = -C.y; }',
    '  gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);',
    '}'
  ].join('\n');

  var F_CURL = [
    'precision highp float;',
    'precision highp sampler2D;',
    'varying vec2 vUv, vL, vR, vT, vB;',
    'uniform sampler2D uVelocity;',
    'void main () {',
    '  float L = texture2D(uVelocity, vL).y;',
    '  float R = texture2D(uVelocity, vR).y;',
    '  float T = texture2D(uVelocity, vT).x;',
    '  float B = texture2D(uVelocity, vB).x;',
    '  gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);',
    '}'
  ].join('\n');

  var F_VORTICITY = [
    'precision highp float;',
    'precision highp sampler2D;',
    'varying vec2 vUv, vL, vR, vT, vB;',
    'uniform sampler2D uVelocity;',
    'uniform sampler2D uCurl;',
    'uniform float curl;',
    'uniform float dt;',
    'void main () {',
    '  float L = texture2D(uCurl, vL).x;',
    '  float R = texture2D(uCurl, vR).x;',
    '  float T = texture2D(uCurl, vT).x;',
    '  float B = texture2D(uCurl, vB).x;',
    '  float C = texture2D(uCurl, vUv).x;',
    '  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));',
    '  force /= length(force) + 0.0001;',
    '  force *= curl * C;',
    '  force.y *= -1.0;',
    '  vec2 vel = texture2D(uVelocity, vUv).xy;',
    '  vel += force * dt;',
    '  vel = min(max(vel, -1000.0), 1000.0);',
    '  gl_FragColor = vec4(vel, 0.0, 1.0);',
    '}'
  ].join('\n');

  var F_PRESSURE = [
    'precision highp float;',
    'precision highp sampler2D;',
    'varying vec2 vUv, vL, vR, vT, vB;',
    'uniform sampler2D uPressure;',
    'uniform sampler2D uDivergence;',
    'void main () {',
    '  float L = texture2D(uPressure, vL).x;',
    '  float R = texture2D(uPressure, vR).x;',
    '  float T = texture2D(uPressure, vT).x;',
    '  float B = texture2D(uPressure, vB).x;',
    '  float divergence = texture2D(uDivergence, vUv).x;',
    '  gl_FragColor = vec4((L + R + B + T - divergence) * 0.25, 0.0, 0.0, 1.0);',
    '}'
  ].join('\n');

  var F_GRADIENT = [
    'precision highp float;',
    'precision highp sampler2D;',
    'varying vec2 vUv, vL, vR, vT, vB;',
    'uniform sampler2D uPressure;',
    'uniform sampler2D uVelocity;',
    'void main () {',
    '  float L = texture2D(uPressure, vL).x;',
    '  float R = texture2D(uPressure, vR).x;',
    '  float T = texture2D(uPressure, vT).x;',
    '  float B = texture2D(uPressure, vB).x;',
    '  vec2 velocity = texture2D(uVelocity, vUv).xy;',
    '  velocity.xy -= vec2(R - L, T - B);',
    '  gl_FragColor = vec4(velocity, 0.0, 1.0);',
    '}'
  ].join('\n');

  /* One soft mass, not one brush stroke. The outline is noise on the
     angle, but only three octaves of it, and all of them low: past about
     the fourth the lobes stop being lobes and become fur, which is the
     scale at which a shape reads as a bristle edge.

     The amplitude is the whole trick. An earlier pass had a wobble
     swinging only about a third of its mean, and a stroke of fourteen
     overlapping dabs turned that into a smooth envelope -- the lobes
     were there in each individual blob and averaged out of existence by
     the time the union was drawn. Irregularity has to be big relative
     to the size of the shape or it does not survive being overlapped.
     So the mean is 0.98 and the range runs 0.25 to 1.95, nearly eight to
     one, and the visible radius -- which goes as the square root of the
     wobbled radius -- still swings by a factor of 2.8 end to end.

     Mean-and-modulate rather than sum-and-floor is what lets a direction
     fall to 0.25: a neck that pinches the mass back toward its centre,
     which is the only thing that gives the silhouette an indent instead
     of letting the outline merely scallop outward. */
  var F_SPLAT = [
    'precision highp float;',
    'precision highp sampler2D;',
    'varying vec2 vUv;',
    'uniform sampler2D uTarget;',
    'uniform float uAspect;',
    'uniform vec3 uColor;',
    'uniform vec2 uPoint;',
    'uniform float uRadius;',
    'uniform float uErode;',
    'uniform float uSeed;',
    'uniform vec2 uStretch;',
    'uniform float uIsDye;',
    'float hash11(float p) {',
    '  p = fract(p * 0.1031);',
    '  p *= p + 33.33;',
    '  p *= p + p;',
    '  return fract(p);',
    '}',
    'float vnoise(float x) {',
    '  float i = floor(x);',
    '  float f = fract(x);',
    '  f = f * f * (3.0 - 2.0 * f);',
    '  return mix(hash11(i), hash11(i + 1.0), f);',
    '}',
    'void main () {',
    '  vec2 p = vUv - uPoint;',
    '  p.x *= uAspect;',
    // random orientation so blobs are skewed rather than round
    '  float a = uSeed * 6.2831853;',
    '  float ca = cos(a);',
    '  float sa = sin(a);',
    '  p = mat2(ca, -sa, sa, ca) * p;',
    '  p /= max(uStretch, vec2(0.08));',
    '  float d2 = dot(p, p);',
    // No angular warp here at all, and that is not a simplification.
    // Warping the angle before sampling the radius on it only works
    // while d(ang)/d(ang0) stays positive. An earlier pass ran the two
    // warps at 2.60 and 1.30 rad, which with vnoise's slope puts that
    // derivative well past 1 in places, and where it crosses zero the
    // outline folds back through itself: the mass came out wearing a
    // row of identical saw teeth instead of petals. The radius can
    // carry all the irregularity on its own, and it cannot fold.
    '  float ang = atan(p.y, p.x);',
    // The first two octaves are the petals and they carry almost all of
    // the swing. The last position-domain term is there so no axis
    // through the centre can be an axis of the shape.
    '  float wob = 0.25',
    '          + 1.05 * vnoise(ang * 0.85 + uSeed * 11.0)',
    '          + 0.45 * vnoise(ang * 1.75 - uSeed * 7.0)',
    '          + 0.22 * vnoise(ang * 3.10 + uSeed * 23.0)',
    '          + 0.14 * vnoise(d2 * 220.0 + uSeed * 61.0);',
    '  float rad = max(uRadius * wob, 1e-6);',
    '  float g = exp(-d2 / rad);',
    // Hard cut, and it is the edge that draws the shape: the visible
    // radius goes as the square root of this bound, so a generous tail
    // is what makes a dab sprawl to several times its nominal size and
    // read as a soft cloud. Nine radii is deep enough that the exp above
    // has died, and shallow enough that the mass keeps a boundary --
    // pushed to eleven it stopped being a shape and became an airbrush
    // gradient with a hint of an edge in the middle of it.
    '  g *= smoothstep(rad * 9.0, rad * 0.7, d2);',
    // No grain term. The 220/rad speckle that used to modulate the
    // interior by up to 60% was what made a dab read as dry pigment
    // caught on bristles; a mass has to be flat all the way through or
    // the eye finds the noise and calls it a tool mark.
    '  vec4 base = texture2D(uTarget, vUv);',
    // Component by component rather than vec4(base.xyz + uColor * g, 0.0,
    // 1.0): that is a vec3 followed by two floats, five arguments to a
    // four-argument constructor.
    '  gl_FragColor = vec4(base.x + uColor.x * g,',
    '                      base.y + uColor.y * g,',
    '                      base.z + uColor.z * g, 1.0);',
    '  gl_FragColor.r = clamp(gl_FragColor.r - uErode * g, 0.0, 1.0);',
    // This next line is the reset for the recovery clock, and it used to
    // be missing entirely. It is tempting to let the additive write above
    // do it, since green is the age -- but the dye pass passes uColor as
    // (0, 0, 0), so uColor.y * g is identically zero and that line leaves
    // green exactly as it found it. Painting therefore reset nothing: a
    // texel that had been sitting covered for a minute carried that
    // minute into the hole it was now part of, the recovery target was
    // saturated before the first frame, and the reveal closed itself
    // instantly. The reveal did not appear at all.
    //
    // It has to be gated on uIsDye. Written unconditionally it also
    // clobbered the velocity pass, whose green channel is the y impulse
    // the solver actually reads -- the field came out permanently still
    // and every blob sat exactly where it was laid down, with none of
    // the drift or curl the simulation exists to provide.
    //
    // Folding by the coverage rather than assigning zero outright keeps
    // this from stamping a hard age edge into the field: a dab resets the
    // texels under its core and leaves the ones out at the rim alone, the
    // same falloff the density uses.
    '  gl_FragColor.g = mix(gl_FragColor.g, base.y * (1.0 - g), uIsDye);',
    '}'
  ].join('\n');

  /* Slowly floods the cover back in -- but not at a constant rate, and
     the reason is worth writing down because the constant-rate version
     looks like it is doing this and is not.

     The old form was v += (1 - v) * k. That is correct as a fade and
     wrong as a reveal: the gap falls fastest at the instant it opens, so
     a hole the pointer just cut is already half gone a tenth of a second
     later, and what the eye is left watching is a faint stain that takes
     two more seconds to evaporate. That is the fast-then-slow shape.

     What is wanted here is the opposite. Hold the hole at full size, then
     take it away. So the value is driven toward a target that is a
     quadratic in elapsed time rather than chased exponentially, and the
     chase only ever moves the value up.

     "Elapsed time" is per texel, not global, which is the whole reason
     this shader can be written at all: green carries how long a texel
     has been left alone, a splat resets it to zero, and F_ADVECT carries
     it along with the dye so the age travels with the mass it belongs
     to. A single global clock could not do this -- regions painted at
     different moments would have to share one timer, and the last stroke
     would restart the wait on everything already on screen.

     The max() is load-bearing, not defensive. A texel that has never been
     painted sits at v = 1 with age 0, and the target at that moment is
     0, so an ordinary chase would pull the entire untouched cover down
     off the page at load. */
  var F_RECOVER = [
    'precision highp float;',
    'precision highp sampler2D;',
    'varying vec2 vUv;',
    'uniform sampler2D uTarget;',
    'uniform float uDt;',
    'uniform float uHold;',
    'uniform float uRate;',
    'void main () {',
    '  vec4 t = texture2D(uTarget, vUv);',
    '  float v = t.r;',
    '  float age = t.g + uDt;',
    '  float p = max(age - uHold, 0.0);',
    '  float target = min(p * p, 1.0);',
    '  float nv = v + (target - v) * uRate;',
    '  gl_FragColor = vec4(max(v, nv), age, 0.0, 1.0);',
    '}'
  ].join('\n');

  var F_SEED = [
    'precision highp float;',
    'uniform float uValue;',
    'void main () { gl_FragColor = vec4(uValue, 0.0, 0.0, 1.0); }'
  ].join('\n');

  /* uEdge is the density at which the cover stops being transparent, so
     the ramp above it is the only part of the recovery the eye actually
     sees -- and with a quadratic target that band is short. The cover
     density is 0 at the bottom of the curve and 1 at the top, and p * p
     spends most of its time down at the bottom, so a ramp of 0.15 put
     the entire visible close inside about an eighth of a second and the
     hole popped out of existence. Widening the ramp buys back the time
     the close takes without touching the edge itself: everything below
     uEdge is still fully transparent, so the silhouette is where it was. */
  var F_DISPLAY = [
    'precision highp float;',
    'precision highp sampler2D;',
    'varying vec2 vUv;',
    'uniform sampler2D uDye;',
    'uniform vec3 uColor;',
    'uniform float uEdge;',
    'void main () {',
    '  float d = texture2D(uDye, vUv).r;',
    '  float a = smoothstep(uEdge, uEdge + 0.22, d);',
    '  gl_FragColor = vec4(uColor * a, a);',
    '}'
  ].join('\n');

  /* ------------------------------------------------------------- utilities */

  function hexToRgb(hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex).trim());
    if (!m) return [1, 1, 1];
    return [
      parseInt(m[1], 16) / 255,
      parseInt(m[2], 16) / 255,
      parseInt(m[3], 16) / 255
    ];
  }

  /* IEEE 754 binary16 -> Number, for reading half-float targets back */
  function halfToFloat(h) {
    var s = (h & 0x8000) ? -1 : 1;
    var e = (h & 0x7C00) >> 10;
    var f = h & 0x03FF;
    if (e === 0) return s * Math.pow(2, -14) * (f / 1024);
    if (e === 0x1F) return f ? NaN : s * Infinity;
    return s * Math.pow(2, e - 15) * (1 + f / 1024);
  }

  /* --------------------------------------------------------- 2D fallback */

  /* Sample count for the fallback blob outline. High enough that three
     harmonics land on smooth curves, low enough that the path is not
     the most expensive thing on the page -- the fallback exists for
     machines with no WebGL, and it is already the slow path. */
  var LOBE_STEPS = 48;

  function createFallback(host, opts) {
    var cv = document.createElement('canvas');
    cv.className = 'fluid-canvas';
    cv.style.position = 'absolute';
    cv.style.inset = '0';
    cv.style.width = '100%';
    cv.style.height = '100%';
    cv.style.zIndex = '3';
    cv.style.pointerEvents = 'none';
    host.appendChild(cv);

    var ctx = cv.getContext('2d');
    var blobs = [];
    var raf = 0, last = 0, alive = true;
    var lastPt = { x: 0.5, y: 0.5, has: false };
    /* Same distance-based cadence as the WebGL path, and for the same
       reason: laying a fixed number of blobs down per pointer event
       repaints the same ground sixty times a second on a slow drag, and
       the union of that many overlapping outlines is a smooth hull. The
       two paths must not disagree about how a stroke is built. */
    var SPACING = opts.dabSpacing * Math.sqrt(opts.radius * opts.dyeRadiusMul) * 0.85;
    var carry = SPACING;

    function size() {
      var w = host.clientWidth, h = host.clientHeight;
      var dpr = Math.min(global.devicePixelRatio || 1, 1.5);
      cv.width = Math.max(1, Math.round(w * dpr));
      cv.height = Math.max(1, Math.round(h * dpr));
    }
    size();
    global.addEventListener('resize', size);

    function onMove(e) {
      var r = host.getBoundingClientRect();
      if (!r.width || !r.height) return;
      var x = (e.clientX - r.left) / r.width;
      var y = 1 - (e.clientY - r.top) / r.height;
      if (lastPt.has) {
        var mx = x - lastPt.x, my = y - lastPt.y;
        var len = Math.sqrt(mx * mx + my * my);
        var at = SPACING - carry;
        var fired = 0;
        while (len > 0 && at <= len && fired < 24) {
          var t = at / len;
          var bx = lastPt.x + mx * t;
          var by = lastPt.y + my * t;
          // jittered, narrow-range dabs instead of one clean circle
          blobs.push({
            x: bx + (Math.random() - 0.5) * 0.016,
            y: by + (Math.random() - 0.5) * 0.016,
            r: 0.09 + Math.random() * 0.06,
            age: 0,
            sx: 0.7 + Math.random() * 0.6,
            sy: 0.7 + Math.random() * 0.6,
            rot: Math.random() * Math.PI,
            seed: Math.random() * 100
          });
          at += SPACING;
          fired++;
        }
        carry = fired >= 24 ? 0 : len - (at - SPACING);
      }
      lastPt.x = x; lastPt.y = y; lastPt.has = true;
    }
    function onLeave() { lastPt.has = false; }
    host.addEventListener('pointermove', onMove, { passive: true });
    host.addEventListener('pointerleave', onLeave);

    function draw(t) {
      if (!alive) return;
      var dt = Math.min((t - last) / 1000 || 0.016, 0.033);
      last = t;
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.fillStyle = opts.color;
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.globalCompositeOperation = 'destination-out';
      for (var i = blobs.length - 1; i >= 0; i--) {
        var b = blobs[i];
        // Same curve as F_RECOVER, running the other way round. The WebGL
        // path raises a cover value toward an eased target; here the hole
        // is the thing being erased, so `open` is one minus the same
        // quadratic: full size for recoverHold seconds, then gone.
        b.age += dt;
        var p = Math.max(b.age - opts.recoverHold, 0);
        if (p >= 1) { blobs.splice(i, 1); continue; }
        var open = 1 - Math.min(p * p, 1);
        var rr = b.r * cv.width * 0.5 * (0.55 + (1 - open) * 1.15);
        var cx = b.x * cv.width, cy = b.y * cv.height;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(b.rot);
        ctx.scale(b.sx, b.sy);
        // Outline first, then the soft fill clipped inside it. Filling a
        // plain circle and hoping the gradient alone looks organic does
        // not work -- the silhouette is what the eye reads, and a
        // gradient that fades to nothing has no silhouette at all. Three
        // low harmonics on the radius, same mean-versus-modulation
        // structure as the WebGL path, so the two do not diverge.
        ctx.beginPath();
        for (var k = 0; k <= LOBE_STEPS; k++) {
          var th = (k / LOBE_STEPS) * Math.PI * 2;
          // mean 1.0 and a swing of nearly two to one either way, the
          // same range as the WebGL wobble; a shallow version of this
          // is what made the fallback read as a row of circles
          var mod = 1.00
            + 0.58 * Math.sin(th * 2 + b.seed)
            + 0.32 * Math.sin(th * 3 - b.seed * 1.7)
            + 0.18 * Math.sin(th * 5 + b.seed * 0.6);
          if (mod < 0.18) mod = 0.18;
          var lx = Math.cos(th) * rr * mod, ly = Math.sin(th) * rr * mod;
          if (k === 0) ctx.moveTo(lx, ly); else ctx.lineTo(lx, ly);
        }
        ctx.closePath();
        ctx.save();
        ctx.clip();
        var g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(1, rr));
        g.addColorStop(0, 'rgba(0,0,0,' + (open * 0.85).toFixed(3) + ')');
        g.addColorStop(0.62, 'rgba(0,0,0,' + (open * 0.65).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(-rr * 1.6, -rr * 1.6, rr * 3.2, rr * 3.2);
        ctx.restore();
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);

    return {
      isFallback: true,
      setColor: function (hex) { opts.color = hex; },
      probe: function () { return 'n/a (2D fallback)'; },
      destroy: function () {
        alive = false;
        cancelAnimationFrame(raf);
        global.removeEventListener('resize', size);
        host.removeEventListener('pointermove', onMove);
        host.removeEventListener('pointerleave', onLeave);
        cv.remove();
      }
    };
  }

  /* ----------------------------------------------------------------- main */

  function create(host, options) {
    var opts = Object.assign({
      simRes: 128,
      dyeRes: 0,                   // 0 = derive from element size
      pressureIterations: 20,
      recoverHold: 0.45,           // seconds a hole stays open before it starts closing
      recoverRate: 0.30,           // per-frame chase toward the eased target
      pressure: 0.8,
      curl: 42,
      radius: 0.0026,
      dyeRadiusMul: 1.0,
      erode: 0.9,
      force: 5200,
      jitter: 0.011,              // positional wobble of each dab
      dabSpacing: 0.5,            // pointer travel between dabs, in visible radii
      seamStrength: 0.22,         // per-frame thread; ~3 frames to become visible
      edge: 0.22,
      color: '#ffffff'
    }, options || {});

    var rgb = hexToRgb(opts.color);
    var canvas = host.querySelector('[data-fluid-canvas]') || host.querySelector('canvas');

    var gl =
      canvas.getContext('webgl', {
        alpha: true, premultipliedAlpha: true,
        depth: false, stencil: false, antialias: false
      }) ||
      canvas.getContext('experimental-webgl', {
        alpha: true, premultipliedAlpha: true
      });

    if (!gl) return createFallback(host, opts);

    ['OES_texture_half_float', 'OES_texture_float',
     'OES_texture_half_float_linear', 'OES_texture_float_linear',
     'WEBGL_color_buffer_float', 'WEBGL_color_buffer_half_float'
    ].forEach(function (n) { gl.getExtension(n); });

    var HALF = gl.HALF_FLOAT;

    /* Feature-detect a renderable float format rather than trusting any
       single extension string: some drivers expose WEBGL_color_buffer_float
       without WEBGL_color_buffer_half_float. */
    function renderable(internal, format, type) {
      var tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, 4, 4, 0, format, type, null);
      var fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fbo);
      gl.deleteTexture(tex);
      return ok;
    }

    var CANDIDATES = [
      [gl.RGBA, gl.RGBA, HALF],
      [gl.RGBA, gl.RGBA, gl.FLOAT]
    ];
    var FMT = null;
    for (var ci = 0; ci < CANDIDATES.length; ci++) {
      if (renderable(CANDIDATES[ci][0], CANDIDATES[ci][1], CANDIDATES[ci][2])) {
        FMT = CANDIDATES[ci];
        break;
      }
    }
    if (!FMT) {
      console.warn('[fluid] no renderable float format; using 2D fallback');
      return createFallback(host, opts);
    }

    gl.clearColor(0, 0, 0, 1);

    /* ------------------------------------------------------------ programs */

    function compile(type, src) {
      var sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        var log = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error(log || 'shader compile failed');
      }
      return sh;
    }

    function program(fs) {
      var p = gl.createProgram();
      var vs = compile(gl.VERTEX_SHADER, VERT_BASE);
      var fsh = compile(gl.FRAGMENT_SHADER, fs);
      gl.attachShader(p, vs);
      gl.attachShader(p, fsh);
      gl.bindAttribLocation(p, 0, 'aPosition');
      gl.linkProgram(p);
      gl.deleteShader(vs);
      gl.deleteShader(fsh);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        var log = gl.getProgramInfoLog(p);
        gl.deleteProgram(p);
        throw new Error(log || 'program link failed');
      }
      var u = {};
      var n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (var i = 0; i < n; i++) {
        var info = gl.getActiveUniform(p, i);
        u[info.name] = gl.getUniformLocation(p, info.name);
      }
      return { p: p, u: u };
    }

    var PROG;
    try {
      PROG = {
        advect: program(F_ADVECT),
        divergence: program(F_DIVERGENCE),
        curl: program(F_CURL),
        vorticity: program(F_VORTICITY),
        pressure: program(F_PRESSURE),
        gradient: program(F_GRADIENT),
        splat: program(F_SPLAT),
        recover: program(F_RECOVER),
        seed: program(F_SEED),
        display: program(F_DISPLAY)
      };
    } catch (err) {
      console.warn('[fluid] shader setup failed; using 2D fallback:', err);
      return createFallback(host, opts);
    }

    /* ------------------------------------------------------------ geometry */

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    function blit(target) {
      if (target === null || target === undefined) {
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      } else {
        gl.viewport(0, 0, target.width, target.height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      }
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }

    /* The upper bound on the shader's wobble, and on its stretch.

       0.25 + 1.05 + 0.45 + 0.22 + 0.14 is 2.11, which is the most a vnoise
       octave can reach in the same direction. The stretch ceiling is the
       top of dab()'s 0.34 + 0.95 range. Both exist only to size the
       scissor box below; neither is a tunable, and neither is read by the
       shader. */
    var WOB_MAX = 2.11;
    var STRETCH_MAX = 1.29;

    /* Draws a splat into only the part of the target it can possibly touch.

       A splat used to be a full-target blit, which sounds free at 128 for
       the velocity field but is not free at 1024 for the cover: the
       shader is the heaviest thing in the frame by a wide margin, with an
       atan and four value-noise octaves -- eight hash11 evaluations -- and
       two of those full-screen passes run on every frame the pointer
       moves. That is two million invocations of it per frame, and on an
       integrated part it is enough on its own to drop the frame rate far
       enough to read as stutter.

       The bound is exact rather than tuned, so it cannot clip a blob and
       introduce a straight edge across a soft cloud. F_SPLAT is identically
       zero outside d2 < rad * 9.0, i.e. outside a radius of 3*sqrt(rad),
       and rad is uRadius*wob, so the furthest a splat can possibly reach
       is 3*sqrt(uRadius*WOB_MAX) scaled by the wider stretch axis. The
       shader widens p.x by the aspect ratio before measuring, so the two
       axes are not symmetric in UV space and the box is not square.

       Worth roughly 2.2x on the cover and the same on the field, for a
       couple of lines and no change to what anything looks like. */
    function splatBlit(target, x, y, radius, stretch) {
      var reach = 3.0 * Math.sqrt(radius * WOB_MAX) *
                  Math.max(stretch[0], stretch[1]);
      var ex = reach * (target.height / target.width);
      var w = target.width, h = target.height;
      var x0 = Math.floor(x * w - ex * w) - 2;
      var x1 = Math.ceil((x + ex) * w) + 2;
      var y0 = Math.floor(y * h - reach * h) - 2;
      var y1 = Math.ceil((y + reach) * h) + 2;
      if (x0 < 0) x0 = 0;
      if (y0 < 0) y0 = 0;
      if (x1 > w) x1 = w;
      if (y1 > h) y1 = h;
      if (x1 <= x0 || y1 <= y0) return;
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(x0, y0, x1 - x0, y1 - y0);
      blit(target);
      gl.disable(gl.SCISSOR_TEST);
    }

    /* ------------------------------------------------------ textures / FBOs */

    function createFBO(w, h, format) {
      var tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, format[0], w, h, 0, format[1], format[2], null);

      var fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.viewport(0, 0, w, h);
      gl.clear(gl.COLOR_BUFFER_BIT);

      return {
        tex: tex,
        fbo: fbo,
        width: w,
        height: h,
        texelX: 1 / w,
        texelY: 1 / h,
        attach: function (id) {
          gl.activeTexture(gl.TEXTURE0 + id);
          gl.bindTexture(gl.TEXTURE_2D, tex);
          return id;
        }
      };
    }

    function createDoubleFBO(w, h, format) {
      return {
        read: createFBO(w, h, format),
        write: createFBO(w, h, format),
        swap: function () { var t = this.read; this.read = this.write; this.write = t; }
      };
    }

    function destroyFBO(t) {
      if (!t) return;
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fbo);
    }
    function destroyDouble(d) {
      if (!d) return;
      destroyFBO(d.read);
      destroyFBO(d.write);
    }

    var velocity = null, dye = null, divergence = null, curl = null, pressure = null;

    function getResolution(base) {
      var W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
      var aspect = W / H;
      if (aspect < 1) aspect = 1 / aspect;
      var lo = Math.round(base);
      var hi = Math.round(base * aspect);
      return W > H ? { width: hi, height: lo } : { width: lo, height: hi };
    }

    function initFramebuffers() {
      var sim = getResolution(opts.simRes);
      var dsz = getResolution(opts.dyeRes || 1024);
      var dw = Math.max(2, Math.min(dsz.width, gl.drawingBufferWidth));
      var dh = Math.max(2, Math.min(dsz.height, gl.drawingBufferHeight));

      destroyDouble(velocity); destroyDouble(dye);
      destroyFBO(divergence); destroyFBO(curl); destroyDouble(pressure);

      velocity = createDoubleFBO(sim.width, sim.height, FMT);
      dye = createDoubleFBO(dw, dh, FMT);
      divergence = createFBO(sim.width, sim.height, FMT);
      curl = createFBO(sim.width, sim.height, FMT);
      pressure = createDoubleFBO(sim.width, sim.height, FMT);

      // start fully covered, with a still velocity field
      seed(1, 0);
    }

    function seed(dyeValue, velValue) {
      gl.useProgram(PROG.seed.p);
      gl.uniform1f(PROG.seed.u.uValue, dyeValue);
      if (dye) { blit(dye.write); blit(dye.read); }
      gl.uniform1f(PROG.seed.u.uValue, velValue);
      if (velocity) { blit(velocity.write); blit(velocity.read); }
    }

    function resizeCanvas() {
      var w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return false;
      var dpr = Math.min(global.devicePixelRatio || 1, 1.5);
      var bw = Math.round(w * dpr), bh = Math.round(h * dpr);
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
        return true;
      }
      return false;
    }
    resizeCanvas();
    initFramebuffers();

    /* ------------------------------------------------------------- splats */

    /* Velocity and cover are written by two separate calls now, and the
       split is not tidiness -- they have genuinely different cadences.
       The cover wants a dab per fixed distance travelled, so that blobs
       stay apart and keep their silhouettes. The velocity field wants
       the pointer's motion every single frame, continuously.

       Driving both from the same dab loop is what made a slow drag
       stutter: a frame that had not yet covered a full spacing emitted
       nothing at all, so no momentum reached the fluid, and the frame
       after it dumped a whole dab's worth in one go. The field was
       being kicked in lumps, the dye it carries jumped, and the whole
       trail read as a dropped frame rate rather than as motion. */

    function splatVelocity(x, y, dx, dy, r, seed, stretch) {
      gl.useProgram(PROG.splat.p);
      gl.uniform1i(PROG.splat.u.uTarget, velocity.read.attach(0));
      gl.uniform1f(PROG.splat.u.uAspect, velocity.read.width / velocity.read.height);
      gl.uniform2f(PROG.splat.u.uPoint, x, y);
      gl.uniform3f(PROG.splat.u.uColor, dx, dy, 0);
      gl.uniform1f(PROG.splat.u.uRadius, r);
      gl.uniform1f(PROG.splat.u.uErode, 0);
      gl.uniform1f(PROG.splat.u.uSeed, seed);
      gl.uniform2f(PROG.splat.u.uStretch, stretch[0], stretch[1]);
      gl.uniform1f(PROG.splat.u.uIsDye, 0);
      splatBlit(velocity.write, x, y, r, stretch);
      velocity.swap();
    }

    function splatDye(x, y, r, erode, seed, stretch) {
      gl.useProgram(PROG.splat.p);
      gl.uniform1i(PROG.splat.u.uTarget, dye.read.attach(0));
      gl.uniform1f(PROG.splat.u.uAspect, dye.read.width / dye.read.height);
      gl.uniform2f(PROG.splat.u.uPoint, x, y);
      gl.uniform3f(PROG.splat.u.uColor, 0, 0, 0);
      gl.uniform1f(PROG.splat.u.uRadius, r * opts.dyeRadiusMul);
      gl.uniform1f(PROG.splat.u.uErode, erode);
      gl.uniform1f(PROG.splat.u.uSeed, seed);
      gl.uniform2f(PROG.splat.u.uStretch, stretch[0], stretch[1]);
      gl.uniform1f(PROG.splat.u.uIsDye, 1);
      splatBlit(dye.write, x, y, r * opts.dyeRadiusMul, stretch);
      dye.swap();
    }

    /* One dab of "paint": jittered position, a size drawn from a short
       range, a lean, and a random seed. The range used to run from
       0.18 to 1.13 of the radius, and that lower half is what read as
       bristles -- a dab that small is a speck beside its neighbours,
       and a stroke speckled with specks is a brush. Kept narrow here so
       every dab is a full mass; the irregularity is the shader's job
       now, not the size lottery's. The two stretch components stay
       independently drawn so the long axis wanders, and the range is
       wide again on purpose -- a mass that is merely squashed still
       reads as a disc, and this is the cheapest place to break that
       without touching the shader. */
    function dab(x, y, r, erode) {
      var spread = opts.jitter;
      splatDye(
        x + (Math.random() - 0.5) * spread,
        y + (Math.random() - 0.5) * spread,
        r * (0.52 + Math.random() * 0.58),
        erode * (0.45 + Math.random() * 0.95),
        Math.random(),
        [0.34 + Math.random() * 0.95, 0.38 + Math.random() * 0.88]
      );
    }

    /* A weak dab laid at the pointer every single frame, whether or not
       the distance spacing says it is time for a real one.

       This exists because the spacing has a cost that only shows up in
       motion. A dab cuts the cover to fully open in the frame it lands,
       so with dabs spaced by distance the trail only ever grows when one
       fires -- and below about 1.7 screens a second that is less often
       than once per frame. The edge of the mark then advances in visible
       jumps every few frames, which is exactly the stutter.

       The seam is deliberately too weak to show on its own: one pass
       takes the density from 1 to roughly 0.67, and the cover only stops
       being transparent below 0.30. Three of them stacked get there, so
       the trail fills in over about three frames instead of appearing in
       one, and where the seam lands on open canvas it is a thin thread
       rather than a shape.

       Thin is the point. Sixty full-strength dabs a second is what turned
       a slow drag into a smooth hull; a thread that cannot cross the
       threshold by itself never contributes to the outline, so the lobes
       still come from the spaced dabs and the gap between them gets
       closed without the boundary moving. Its stretch is narrow and its
       wobble halved, because a seam has no business having petals. */
    function seam(x, y) {
      var half = opts.jitter * 0.5;
      splatDye(
        x + (Math.random() - 0.5) * half,
        y + (Math.random() - 0.5) * half,
        opts.radius * 0.62,
        opts.erode * opts.seamStrength,
        Math.random(),
        [0.62 + Math.random() * 0.5, 0.65 + Math.random() * 0.48]
      );
    }

    /* ------------------------------------------------------------ pointer */

    /* How far the pointer has to travel between two dabs, in the same
       normalised units the shader works in, and how many of them a single
       frame may lay down.

       The spacing is written as a multiple of sqrt(radius * dyeRadiusMul)
       because that is the scale the visible blob actually has: the splat
       is cut at nine radii, so the eye sees something on the order of
       sqrt(rad) across, not rad. The 0.5 lands a little over half a
       visible radius apart -- close enough that the trail is continuous,
       far enough that no dab is buried deep enough inside its
       neighbours for the union to smooth it away. Raising it turns the
       stroke into separate spots; dropping it is the smooth ribbon
       again. */
    var DAB_SPACING = opts.dabSpacing * Math.sqrt(opts.radius * opts.dyeRadiusMul);
    var DAB_MAX = 24;

    /* carry is distance already travelled past the last dab, seeded at a
       full spacing so the very first movement paints immediately instead
       of waiting for the pointer to cover a whole step. */
    var pointer = {
      x: 0.5, y: 0.5, px: 0.5, py: 0.5,
      dx: 0, dy: 0, moved: false, has: false, carry: DAB_SPACING
    };
    var rect = null;
    function updateRect() { rect = host.getBoundingClientRect(); }

    function onPointerMove(e) {
      if (!rect) updateRect();
      if (!rect || !rect.width || !rect.height) return;
      var nx = (e.clientX - rect.left) / rect.width;
      var ny = 1 - (e.clientY - rect.top) / rect.height;
      if (!pointer.has) {
        pointer.px = pointer.x = nx;
        pointer.py = pointer.y = ny;
        pointer.has = true;
      }
      pointer.dx += nx - pointer.x;
      pointer.dy += ny - pointer.y;
      pointer.x = nx; pointer.y = ny;
      pointer.moved = true;
    }
    function onPointerLeave() { pointer.has = false; pointer.moved = false; }

    host.style.touchAction = 'pan-y';
    host.addEventListener('pointermove', onPointerMove, { passive: true });
    host.addEventListener('pointerdown', onPointerMove, { passive: true });
    host.addEventListener('pointerleave', onPointerLeave, { passive: true });
    updateRect();

    /* --------------------------------------------------------------- loop */

    var raf = 0, alive = true, visible = true;
    var last = (global.performance || Date).now();

    function step(now) {
      if (!alive) return;
      raf = requestAnimationFrame(step);

      /* Clamped, but not to a sixtieth. At 0.0166 anything slower than
         60fps puts the whole simulation into slow motion: the vorticity
         and the recovery both advance on a frame count rather than on
         the clock, so the dye stops spreading as fast as the pointer
         moves and the trail is the first thing to disappear. The 2D
         fallback above has always used a 30fps ceiling; this brings
         the two paths into line. */
      var dt = Math.min((now - last) / 1000, 0.033);
      last = now;
      if (!(dt > 0)) return;

      if (resizeCanvas()) initFramebuffers();
      if (!visible) return;

      gl.disable(gl.BLEND);

      // curl
      gl.useProgram(PROG.curl.p);
      gl.uniform2f(PROG.curl.u.texelSize, velocity.read.texelX, velocity.read.texelY);
      gl.uniform1i(PROG.curl.u.uVelocity, velocity.read.attach(0));
      blit(curl);

      // vorticity confinement
      gl.useProgram(PROG.vorticity.p);
      gl.uniform2f(PROG.vorticity.u.texelSize, velocity.read.texelX, velocity.read.texelY);
      gl.uniform1i(PROG.vorticity.u.uVelocity, velocity.read.attach(0));
      gl.uniform1i(PROG.vorticity.u.uCurl, curl.attach(1));
      gl.uniform1f(PROG.vorticity.u.uCurl, opts.curl);
      gl.uniform1f(PROG.vorticity.u.uDt, dt);
      blit(velocity.write);
      velocity.swap();

      // divergence
      gl.useProgram(PROG.divergence.p);
      gl.uniform2f(PROG.divergence.u.texelSize, velocity.read.texelX, velocity.read.texelY);
      gl.uniform1i(PROG.divergence.u.uVelocity, velocity.read.attach(0));
      blit(divergence);

      // seed pressure
      gl.useProgram(PROG.seed.p);
      gl.uniform1f(PROG.seed.u.uValue, opts.pressure);
      blit(pressure.write);
      pressure.swap();

      // jacobi solve
      gl.useProgram(PROG.pressure.p);
      gl.uniform2f(PROG.pressure.u.texelSize, velocity.read.texelX, velocity.read.texelY);
      gl.uniform1i(PROG.pressure.u.uDivergence, divergence.attach(0));
      for (var i = 0; i < opts.pressureIterations; i++) {
        gl.uniform1i(PROG.pressure.u.uPressure, pressure.read.attach(1));
        blit(pressure.write);
        pressure.swap();
      }

      // make divergence-free
      gl.useProgram(PROG.gradient.p);
      gl.uniform2f(PROG.gradient.u.texelSize, velocity.read.texelX, velocity.read.texelY);
      gl.uniform1i(PROG.gradient.u.uPressure, pressure.read.attach(0));
      gl.uniform1i(PROG.gradient.u.uVelocity, velocity.read.attach(1));
      blit(velocity.write);
      velocity.swap();

      // advect velocity
      gl.useProgram(PROG.advect.p);
      gl.uniform2f(PROG.advect.u.texelSize, velocity.read.texelX, velocity.read.texelY);
      gl.uniform2f(PROG.advect.u.dyeTexelSize, velocity.read.texelX, velocity.read.texelY);
      gl.uniform1i(PROG.advect.u.uVelocity, velocity.read.attach(0));
      gl.uniform1i(PROG.advect.u.uSource, velocity.read.attach(0));
      gl.uniform1f(PROG.advect.u.uDt, dt);
      gl.uniform1f(PROG.advect.u.uDissipation, 0.2);
      blit(velocity.write);
      velocity.swap();

      // pointer input: the velocity field every frame, the cover by
      // distance travelled
      if (pointer.moved) {
        var len = Math.sqrt(pointer.dx * pointer.dx + pointer.dy * pointer.dy);
        if (len > 0) {
          var ux = pointer.dx / len, uy = pointer.dy / len;

          // Momentum, spread finely along the path rather than dumped in
          // one lump. Two earlier shapes both stuttered: quantising it to
          // the dab spacing left frames that injected nothing at all and
          // then one that injected a whole dab's worth, and putting the
          // entire frame's motion into a single splat at the pointer
          // concentrated it into a three-pixel spike that pulsed at the
          // head. A quarter of the dab spacing is fine enough that a slow
          // drag still gets roughly one injection per frame, and the sum
          // over the path is the frame's real displacement either way.
          var vStep = DAB_SPACING * 0.25;
          var vAt = 0, vFired = 0;
          while (vAt < len && vFired < 64) {
            var vt = vAt / len;
            splatVelocity(pointer.px + pointer.dx * vt, pointer.py + pointer.dy * vt,
                          ux * vStep * opts.force, uy * vStep * opts.force,
                          opts.radius, Math.random(), [1, 1]);
            vAt += vStep;
            vFired++;
          }

          // The seam, every frame, so the trail grows continuously.
          seam(pointer.x, pointer.y);

          // Then the real dabs, one per DAB_SPACING of travel with the
          // remainder carried into the next frame.
          //
          // This used to be a dab count derived from how far the pointer
          // moved this frame, and that made the stroke look like a
          // different effect at every speed. A slow drag put one or two
          // dabs down per frame but ran for sixty frames, so the same
          // few millimetres of canvas got painted sixty times over. The
          // union of many overlapping random outlines is their outer
          // hull, which is smooth -- that, not the shader, is why a slow
          // stroke came out as a ribbon and a fast one as separate
          // lobes. Counting per frame cannot fix it, because the count is
          // a function of speed while the damage comes from the rate.
          //
          // Spacing by distance instead makes the cadence identical at
          // every speed: same gap between dabs, however long the frame
          // took. The seam above is what pays for it.
          var at = DAB_SPACING - pointer.carry;
          var fired = 0;
          while (at <= len && fired < DAB_MAX) {
            var t = at / len;
            dab(pointer.px + pointer.dx * t, pointer.py + pointer.dy * t,
                opts.radius, opts.erode);
            at += DAB_SPACING;
            fired++;
          }
          if (fired >= DAB_MAX) {
            // A teleport, or a frame long enough to swallow the cap. The
            // path is not worth laying down in full detail; start clean
            // rather than carrying a debt that would bunch the next
            // frame's dabs into the wrong place.
            pointer.carry = 0;
          } else {
            pointer.carry = len - (at - DAB_SPACING);
          }
        }
        pointer.dx = 0;
        pointer.dy = 0;
        pointer.moved = false;
        pointer.px = pointer.x;
        pointer.py = pointer.y;
      }

      // advect the cover
      gl.useProgram(PROG.advect.p);
      gl.uniform2f(PROG.advect.u.texelSize, velocity.read.texelX, velocity.read.texelY);
      gl.uniform2f(PROG.advect.u.dyeTexelSize, dye.read.texelX, dye.read.texelY);
      gl.uniform1i(PROG.advect.u.uVelocity, velocity.read.attach(0));
      gl.uniform1i(PROG.advect.u.uSource, dye.read.attach(1));
      gl.uniform1f(PROG.advect.u.uDt, dt);
      gl.uniform1f(PROG.advect.u.uDissipation, 0);
      blit(dye.write);
      dye.swap();

      // flood the cover back
      gl.useProgram(PROG.recover.p);
      gl.uniform1i(PROG.recover.u.uTarget, dye.read.attach(0));
      gl.uniform1f(PROG.recover.u.uDt, dt);
      // uRate is a chase, not a fade rate, so it is scaled by dt the
      // same way the old exponential was -- a 30fps machine must not
      // lag a 120fps one through the recovery curve.
      gl.uniform1f(PROG.recover.u.uRate, 1 - Math.pow(1 - opts.recoverRate, dt * 60));
      gl.uniform1f(PROG.recover.u.uHold, opts.recoverHold);
      blit(dye.write);
      dye.swap();

      // composite with alpha so the tiles show through
      gl.useProgram(PROG.display.p);
      gl.uniform1i(PROG.display.u.uDye, dye.read.attach(0));
      gl.uniform3f(PROG.display.u.uColor, rgb[0], rgb[1], rgb[2]);
      gl.uniform1f(PROG.display.u.uEdge, opts.edge);
      blit(null);
    }

    /* ---------------------------------------------------- resize / visible */

    var resizeTimer = 0;
    function onResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        updateRect();
        resizeCanvas();
        initFramebuffers();
      }, 180);
    }
    global.addEventListener('resize', onResize);
    global.addEventListener('scroll', updateRect, { passive: true });

    document.addEventListener('visibilitychange', function () {
      visible = !document.hidden;
      if (visible) last = (global.performance || Date).now();
    });

    raf = requestAnimationFrame(step);

    /* -------------------------------------------------------------- handle */

    return {
      isFallback: false,
      setColor: function (hex) {
        opts.color = hex;
        var c = hexToRgb(hex);
        rgb[0] = c[0]; rgb[1] = c[1]; rgb[2] = c[2];
      },
      /* diagnostics: sample the cover field on a coarse grid */
      probe: function (n) {
        n = n || 5;
        var w = dye.read.width, h = dye.read.height;
        var isHalf = (FMT[2] === HALF);
        var buf = isHalf ? new Uint16Array(4) : new Float32Array(4);
        var val = isHalf ? halfToFloat : function (x) { return x; };
        var out = [];
        for (var j = 0; j < n; j++) {
          var row = [];
          for (var i = 0; i < n; i++) {
            var x = Math.floor((i + 0.5) * w / n);
            var y = Math.floor((j + 0.5) * h / n);
            gl.bindFramebuffer(gl.FRAMEBUFFER, dye.read.fbo);
            gl.readPixels(x, y, 1, 1, gl.RGBA, FMT[2], buf);
            row.push(val(buf[0]).toFixed(2));
          }
          out.push(row.join(' '));
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return out.join(' | ');
      },
      destroy: function () {
        alive = false;
        cancelAnimationFrame(raf);
        global.removeEventListener('resize', onResize);
        global.removeEventListener('scroll', updateRect);
        host.removeEventListener('pointermove', onPointerMove);
        host.removeEventListener('pointerdown', onPointerMove);
        host.removeEventListener('pointerleave', onPointerLeave);
        destroyDouble(velocity);
        destroyDouble(dye);
        destroyDouble(pressure);
        destroyFBO(divergence);
        destroyFBO(curl);
      }
    };
  }

  global.FluidCover = { create: create };
})(window);
