# Wedding Invitation

Mobile-first, scroll-driven electronic wedding invitation rebuilt from the approved sixth visual direction.

## Experience

- one fixed `100dvh` mobile stage;
- eight narrative scenes driven by vertical scroll progress;
- overlapping scene transitions instead of hard page snapping;
- optional user-triggered music;
- the supplied real couple portrait is used as the identity anchor;
- the supplied real wedding-stage photograph is reused as venue atmosphere;
- warm ivory/champagne base, deep-brown velvet, red/white/pink florals and restrained warm-gold foil.

## Run locally

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173`.

## Edit wedding information

All mutable wedding content lives in `content.js`:

- bride/groom names and monogram;
- date and schedule;
- venue, address and map URL;
- invitation wording;
- optional music path.

The current values are explicit placeholders until the final wedding facts are supplied.

## Real raster assets

The current implementation no longer relies on flat SVG substitutes for the key visual layers. Runtime assets include:

- `assets/photos/welcome.webp` — supplied couple portrait;
- `assets/common/curtain-left.webp` / `curtain-right.webp` — real velvet folds regraded to deep brown;
- `assets/common/floral-side.webp` / `floral-garland.webp` — real red/white/pink floral cutouts;
- `assets/common/paper.webp` / `gold-foil.webp` — paper and foil material textures;
- `assets/scene-05/venue.webp` — faded real wedding-stage atmosphere for the location page;
- `assets/scene-06/reveal.webp` — real wedding-stage reveal with deep-brown curtain grade and preserved flower colors.

## Design handoff

See:

- `design-handoff/04-spec/design-tokens.json`
- `design-handoff/04-spec/motion.md`
- `design-handoff/04-spec/responsive.md`
- `design-handoff/04-spec/asset-production.md`
- `design-handoff/05-scene-specs/README.md`

Final production still requires the real names/date/venue/address, final invitation wording, and the chosen music file.
