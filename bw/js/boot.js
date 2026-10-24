/* Only load pointer-driven effects on screens that can use them. */
(function () {
  'use strict';
  var lite = window.matchMedia('(hover: none), (pointer: coarse), (max-width: 991px), (prefers-reduced-motion: reduce)').matches;
  window.__motionLite = lite;
  document.documentElement.classList.toggle('is-motion-lite', lite);
  function load(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  var desktop = lite ? [] : ['js/vendor/ScrollTrigger.min.js', 'js/vendor/SplitText.min.js', 'js/vendor/lenis.min.js', 'js/fluid.js', 'js/poster.js'];
  Promise.all(desktop.map(load)).catch(function () {
    // Optional visual effects must not prevent access to the tools.
    window.__motionLite = true;
    document.documentElement.classList.add('is-motion-lite');
  }).then(function () { return load('js/main.js?v=20261025-palette'); });
})();
