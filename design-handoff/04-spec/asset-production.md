# Asset production contract

Version 6 is the governing visual direction. The implementation uses real raster materials for every identity-defining layer; simple geometry, layout and low-risk atmosphere remain CSS/live UI.

## Visual invariants

- warm ivory / champagne canvas;
- deep-brown velvet only for drapery — flowers are not recolored brown;
- florals remain a controlled red + white + pink mix with restrained greenery;
- warm gold reads as foil/material, not neon yellow;
- couple identity comes from the supplied portrait; no facial regeneration;
- invitation copy stays live HTML;
- transitions feel like one visual story rather than eight unrelated posters.

## Canonical runtime assets

The exact machine-readable list is `../03-assets/manifest.json`.

| File | Format | Role |
| --- | --- | --- |
| `assets/photos/welcome.webp` | WebP RGB | supplied couple portrait; scenes 01 and 07 |
| `assets/common/curtain-left.webp` | WebP RGBA | real velvet fold layer, deep-brown grade |
| `assets/common/curtain-right.webp` | WebP RGBA | right-side counterpart |
| `assets/common/floral-side.webp` | WebP RGBA | real red/white/pink side floral cutout |
| `assets/common/floral-bottom.webp` | WebP RGBA | retained real floral source cutout |
| `assets/common/floral-garland.webp` | WebP RGBA | horizontal composite made from real floral cutouts |
| `assets/common/paper.webp` | WebP RGB | warm paper/fiber material |
| `assets/common/gold-foil.webp` | WebP RGB | warm foil texture used as live text/material mask |
| `assets/scene-05/venue.webp` | WebP RGB | softened real wedding-stage atmosphere |
| `assets/scene-06/reveal.webp` | WebP RGB | real stage reveal; curtain field graded brown, flower colors preserved |

## What remains live/CSS

These elements should not be baked into image assets:

- names, dates, schedule, venue, address and invitation wording;
- music and navigation controls;
- scene counter and scroll cue;
- thin borders, arch geometry, halo/ring geometry;
- sparse petals and veil-like low-risk atmosphere;
- restrained gold sweep applied through masks/gradients.

This split keeps copy editable and responsive while keeping the high-value visual character photographic.

## Photography rules

- preserve faces, clothing, pose and body proportions from the supplied portrait;
- no generative facial replacement or identity-changing beautification;
- layout may use independent focal crops for cover and couple scene without destructively altering the source asset;
- keep faces outside high-contrast text, curtain folds and dense floral overlap;
- if a higher-resolution original is supplied later, replace `assets/photos/welcome.webp` without changing scene ownership.

## Curtain rules

- curtain layers use real fabric fold information;
- target hue remains cocoa/deep brown, not red-black;
- outer edges may crop beyond viewport; inner edges need soft falloff so movement never exposes a hard rectangular boundary;
- curtain motion is transform-only in runtime.

## Floral rules

- flowers are grouped by visual depth, not cut flower-by-flower;
- red/white/pink balance is preserved across the story;
- no orange/brown global recolor;
- transparent edge quality must survive ivory backgrounds without matte fringes;
- the real venue photograph may supply its own florals; do not stack a second unrelated floral language on top.

## Scene asset ownership

### 01 — Cover
Uses `welcome.webp`, both curtain layers, `floral-garland.webp`, `paper.webp` and `gold-foil.webp`.

### 02 — Announcement
No mandatory photo-real asset. Halo and sparse petals are intentionally lightweight atmosphere.

### 03 — Time
Uses the real floral cutouts at the frame edges; ring and type remain live/CSS.

### 04 — Message
No mandatory photo-real asset. Veil and sparse petals remain quiet atmosphere behind live copy.

### 05 — Location
Uses `scene-05/venue.webp` under a high-opacity ivory treatment so the real wedding styling is present without competing with venue information.

### 06 — Transition
Uses `scene-06/reveal.webp` as the spatial reveal. It is the strongest direct link to the actual wedding-stage styling.

### 07 — Couple
Uses the same canonical real portrait with an independent crop plus real side florals.

### 08 — Invitation
Uses `paper.webp`, `gold-foil.webp` and controlled real floral corner layers. All invitation facts remain live text.

## Export and replacement rules

- WebP is the default for photographic/textured assets; PNG is acceptable if alpha-edge quality materially improves.
- Replacement assets must preserve existing role/aspect/crop behavior or update the corresponding scene specification.
- Do not bake copy or controls into raster art.
- Inspect transparent assets at device scale against the actual ivory canvas.
- Compress only after visual approval; reject haloing, blocked shadows, banding or destroyed fabric/flower detail.

## Current readiness

The raster split, scroll implementation and handoff are in place. The remaining blockers are content inputs rather than missing visual layers:

- final names / monogram;
- final date and schedule;
- venue name, full address and map URL;
- approved invitation wording;
- final music file.
