# Developer handoff — Version 6 rebuild

This directory is the implementation handoff for the mobile wedding invitation rebuilt from the approved Version 6 direction.

## Authoritative surfaces

- Runtime implementation: repository root (`index.html`, `styles.css`, `app.js`, `content.js`).
- Rendered 390×844 baseline: `02-scene-concepts/`.
- Runtime cut layers: `../assets/`; indexed by `03-assets/manifest.json`.
- Design foundations: `04-spec/design-tokens.json`.
- Motion behavior: `04-spec/motion.md`.
- Responsive/crop rules: `04-spec/responsive.md`.
- Asset production constraints: `04-spec/asset-production.md`.
- Per-scene composition/ownership: `05-scene-specs/README.md`.

## Implementation invariants

1. Mobile portrait is the primary experience; desktop only hosts a centered mobile stage.
2. Native vertical scroll drives one fixed `100dvh` stage; do not convert this into eight independent vertically moving pages.
3. Scene transitions overlap and remain interruptible when scroll direction reverses.
4. The supplied couple portrait remains the identity source. Do not regenerate faces.
5. Critical drapery, floral, paper, foil and venue atmosphere use real raster layers; do not replace them with cartoon-like SVG backgrounds.
6. Drapery is deep brown; flowers stay red/white/pink with restrained greenery.
7. Names, date, schedule, venue, address and invitation wording remain live HTML content.
8. Music requires explicit user interaction and remains disabled until a real source is configured.
9. Final invitation prioritizes legibility; foil and motion remain restrained.

## Open content inputs

The implementation is structurally ready, but the current text values are placeholders until final wedding facts are supplied: names/monogram, date, schedule, venue/address/map URL, invitation copy and music file.
