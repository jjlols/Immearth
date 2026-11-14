# Independent EIC overlay viewer

This standalone package reads the downloader's PNGs without modifying them.
It is a **visual exploration tool**, not calibrated geospatial data fusion.
The build output in `../overlay-site/` stays untracked and completely separate
from the site's app and the image acquisition pipeline.

## Build and preview

Use the same virtualenv as the downloader (Pillow is required only to build):

```bash
python build_overlay_site.py
python3 -m http.server 8000 --directory overlay-site
```

Open `http://localhost:8000`. No JavaScript packages, APIs, remote scripts,
CDN, or Python server are needed once the output directory is generated.
Deploy that directory to any static HTTP host. Do not open it with `file://`;
the browser must be allowed to fetch the local JSON manifest and layer assets.

Keep the generated directory in `overlay-site/` or gitignore your custom
output. Do not deploy the Python script itself.

## Layer contract

`overlay/layers.json` is the editable catalog. Each layer has a unique stable
`id`, `label`, `shortLabel`, accessible symbol `mark`, PNG `source`, tint
`color`, stacking `order`, default `opacity`, and prose `description`.
`order` determines both stack and control order.

At build time, the generator creates these **independent, deployable layers**:

- `layers/{id}.webp`: same aspect ratio as the source, resized within 2048×1024
- `layers.json`: sourced asset SHA-256, original size, browser URL and metadata
- Canvas tinting is runtime, per layer; original PNGs are never destructively edited

To change a palette or add a metric, update the catalog and rerun the build.
The generator verifies that input paths stay within this project.
No quantitative calibration is inferred from these perceptual tints.

## Interaction and future integration

The default view shows all five layers as differently colored, translucent
screens. Clicking a metric desaturates/dims its peers, boosts that layer's
opacity and saturation treatment, gives it a soft tint-colored halo, and
slightly increases its scale. Clicking it again restores the shared view.

Each metric has a separate visibility switch. `Show all layers`, `Reset
composition`, and the background visibility switch always work. Arrow keys
navigate between metric focus buttons; Enter or Space selects, and Escape
clears focus. Reduced-motion preferences are respected.

Static UI controls call a small exported `OverlayController` class. Its state
is addressable by layer ID; there are no global booleans tied to CSS class
order. The future site's event bus/frontend can reuse this controller or the
instance's frozen browser API:

```js
window.eicOverlay.select('carbon_monoxide');     // focus CO
window.eicOverlay.select(null);                  // restore full composition
window.eicOverlay.setVisibility('active_fires', false);
window.eicOverlay.setVisibility('active_fires', true);
window.eicOverlay.reset();                       // visible layers, no focus
window.eicOverlay.getState();                    // layers, focus, background
```

A host app can also import `OverlayController` from `overlay.js`, listen for
`change` events, and map `getState()` to its own CSS/canvas/WebGL renderer.

## Projection and scientific limitations

The PNGs do not come with a common projection transform. They have different
pixel dimensions, full-frame map extents, overlay labels, and temporal ranges.
They are stretched to a shared 2:1 canvas and tinted for preview. Position is
therefore approximate **display alignment only**, not proof of a shared
latitude/longitude registration. Do not combine their colors arithmetically
and interpret the result as scientific values. The viewer deliberately says
so in the interface and generated manifest.

For a future scientifically registered map, obtain georeferenced source data
or transformation metadata for each source, align per projection, and preserve
each metric's own units and actual scale. This needs a separate scientific
pipeline; no such calibration is claimed here.

## Concurrency / scope

This implementation lives in its own Git worktree/branch. It does not alter
`download_eic.py`, `data/`, root config, the existing test file, or the second
agent's color-scales worktree. Generated images remain untracked preview assets.

## Verification

Run the repository's full Python tests. The optional browser QA uses locally
installed Playwright/Chromium only during development; neither is a runtime
dependency. Browser QA covers canvas content, focus/dimming, reset, visibility, keyboard
navigation, an empty composition, manifest/image failures, delayed asset loading, and reduced motion.
