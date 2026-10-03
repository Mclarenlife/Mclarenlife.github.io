/* ═══════════════════════════════════════════════════════════════
   NAME SCENE
   One sheet, one word, one clock, and a number between the two.

   The wordmark is one set of six real letters sitting in the
   document, and a number p decides how that word is treated. Solid,
   slatted, screened, outlined: not four states to be swapped, four
   points on one continuous curve. p is published as a registered
   custom property and every property in css/poster.css is a function
   of it.

   The pointer is not connected to p at all, and that is deliberate.

   It used to push p, and the push was read as flicker: the word
   tracked every twitch of the hand, the update rate jumped the moment
   a finger moved, and a sheet that is supposed to be calmly turning
   itself over ended up looking wired to the mouse. A scene that only
   changes while you are dragging it is not a scene, it is a control.

   So nothing drives p. The pointer does what it was always good at --
   it erodes the cover above, and the word is what gets revealed.
   Nothing else.

   The clock above the wordmark is a different thing entirely, and the
   two should not be confused: that one is a second hand on a poster,
   not an input. It is the only part of the sheet that is not a
   function of p, and the only part still moving when the scene is
   standing perfectly still.

   This also settles the frame budget. p is written on a fixed beat
   rather than every frame: a lap takes twenty seconds, so a treatment
   change spread over 50ms steps is well under a pixel per step and
   there is nothing to see. The fluid simulation sharing the same
   frame needs those frames far more than this does -- its own dt is
   clamped to one thirtieth, so every frame it does not get is a frame
   its vorticity falls behind the pointer, and the trail is the first
   thing to go.
   ═══════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var WORD = 'MCLARY';

  /* Turns per second. A lap every twenty seconds, so each of the four
     readings holds for about five. Slow enough to read as the sheet
     turning by itself rather than as a loop playing; quick enough that
     a visitor who glances at the hero once still catches a change. */
  var DRIFT = 1 / 20;

  /* How often p is written into css. 50ms is twenty times a second.
     It has to sit well under the frame rate: at this rate of travel
     a write is worth about one percent of a treatment, so the step is
     far below anything the eye resolves and the two clocks never read
     as two separate clocks. */
  var STEP = 50;

  /* Steps per lap for the quantised number the full-sheet grounds read.
     Each ground is a 1000px fill, so letting its opacity creep
     continuously would repaint the whole sheet on every write for a
     texture that moves a pixel. Sixteen steps a lap is one repaint
     every second and a quarter, and invisible at this contrast. */
  var GROUND_STEPS = 16;

  /* Copies stepped back behind the outline. */
  var ECHO = 3;

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  /* the letters, once -- every layer gets the same six, in the same
     centred row, which is what pins the lockup while the style moves */
  var LETTERS = WORD.split('').map(function (ch) {
    return '<span>' + ch + '</span>';
  }).join('');

  function Poster(host) {
    if (!host) return null;
    var self = this;

    this.host = host;
    this.onLoop = null;

    /* p is never wrapped in place. Whole turns are subtracted when the
       value is written out, so the number being integrated can grow
       without bound and the seam is handled in exactly one place. */
    this.p = 0;
    this._last = null;
    this._written = 0;
    this._ground = -1;
    this._raf = null;
    this._dead = false;
    this.time = null;
    this.hours = null;
    this.mins = null;
    this.secs = null;
    this._timer = null;

    this._build();
    this._clock();
    this._run();
  }

  /* Build the scene: four grounds, one hairline, a clock, and five
     readings of the same six letters. */
  Poster.prototype._build = function () {
    var host = this.host;
    var i;

    host.appendChild(el('div', 'pg pg-paper'));
    host.appendChild(el('div', 'pg pg-focus'));
    host.appendChild(el('div', 'pg pg-dots'));
    host.appendChild(el('div', 'pg pg-grid'));

    host.appendChild(el('div', 'poster-rule'));

    /* Three number boxes and two dots rather than one string. The boxes
       exist so each group can be written independently; the dots exist so
       the separator can be DRAWN -- they are empty elements, and
       css/poster.css gives them their size, their radius and their
       colour. A separator character here would put the roundness of the
       clock at the mercy of whichever face happened to be loaded.

       The row as a whole is one centred flex line sized to the same
       measure as the wordmark, so its two outer edges land on the
       wordmark's two outer edges without either being positioned. */
    this.time = el('div', 'poster-clock');
    this.hours = el('span', 'pc-n');
    this.mins = el('span', 'pc-n');
    this.secs = el('span', 'pc-n');
    this.time.appendChild(this.hours);
    this.time.appendChild(el('i', 'pc-s'));
    this.time.appendChild(this.mins);
    this.time.appendChild(el('i', 'pc-s'));
    this.time.appendChild(this.secs);
    host.appendChild(this.time);

    var word = el('div', 'poster-word');
    for (i = 0; i < ECHO; i++) {
      word.appendChild(el('i', 'pw pw-echo', LETTERS))
        .style.setProperty('--k', (ECHO - i) / ECHO);
    }
    word.appendChild(el('i', 'pw pw-ink', LETTERS));
    word.appendChild(el('i', 'pw pw-cut', LETTERS));
    word.appendChild(el('i', 'pw pw-dots', LETTERS));
    word.appendChild(el('i', 'pw pw-line', LETTERS));
    host.appendChild(word);
  };

  /* The only loop in the file. It integrates the clock every frame --
   * that is one addition and one multiply -- and writes into css on a
   * fixed slow beat. The integration runs at full rate so the number
   * stays smooth and free of quantisation drift; only the write, which
   * is what costs a repaint, is rationed. */
  Poster.prototype._run = function () {
    var self = this;

    var step = function (t) {
      if (self._dead) return;

      if (self._last != null) {
        /* Clamped. rAF is throttled hard in a background tab, and an
           unclamped gap would throw the sheet most of a lap in one
           frame. */
        var dt = Math.min((t - self._last) / 1000, 0.25);
        self.p += dt * DRIFT;
        if (t - self._written >= STEP) self._write();
      }
      self._last = t;
      self._raf = global.requestAnimationFrame(step);
    };
    this._raf = global.requestAnimationFrame(step);
  };

  Poster.prototype._write = function () {
    var p = this.p - Math.floor(this.p);
    this.host.style.setProperty('--p', p);
    this._written = performance.now();

    /* The grounds only repaint when their quantised number actually
       changes, which is every few seconds rather than every write. */
    var g = Math.round(p * GROUND_STEPS) / GROUND_STEPS;
    if (g !== this._ground) {
      this._ground = g;
      this.host.style.setProperty('--g', g);
    }

    if (this._lastP != null && p < this._lastP - 0.5 && this.onLoop) {
      this.onLoop(1);
    }
    this._lastP = p;
  };

  /* Wall time, to the second, on the sheet above the wordmark. It is
     part of the poster rather than a widget laid on top of it, so the
     fluid uncovers the time along with the letters and the cover takes
     it back when it floods in.

     Each tick re-arms against the next whole second instead of running
     on a fixed thousand millisecond interval. An interval drifts, and a
     clock that gains or loses seconds is worse than no clock; and
     re-arming on the second means the digits turn over on the second
     rather than somewhere inside it. The four milliseconds are a
     cushion, because a timeout that lands a hair early would show the
     old reading and then wait almost another second for the next one. */
  Poster.prototype._clock = function () {
    var self = this;
    if (!this.time) return;

    var two = function (n) { return ('0' + n).slice(-2); };

    var tick = function () {
      if (self._dead) return;
      var d = new Date();
      self.hours.textContent = two(d.getHours());
      self.mins.textContent = two(d.getMinutes());
      self.secs.textContent = two(d.getSeconds());
      self._timer = global.setTimeout(tick, 1000 - d.getMilliseconds() + 4);
    };
    tick();
  };

  Poster.prototype.destroy = function () {
    if (this._dead) return;
    this._dead = true;
    if (this._raf) global.cancelAnimationFrame(this._raf);
    if (this._timer) global.clearTimeout(this._timer);
  };

  global.Poster = { create: function (h) { return new Poster(h); } };

})(window);
