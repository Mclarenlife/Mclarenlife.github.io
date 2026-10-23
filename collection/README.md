# Collection export snapshot

This is the supplied McLary APP Collection static export, copied from the sibling
`sites/collection/site` authoring project. It retains its existing layout,
interactive components, physical charms, typography and scroll animations.

Run `node scripts/build-collection.mjs` from the portfolio root to prepare
`build/collection/`. The build rewrites static resources and home links for the
`/collection/` GitHub Pages subpath. `COLLECTION_SITE_ROOT` can select an updated
export. The local sibling export takes precedence; a fresh clone uses this snapshot.

No original-site network request is needed to build. Local audit uploads and
authoring-only media generation files are not shipped. The site's existing
`noindex,nofollow` setting is preserved.

The supplied project adapts the public Butter homepage build (snapshot 2026-10-22),
https://www.butter.video/. Original design, fonts, general charm assets and animation
implementation retain their original attribution. App names, icons, screenshots,
McLary branding and the orange logo charm come from the supplied Collection project.
Screenshot tours are compositions of still screenshots, not interaction recordings.

Application repositories:
- https://github.com/Mclarenlife/Texite
- https://github.com/Mclarenlife/Paperead
- https://github.com/Mclarenlife/Chartelis
- https://github.com/Mclarenlife/Zipite
