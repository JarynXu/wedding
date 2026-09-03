# Asset manifest

`manifest.json` points to the canonical runtime cut layers in `../../assets/` rather than duplicating binary files inside the handoff directory. The runtime file is therefore the handoff source of truth.

All paths include pixel dimensions and roles. Critical photographic assets are WebP raster layers; simple interface geometry may remain CSS/SVG where it does not carry the key visual identity.
