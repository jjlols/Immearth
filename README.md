# Earth Information Jukebox

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

- **Master volume** is deliberately limited (24% default/max set upstream)
- **Mute** receives all player pipeline including backing track; unmute restores it.
- If too quiet, first check Mute and master slider, OS/browser output level/headphones
  disconnected, app has MP3 source loading resolved, disabled source not active.
  Adjust local playback volume comfortably while listening before proposing code changes. Some
  internal image classes can remain silent comfortably, but the licensed backing
  source always needs explicit user play.

Auditory note “inside head” at Vancouver is expressly a future **modeled spatial
adapter** not live stereo/gain. Source-patterned original isn't louder in higher
scientific quantile nor evil spray-relevant sound of the pollutant chemicals.
**Do not make the song gain high just because a fixture green button on screen.**

## Spatial origin marker for the future

Crosshair labeled **Vancouver, BC** (49.2827°N, 123.1207°W) serves as the user's
initiating geolocation reference. Lat/long of these data do not currently control
time, pitch, rhythm, or automatic pan. Original intended future coordinate origin
is inside listener head at Vancouver local **0,0,0** when traceable model available,
not browser cross-shaped mystery. Current map displayed x≈15.8%, y≈22.6%; actual
raster matches may change with calibrated geodata inputs.

See `src/lib/spatialOrigin.js` and `VANCOUVER_ORIGIN.md` for documented structure.
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
The current production audit passed on **14 November 2026, Node 22.19.0**: it checks
no context on raw load/navigation, one context/one MP3 decode, buffer duration,
transport, post-chain signal, Solo/Composition, layer hiding, shared WASD/Home grid
selection, accessible native controls, Vancouver inertness and 390 px overflow.

These tests also run a sustained rain/fire scheduling interval and assert
**zero oscillators** and **one continuous recording source**; a separate simulated
503 tab covers MP3 failure recovery. The latest sampled post-chain waveform had
**RMS 0.0046 / peak 0.0126** initially and **RMS 0.0044 / peak 0.0194** later in
Composition; browser-decoded duration was **177.391 seconds**. Short analysis
windows naturally vary with the source recording. These verify generated output
at the analyser, **not subjective audibility through physical speakers or headphones**.
No gain increase was made; background dry gain remains 0.085 and master defaults 0.22.


No configured DeepSpace integration or deployment was used or claimed here. The app
is built with Vite and checked with native Node/Python/Playwright tooling. Deployment
remains a separate action requiring explicit user authorization.

## Contributor memory

See [`AGENTS.md`](AGENTS.md) for changes-scoped agents: **no force push/no hard reset**
existing development worktrees; retain attribution; source warnings; honest estimated
versus verified data boundaries; view-hidden=audible-disabled; explicit start only;
no brightness/location-as-science attempts; and exact verified test commands.

## Spatial audio

`site/spatial-audio.js` is the shared listening engine. It does not turn map
data into sound. Temperature and the other layers keep their own sonification
and hand finished audio nodes to this engine.

Serve the site over HTTP (Web Audio and the camera need a page address, not a
`file://` document). From the repository root, run `py voice_server.py` or
`python -m http.server 8765`, then open `http://127.0.0.1:8765/site/`.
Headphones recommended.

`voice_server.py` is what Start voice talks to. It spots the site’s command
phrases on this computer with sherpa-onnx keyword spotting (Apache 2.0). The
English model downloads into `models/` the first time the server starts.
Plain `python -m http.server` serves the page, but it does not recognize speech.

`window.earthAudio` is one `AudioContext`. Create nodes from
`earthAudio.context` inside a click or key handler. Do not also connect them
to `context.destination`, or the dry copy will sit in the middle of the head
and undo the spatial placement.

```javascript
document.querySelector("#play-test-tones").addEventListener("click", () => {
  const ctx = earthAudio.context;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = 220;
  gain.gain.value = 0.04;
  osc.connect(gain);
  earthAudio.addSource("example", gain, { longitude: 20, latitude: 5 });
  osc.start();
});
```

- `addSource(id, audioNode, { longitude, latitude })` routes the node through an HRTF `PannerNode` on a sphere around the listener. Longitude `0` is straight ahead, positive longitude is east (to the right), and latitude is elevation, with north up.
- `removeSource(id)` disconnects that source. The caller still owns the node.
- `setSourcePosition(id, { longitude, latitude })` moves it. The move follows the long way around the sphere instead of passing through the head.
- `setMuted(id, true)` silences one source. `setMasterVolume(0..1)` is the master gain.
- `setHeading(degrees)` turns the listener. Positive degrees turn toward the east. The turn is smoothed so the HRTF filters do not click.
- `recenter()` keeps the sound where it is and calls the direction you are facing now "forward" (heading 0).
- `on("headingchange", callback)` passes `{ heading, description }`. `off` removes the callback. `describeHeading()` is text such as "Facing Africa, 20 degrees east."

Place names are listening landmarks for the direction in front of you, not political borders. At the start, forward is the prime meridian, so 20 degrees east is described as Africa and 90 degrees west as the Americas. After Recenter, the degrees are measured from that new forward.

`getHeading()`, `nudgeHeading(delta)`, `getSource(id)`, `startTestTones()`, and `stopTestTones()` back the page controls. While test tones play, their ids are `test-tone-front`, `test-tone-right`, `test-tone-back`, and `test-tone-left`.

To hear it: press **Play test tones**. Four soft pentatonic notes fade in, at longitudes 0, 90, 180, and -90. Focus **Listening direction** and use the slider or the left and right arrow keys. Those arrow keys do nothing from the rest of the page. The text line under the title is also announced through the page status region. **Turn left**, **Turn right**, and **Recenter** do the same as the voice phrases `turn left`, `turn right`, `recenter`, and `test tones` (after **Start voice**). `stop test tones` or Escape stops the notes.

**Use camera to turn with your head** stays off until pressed. Tracking runs on this computer. The camera picture is not recorded or uploaded. Turning the button off stops the camera completely. If the face leaves the frame, the last direction holds, then eases back to forward. Permission denied and a missing camera leave a written message, and the slider still works.
