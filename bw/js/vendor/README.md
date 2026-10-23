# Browser dependencies

These are unmodified copies of the versions previously loaded from jsDelivr.
Serving them from the site removes third-party JavaScript requests from startup.

- GSAP, ScrollTrigger, CustomEase, SplitText: 3.13.0, from `https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/`. Original copyright and license headers are preserved in each file.
- Lenis: 1.3.21, from `https://cdn.jsdelivr.net/npm/lenis@1.3.21/dist/lenis.min.js`. See `LICENSE.lenis.txt`.

`js/boot.js` loads ScrollTrigger, SplitText, Lenis, the fluid simulation and the poster only for desktop motion mode. Core GSAP and CustomEase support the short transitions in both modes.
