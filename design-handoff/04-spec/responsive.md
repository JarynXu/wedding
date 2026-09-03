# Responsive and host rules

## Primary target

- Design baseline: `390 × 844` CSS px.
- Runtime: mobile portrait first.
- Stage height: `100dvh`, not legacy `100vh`.
- Respect `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` for floating UI.

## Supported portrait range

- Minimum working width: 320 px.
- Primary QA widths: 360, 375, 390, 393, 412, 430 px.
- Primary QA heights: 667, 780, 812, 844, 852, 932 px.

## Composition rules

- Do not scale the entire design as an image.
- Text and controls stay in semantic layout and reflow independently.
- Photography and raster scene art use intentional focal crops.
- Faces must remain inside a protected central region; flower/curtain crops may absorb aspect-ratio changes.
- Final invitation copy may tighten spacing on short screens but must remain fully readable without clipping.
- Scene index and music control remain inside safe areas and cannot overlap essential copy.

## Raster export strategy

For art whose crop is composition-sensitive, export at minimum 2× baseline scale and retain bleed:

- full-scene base art: recommended 960 × 1920 or larger;
- left/right curtain slices: include at least 15% extra outer bleed;
- floral clusters: transparent WebP/PNG with 12–20% transparent padding around natural edges;
- couple portrait: keep one preserved source asset and use independent cover/secondary focal crops in layout; export separate derivatives only if later retouching requires them.

## Desktop behavior

Desktop is a preview host, not a separate invitation design. The mobile stage remains centered at a maximum width of 460 px against a dark neutral surround. No desktop-specific narrative layout is introduced.
