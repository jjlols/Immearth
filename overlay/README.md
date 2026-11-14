# Geographic NASA Earth layer explorer

This **local** viewer places complete NASA scientific raster fields above one
geographic background. It does not stack opaque screenshots indiscriminately
and does not turn global data fields into sparse top-percentile splotches.
The natural background is not a scientific visualization. It is generated locally
from **Natural Earth**, public-domain 1:110m vector map polygons.

## Start it

```bash
.venv/bin/python -m pip install -r requirements-overlay.txt
.venv/bin/python build_geographic_overlays.py
python3 -m http.server 8000 --bind 127.0.0.1 --directory /full/path/to/repo/overlay-site
```

**http://localhost:8000**

Do not accidentally leave a local server serving a previous worktree. Rebuild
`overlay-site/` after changing source assets and refresh the browser. There is
no runtime CDN/DeepSpace/browser JS-framework dependency. Use the DeepSpace
documented publishing tools for future production hosting.

## What is scientific, and what is just composition?

The **basemap is only geography**. It consists of ocean, land polygons,
coastlines and a low-contrast graticule. There is intentionally **no** humidity,
temperature, or other metric-scientific visualization in it.

- **Rainfall:** official NASA `imergert_alpha.now.png`, preserving native
  transparent-cell alpha and complete original scientific RGB.
- **Fires:** `VIIRS_fires_latest.exr` supplies raw float32 BGRA and
  `VIIRS_fires_latest.png` supplies same-variable approved preview RGB. Dots
  stay geolocated. Their rgba support is their inherent fire signal—not the
  blue ocean colored by hue.
- **CO, NOx, and temperature:** `data/images/` original scientific field RGB
  is retained **pixel-for-pixel** without best-pixel picks, quantiles, tiles,
  peak masks, arbitrary hotspots or changing units.

CO, NOx, and temperature are dense continuous global images; NASA provides no
unified transparent per-pixel scientific marker raster for all these layers on
the SVS pages. There is no arbitrary transform that lets one spontaneously
create sparse point observations and call them the original data. This app does
not fabricate one: those complete fields coexist with **uniform opacity**.

Per-metric opacity sliders and `Display` checkbox changes control presentation,
not data filtering. Selecting a metric brings its normal full field forward and
gives it full source opacity. **Selected field only** hides the other rasters to
see all original scientific details without interference. Use original source
colorbars / `color_scales/` for unit interpretation, never mixed RGB pixels as
physical values.

A single 2:1 view does not establish identical geotransforms in all NASA source
assets. Matching extents is a normal-display assumption, not scientific affine
registration. Source times can also differ, especially NASA's current fire asset
and first-frame atmospheric products. See `time_basis`, `source_projection` and
`source/source_url` in `markers.json`. Use georeferenced original GEOS rasters
for calibration-grade colocated analytic merging.

## Controls / future integration

Stable metric `id`s select independent visible/opacity/focused states. The new
`OverlayController` has:

```js
window.eicOverlay.select('nitrogen_oxides');
window.eicOverlay.setVisibility('carbon_monoxide', false); // checkbox
window.eicOverlay.setLayerOpacity('nitrogen_oxides', 0.2);  // slider
window.eicOverlay.setOnlySelected(true);                  // selection only
window.eicOverlay.select(null);                           // overall view
window.eicOverlay.reset();                                // saved defaults
```

Metric buttons are accessible by labels. Arrow keys navigate and Space/Enter
select. Escape clears focus. Reduced-motion media queries respect preferences.
Generated map files and dynamic buttons are simple, static host-ready assets.

## Validation

```bash
.venv/bin/python -m pytest -q tests
.venv/bin/python -m py_compile build_geographic_overlays.py
node --check overlay/region-overlay.js
# Browser regression, with local optional Playwright development install:
node scripts/test_geographic_browser.cjs
```

The current local basemap palette is entirely specified by `overlay/sources.json`.
Unit tests show standalone polygon geometry contains no climate data, source
RGB is complete for global layers, native rain alpha exists, and current fires
use the official floating-point raster. Browser checks validate loading, source
pixels, focus/solo controls, opacity, keyboard interaction and narrow mobile.
