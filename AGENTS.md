# Working on NASA-SPACE-APP

## Project purpose and ownership

This repository acquires and visualizes NASA Scientific Visualization Studio (SVS)
materials for the Earth Information Jukebox. **Carbon monoxide (CO), SVS 5153, is
not carbon dioxide (CO₂, SVS 5115).** Preserve the five canonical field IDs:
precipitation, active_fires, carbon_monoxide, nitrogen_oxides, and
near_surface_temperature.

- `download_eic.py`, `data/images/` and `data/metadata.json` are acquisition code/output.
  Never replace the rasters with mock/unrelated imagery, hue edits or downsampling.
- `color_scales/` is an independent dimension extractor, not called by the downloader.
  `README.md`, `REPORT.md`, and `schema.json` there are binding scientific context.
- Preserve `build_geographic_overlays.py`/`overlay/` and their Natural Earth map;
  do not substitute opaque screenshots or grayscale scientific fields as basemap.
- `sonification/` contains nearest-legitimate-palette grouping and regional features,
  not audio calls. `public/` has serving assets; `overlay-site/` and `dist/` are generated.
- `src/` is the React frontend. `src/audio/RemixEngine.js` is the only Web Audio
  transport; do not add an incompatible audio hook/binding or import DOM/React there.

Additional active worktrees belong to earlier agents (including `..-overlays`).
Do not reset them, use `git reset --hard`, broad `rm -rf`, or force-push. Read git
status/worktrees/branches before edits. Do not push main casually or deploy without
explicit user authorization.

## Scientific truth

Official machine-readable, NASA-calibrated RGB–number tables were **not supplied**.
Palette label/range interpretations are estimates of reviewed NASA raster ticks, not
numeric pixel observations. Preserve raw caveats through nearest valid palette match,
region feature summary and musical model. Never use brightness or lat/lon as quantity.
Unknown/no-alpha/neutral/text/coastline/anti-aliased and no-data pixels reject instead
of manufacturing values. `RawDataAdapter` remains caller-owned extensibility requiring
actual values, units, and explicit provenance—not fabricated CSV or observations.

Precipitation liquid/frozen palettes stay separate; gray/overflow do not get invented
highest values. Fires use estimated **0,2,4,6,8 MW FRP**, not counts. CO uses estimated
nonuniform **40,100,130,200,500 ppbv**. NOₓ uses **0.001–10 ppbv log₁₀**, never linear
ppbv-to-pitch. Temperature uses estimated **−40…+40 °C**, T2M with recorded short-caption
3m versus detailed-caption 2m discrepancy. `color_scales/REPORT.md` is the audit trail.

## Audio and exploration

Use only `public/audio/deliberate-thought.mp3`: **Deliberate Thought — Kevin MacLeod**
(69 BPM, approximately 2:57), **CC BY 4.0**. `LICENSES.md`, `public/attribution.json`,
and the app attribution must retain artist/title/license URL. No official stems were
identified; generic filter/gain paths are remix branches, not choir/synth/drum stems.

One lazy context, one decoded buffer and one shared clock are created only after
explicit **Play remix**. Mount, keys, map/region selection and Vancouver metadata do
not create/resume audio. Pause suspends; reset retires all sources/notes/timers, keeps
the decoded buffer for a later explicit replay, and leaves the context suspended.
Visibility-hidden or focus-ineligible voices cannot sound. Preserve the conservative
last-known-good dry gain 0.085, master default 0.22 and cap 0.24. Before volume changes,
measure source/output RMS and peak; never blindly boost gain and never claim listening
from only UI, network or tests. Maximum eight bounded active accents; FRP rests are
at least 8.4 seconds; rain/frozen use separate presence-based schedules.
**No oscillator, generated guide note or independently restarted MP3 snippet is
permitted.** Temperature changes original playback rate 0.83…1.22; CO drives a
low-frequency branch gain; NOₓ log-rank drives only a low-pass filter (1200…16000 Hz);
precipitation/fire regime gentle filtered gain envelopes on the one synchronized MP3.
Audio instrumentation tests must assert these source/filter properties rather than
reintroducing removed legacy oscillator fields.

The exploration grid is **3 rows × 4 columns**, shared by WASD/arrows and region buttons.
W/up=north, A/left=west, S/down=south, D/right=east; clamp edges, Home=region index 0
(Vancouver-associated start), and index=`row*4+column`. Never trigger it within native
form/editable controls, links, buttons, sliders or modifier shortcuts. Movement changes
estimated palette controls only while already playing and never audio on its own.
The amber exploration marker is distinct from fixed Vancouver: **49.2827° N, 123.1207° W
(WGS84)**. Vancouver remains the reserved future listener origin `(0,0,0)`, not a live
binaural output. Do not request GPS, map lat/lon to pitch/timing, or infer precise
geotransform from a shared 2:1 display aspect ratio. See `src/lib/spatialOrigin.js`.

## Verification and deployment

Install JavaScript packages with `npm install`. Python geodata/color dependencies belong
in `.venv` as required by existing requirements files. Keep generated assets via their
existing pipelines; no hand editing of `dist/` or `overlay-site/`.

```bash
npm test
npm run build
PYTHONPATH=. .venv/bin/python -m pytest -q tests
PYTHONPATH=. .venv/bin/python -m pytest -q color_scales/tests
```

Run color-scales tests as a separate subprocess: importing `download_eic` first causes
an intentional extractor-independence assertion failure in combined suites; do not weaken it.
The browser audit is `npm run test:browser` with `JUKEBOX_URL` pointing to a running
localhost server (default `http://127.0.0.1:8001`). Build before testing production
`dist/`. Chromium mocked HTTP 503 intentionally verifies UI failure; other console/page
errors fail the audit. A post-limiter analyser verifies real generated waveform, never
subjective speaker audibility. If changing volume, retain comparison measurements.
At 390px require no horizontal page overflow and reachable labeled transport controls.

DeepSpace remains an unconfigured future host, not automatically invoked by Vite.
Only use it with actual supported installation/docs/account integration, otherwise use
real native tests and say that no DeepSpace integration is configured. No publishing,
supplying fake integration outputs, or deployment without separate user permission.
