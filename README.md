# Immearth

An interactive map and restrained music remix built around five NASA Earth
visualizations. Follow land and coastlines, inspect full source-map fields, then
press **Play remix** to hear their estimated musical interpretation over a **quiet,
shared** recording: **“Deliberate Thought” — Kevin MacLeod**, **CC BY 4.0**.

The main React/Vite frontend preserves the approved Natural Earth geography while
adding independent layer controls and reusing stable scientific IDs in voices,
pixel analysis, UI controllers, and the audio mixer. That makes raw-value adapters
an eventual path rather than RGB a permanent science architecture.

## Start the working app

Prerequisites: Node.js/npm (build currently used Node 22) plus npm packages:

```bash
npm install
npm run dev -- --host 127.0.0.1
```

Open **http://localhost:8000**. Existing asset generation is already committed.
To rebuild data or run the static production web files locally:

```bash
npm run build
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

If an older preview remains on that port, stop it before starting the new one.
Music files are served by this app; do not open raw `file://` index files.

Vite production targets static paths (`base: "./"`). Needed runtime things in
`public/` are the local recording, map sources/geometry, `data/markers.json`,
and `scales/features.json`. Non-runtime scientific pipelines can regenerate
further needs separately where configured.

## What you hear

All five controls process the **already playing recording’s samples**. There are
no oscillators, synthesized drones, guide notes or short, restarted MP3 clips.
One buffer source runs through bounded filters/gain envelopes, a limiter and the
master volume. Filter branch names do not imply isolated official stems.

## What you see and do

There are **five metric cards**, each has the same visual/map and sound priority:
click name to focus field then read description and estimated region meaning.
Each line has **In view** (visual+audible enable), and **opacity** (visual density,
not musical intensity / data filtering). Independent cards drive each scientific
field to one shared Natural Earth geographic background.

**Solo / Explore** defaults to a learning view foregrounding one chosen metric;
**Composition** lets eligible visible fields share the original musical recording.
Use geographic “Show land & coasts” or “Selected field only” to choose visibility.
**Reset layers** restores the map’s defaults; **Reset music** stops the playback
transport/nodes—not hides/reinterprets the dataset.

Buttons use keyboard Space/Enter. Use **up/down arrow keys** (or left/right) on
field cards to navigate (Home/End for bounds); tab freely among other controls.

### Explore the image-relative 3 × 4 grid

The separate amber **Sample n/12** marker shows the current exploration region;
the fixed green Vancouver marker remains a geographic reference, not the same pin.
Use **W/A/S/D** or the **arrow keys** while the page background is focused:
**W/up = north**, **A/left = west**, **S/down = south**, **D/right = east**.
The three rows and four columns are image-relative analysis regions, numbered
`row * 4 + column` (zero-based). Movement clamps at the edges (no wrap); **Home**
returns to **region 1**, the Vancouver-associated start. The twelve region buttons
use exactly the same state, so a subsequent keystroke continues from a clicked button.

Keyboard exploration never intercepts typing, sliders, buttons, links, editable
content or modifier shortcuts and does not create/resume audio. Only **Play remix**
may do that. During playback, a new region smoothly updates eligible tempo, CO pad
gain, NOₓ register and bounded precipitation/fire scheduling. A field with no
confident nearest-palette match can remain silent even when selected. Regions are
not coordinates, geographic scans, fire counts or a geolocation request.

### The five controls / voices — plain language

| Field | What you see | What you may hear | What its estimate means / can’t mean |
|---|---|---|---|
| **Precipitation (P)** | Original liquid-rain and frozen NASA source colors over the map. | Separate limited swells within the playing music: more matched rain presence means more frequent slightly stronger filtered swells. Frozen presence produces its own slower, quiet low-frequency swell—both use the same MP3 samples. | Separate estimated discrete mm/hour palettes (0.1–50, with ambiguous overflow). No match, gray/no-data or overflow stays unquantified/silent; no combined gradient. |
| **Active fires (F)** | Original VIIRS fire-source colors. | After rests of at least 8.4 seconds, a gentle filtered accent appears within the existing recording. Higher estimated FRP makes that swell modestly stronger and more open, with no independent tone. | Estimated **0,2,4,6,8 MW FRP**, not fire counts, alarms or incidents per second. Hidden/unclassified fields create no accents. |
| **Carbon monoxide (CO)** | The full near-surface carbon-monoxide field, **not CO₂**. | Five clearly distinct generic pad-volume tiers on a filtered branch of the same recording: low/sparse to controlled strongest presence. | Estimated nonuniform **40,100,130,200,500 ppbv** anchors; no extra linear/65 ppbv threshold. No official stems were obtained. |
| **Nitrogen oxides (NOₓ)** | Full original near-surface model colors. | Higher estimated NOₓ opens a gentle low-pass filter from **1,200 Hz to 16,000 Hz**: low values retain mostly the music’s low frequencies (darker); high values restore brighter treble. This is a low-to-high change in the recording’s spectrum, not a pitch, buzz or guide note. With no eligible NOₓ voice, the music returns to full spectrum. | Estimated **0.001–10 ppbv** labels are converted using **log₁₀** before filter rank, never linear concentration or latitude/longitude. |
| **Temperature (T)** | Full original GEOS-FP near-surface temperature colors. | Warmer means faster shared music: estimated −40…+40 °C maps to **0.83×–1.22×**. Hidden, absent or inaudible temperature returns speed to 1×. | Playback rate inherently changes pitch too; this is not temperature as altitude. Estimated T2M labels retain NASA’s short-caption **3 m** versus detailed-caption **2 m** discrepancy. |

Values in guide are **estimated from colors against approximate reviewed raster
labels**, not an authentication of every pixel as absolute measurement. UI region
buttons sample regional **color evidence**; they never automatically discover
exact latitude,timestamps nor a scanned location's music semantics. For NOx log10
happens before musical semantic register, not marker ERR→fire accent maximum loud.

See `color_scales/REPORT.md` and `color_scales/schema.json` for caution boundary
logic, `data/metadata.json` for actual download snapshot fields, `public/…` for
serving artifacts. `src/audio/musicMappings.js` groups instrument choices;
`src/audio/RemixEngine.js` uses actual mp3 playback with shared relative clock.

## Playback and getting sound

Always explicitly activate: **Play remix** → browser loads and decodes MP3 → context
can then resume as allowed. No autoplay on launch, selecting metrics, region guides
or Vancouver pin. **Pause** stops scheduling/suspends current context; resume via
the same explicit listener. **Reset** stops track and scheduled source accents.

- **Master volume** uses default 0.38, cap 0.50. Measured post-limiter RMS is ~1.6× the prior quiet-mix baseline; the original waveform and dry-gain 0.085 remain the source-side envelope.
- **Mute** receives all player pipeline including backing track; unmute restores it.
- If too quiet, first check Mute and master slider, OS/browser output level/headphones
  disconnected, app has MP3 source loading resolved, disabled source not active.
  Adjust local playback volume comfortably while listening before proposing code changes. Some
  internal image classes can remain silent comfortably, but the licensed backing
  source always needs explicit user play.

The Vancouver origin is a reserved **metadata reference**, not a real listener GPS
position or scientific source calculation. Optional local-rendered art uses an
explicitly synthetic model described below; bypass remains the default. Source-patterned original isn't louder in higher
scientific quantile nor evil spray-relevant sound of the pollutant chemicals.
**Do not make the song gain high just because a fixture green button on screen.**

## Spatial origin marker and independent local renderer

Crosshair labeled **Vancouver, BC** (49.2827°N, 123.1207°W) serves as the user's
user-instructed initiating geographic reference (not requested GPS). Lat/long of these data do not currently control
time, pitch, rhythm, or automatic pan. Original intended future coordinate origin
is inside listener head at Vancouver local **0,0,0** when traceable model available,
not browser cross-shaped mystery. Current map displayed x≈15.8%, y≈22.6%; actual
raster matches may change with calibrated geodata inputs.

See `src/lib/spatialOrigin.js` and `src/lib/VANCOUVER_ORIGIN.md` for documented structure.
No user geolocation or actual hidden coordinate trick beyond mention of the prompt.

## Implementation paths — use source files

- **input images** — `download_eic.py`, `data/images` and `data/metadata.json`.
- **scientific-scale evidence** — independently processed `color_scales/output/*`.
- **preprocessing** — `sonification/palette_library.py` finds closest legitimate RGB
  classes across irregular accepted bins, discards uncertain/neutral/no-data.
  `sonification/build_sonification_assets.py` produces regional estimates without
  geographic frequency/timing assumptions.
- **geography** — `build_geographic_overlays.py` + `overlay` Natural Earth vectors;
  atmospheric source PNGs remain complete original images, not peak percentages.
- **app** — `src/` React/Vite. `useSonification.js` can eventually become standard
  integration hook but must not add side effect on mostly named fields at mount.
- **deployment** — serve `dist/` as a static app with mp3 defined in `public/audio/`
  and no citations omission. Plan use of supported DeepSpace deploy docs & account,
  not an existing silent service launched by network-free local server.

Optional rebuild commands:

**Geographic outputs** may refresh live NASA downloadable assets; only do so to
recalibrate models/along NASA updates, not if just wanting display updates.

```bash
PYTHONPATH=. .venv/bin/python -m pip install -r requirements-overlay.txt
PYTHONPATH=. .venv/bin/python build_geographic_overlays.py
PYTHONPATH=. .venv/bin/python -m sonification.build_sonification_assets
PYTHONPATH=. .venv/bin/python scripts/prepare_jukebox_assets.py
```

The latter stages correct map proxies, geography and `scales/features.json`.
Public committed source in app stats not arbitrarily deleted meaning previous
accurate mapping results. `generated` local `overlay-site` and `dist` are not
primary source.

## Music license / legal notice

> **Deliberate Thought** — **Kevin MacLeod**, incompetech.com.
> **Creative Commons Attribution 4.0 International (CC BY 4.0)**.

Source: <https://incompetech.com/music/royalty-free/mp3-royaltyfree/Deliberate%20Thought.mp3>
License & attribution: <https://creativecommons.org/licenses/by/4.0/>.

69 BPM and approximately 2:57 tracks as provided by the user, local `public/audio/…mp3`.
No official stems were identified. Program applies data-responsive generic filters,
playback-rate changes, generic filters and gain envelopes on the original samples—not a claimed official
extracted choir, advertised faithful transcribed musical notes, or NASA endorsement.
See `LICENSES.md` + `public/attribution.json` for local network source hash and terms.

NASA imagery remains NASA data; Natural Earth land/coast data is public domain.
Estimated raster palette mappings not validated numeric level; do not act on music
for essential alerts/environmental health/data archiving decisions.

## Verification and review protocol

The unit/module tests live in `tests/`, selected frontend `test-js` fixtures:

```bash
npm test
npm run build
PYTHONPATH=. .venv/bin/python -m pytest -q tests
PYTHONPATH=. .venv/bin/python -m pytest -q color_scales/tests
```

Run isolated process for **scientific independent color_scales suite** because one
of its tests checks download_eic **not imported** in that subprocess. If all-tests
root import collision occurs, document known module-isolation instead of changing
required partition.

`npm run test:browser` uses Playwright/Chromium against `JUKEBOX_URL` (default
`http://127.0.0.1:8001`). Start a local production server, for example
`python3 -m http.server 8001 --bind 127.0.0.1 --directory dist`, before running it.
For a current-source Vite server, run `JUKEBOX_URL=http://127.0.0.1:PORT npm run test:browser`.
The separate `npm run test:spatial` stereo offline audit uses this same server variable.
The spatial browser audits were run **15 November 2026** (Node 22.19.0).
`npm run test:visibility` verifies all-five-map hiding/restoring and keyboard controls; run it against a local server as well.
`npm run test:spatial` passed on a fresh Vite server `http://127.0.0.1:8017`;
the full production `npm run test:browser` passed against freshly built `dist/`
on `http://127.0.0.1:8018`, using the actual current intro's Skip control. The
latter checks no context on raw load/navigation, one context/one MP3 decode,
actual decoded duration **177.3913 seconds**, one continuous recording source,
**zero oscillators**, spatial On/Bypass with no extra fetch, final left/right
RMS/peak, pause/reset/replay, mute/Solo/Composition, layer hiding, WASD/Home,
Vancouver inertness, 503 retry, accessible native buttons and 390 px overflow.
The width was exactly **390 px**, with transport controls reachable.

Independent offline tests used two different signed prerecorded arrays (with
positive and negative samples) through a `ChannelMerger`. Center/coincident
left/right RMS was **0.0538347 each**, correlation **1**. At right: left/right
**0.0267536 / 0.0588445 RMS**, peaks **0.0454910 / 0.1093811** (right 2.1995×).
At left: left/right **0.0586027 / 0.0262113 RMS**, peaks
**0.1094381 / 0.0441370** (left 2.2358×). These verify the selected panner's
directional channel behavior; not subjective perception or measurement of a
physical head. Five independent offline cases had five prerecorded sources and
zero oscillators; panning created no extra recording events.

The production recording window measured analyser **RMS 0.00311576 / peak
0.00913688** (per-ear RMS **0.00556700 / 0.00319546**, peak **0.01331956 /
0.00673370**). Short analysis windows naturally vary with music and envelopes.
Current coordinated baseline is master **0.38**, cap **0.50**,
**dryGain 0.085**, as tested in this audit; that later volume baseline is not
attributed to the spatial renderer. Prior measurements from .22 are historical,
not simultaneously matched gain comparisons. No further automatic boost should
be inferred. Browser/audio hardware **subjective audibility and headphone
localization remain unverified/listen needed**.


No configured DeepSpace integration or deployment was used or claimed here. The app
is built with Vite and checked with native Node/Python/Playwright tooling. Deployment
remains a separate action requiring explicit user authorization.

## Contributor memory

See [`AGENTS.md`](AGENTS.md) for changes-scoped agents: **no force push/no hard reset**
existing development worktrees; retain attribution; source warnings; honest estimated
versus verified data boundaries; view-hidden=audible-disabled; explicit start only;
no brightness/location-as-science attempts; and exact verified test commands.

## Opt-in local spatial renderer

`src/audio/spatialRenderer.js` is a small DOM-/React-independent output adapter
for the current `RemixEngine`, not a replacement transport. The musical graph is
`shared decoded recording → existing filter/gain branches → master → spatial
renderer → limiter/analyser → destination`. The renderer defaults to **bypass**,
which follows the original stereo path; enabled routing instead uses only the
spatial path. It never connects both at once.

During spatial operation, the existing stereo mix is downmixed once to mono by
the panner using its documented standard channel-downmix behavior; it is not
interpreted as two prelocalized channels. The generic browser **`PannerNode`
with `panningModel='HRTF'`** produces the binaural estimate. This is not CIPIC,
HRIR convolution, or a measured head model. `equalpower` can be explicitly
selected as a simple device/accessibility fallback. An unavailable Panner leaves
ordinary stereo playing and reports `available: false`; the explicit opt-in
control would receive an explanatory error. HRTF/about-headphones messages must
not imply a guaranteed subjective localization experience.

Coordinates are **synthetic listener-local metres**:
`+x = right/east`, `+y = forward/nominal north`, `+z = up`. At the nominal
default listener `(0,0,0)`, source `(0,1,0)` is one metre forward. These
correspond to the reserved Vancouver listening *reference*, not a real GPS lock
or a geodetic projection. Native Web Audio's convention is internally converted
to `+x = right`, `+y = up`, `-z = forward`. A supplied facing forward and up are
normalized, orthogonalized, and used to transform the source into the canonical
native head frame; orientation angles do not claim measured compass heading.

Only explicit Cartesian metre data belongs in this API. Do not pass unlabelled
latitude/longitude, RGB pixels, 3×4 sample indexes, display aspect ratios or
Vancouver's marker percentages as positions. This does not move sources when
WASD moves the palette explorer, start audio on mount/map navigation, or alter
pitch/timing from coordinates. There are no microphone/camera/geolocation calls
and no dependency on the older independent guide engine `window.earthAudio`.

Minimal usage after retaining the one existing engine:

```js
// Setup is inert: no context, buffer, fetch, clock or playback allocation.
engine.setSpatialSourcePosition({ x: 1.5, y: 0.25, z: 0 });
engine.setSpatialListenerPosition({ x: 0, y: 0, z: 0 });
engine.setSpatialListenerOrientation({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 });
engine.setSpatialDistanceModel({ referenceDistance: 1, maxDistance: 10000, rolloffFactor: 1 });

// only existing Play may create/resume context and decoded recording
await engine.play();
engine.setSpatialEnabled(true);   // explicit user opt-in; mono downmix+HRTF
engine.setSpatialEnabled(false);  // Bypass; original stereo recording
```

Also exposed are `engine.spatial.getDiagnostics()` and the reusable module's
`attach(context, existingInputNode, existingOutputNode)` / `dispose()` lifecycle.
Constructor options permit declared `HRTF` or `equalpower`, an inverse distance
model, finite reference/max distances and a nonnegative rolloff. SetParameter
ramp times have a small time constant, not a random near-origin sweep. Pure
helpers cover distance, listener-relative geometry, Web Audio conversion,
azimuth `atan2(dx,dy)`, elevation `atan2(dz,√(dx²+dy²))`, spherical wrapping,
zero-radius behavior, head-radius ITD explanation and bounded inverse gain.
The ITD/spherical helpers are informational: only the native Panner performs
this minimal implementation's binaural processing.

Inverse pressure gain is bounded by the `referenceDistance`, so co-location or
negative/zero relative distances do not produce infinity. A coincident source
has `directional: false`; an arbitrary front/up azimuth is not manufactured.
This is artistic distance not scientific geodistance or an absolute perceived
loudness model. Common `distance/343` **propagation delay is deliberately not
applied**: doing so would confuse the shared recording phase/repeated buffers or
add a second source clock. Native panning supplies the selected binaural cues.

No separate soundtrack, oscillator, generated test note, per-palette Panner
bus or fresh MP3 snippet is created. Source selection/solo/gate behavior stays
upstream, before one final spatial output. The Stereo `getOutputMetrics()`
retains `{rms,peak,contextState}` and adds `channels: [{rms,peak}, {rms,peak}]`
plus spatial diagnostics. The splitter feeds meter-only analysers, never the
output or another music buffer. Files/purposes, test commands and limitations:

- `src/audio/spatialRenderer.js`: local geometry, bounded model and one-route
  switchable output. No allocation until `RemixEngine` already creates a context.
- `src/audio/RemixEngine.js`: single lazy context/source/buffer/clock remain;
  only the approved **Deliberate Thought — Kevin MacLeod, CC BY 4.0** recording.
- `test-js/spatial-renderer.test.js` and expanded sonification/origin tests:
  directions, seams, invalid values, centre-route uniqueness, co-location,
  unsupported/legacy listener contexts, buffer/replay/lifecycle and inert origin.
- `npm run test:spatial` against a **fresh current-source Vite** server:
  independent offline stereo `ChannelMerger` signal; known positive/negative
  differing inputs and per-channel RMS/peak, not a subjective-listening claim.
- The normal Chromium audit also checks mute/bypass, hidden fields/Solo, one
  decode/source with no spatial fetch, pause/reset/replay and narrow layout.

### Legacy static guide—not the Jukebox transport

The older `site/spatial-audio.js` remains a separate static-guide experiment,
including camera-dependent behavior and controlled oscillator test tones. Those
sound-generating examples are **not authorized within or imported into**
`RemixEngine`. The React music experience should use the shared renderer above;
it does not import `window.earthAudio`, create its second soundtrack or request
head tracking. The optional generic Panner is not evidence CIPIC is downloaded,
licensed, transformed, correct or physically validated. **Manual stereo-headphone
localization and user-experience review remain needed/unverified by this agent.**
