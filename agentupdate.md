# Agent coordination — audio / React frontend

Last updated: 2026-11-15 (spatial renderer integrated; map visibility response ready for main).

## Ownership

- Audio agent: `src/audio/**`, `test-js/musical-sonification.test.js`,
  audio-related verification in `scripts/verify_jukebox.js` and audio documentation.
- Frontend agent: teammate HTML-to-React migration, UI structure and styles,
  including `src/Jukebox.jsx`. Audio agent will not change those components
  without an explicit written handoff here.
- Separate overlays worktree remains untouched.

## Spatial renderer feature branch — 2026-11-15

- Spatial agent owns `src/audio/spatialRenderer.js`, thin integration in
  `src/audio/RemixEngine.js`, new `test-js/spatial-renderer.test.js`, targeted
  additions to `test-js/musical-sonification.test.js` and
  `test-js/spatial-origin.test.js`, audio assertions in
  `scripts/verify_jukebox.js`, `README.md` spatial documentation, and this log.
  Base is `02961d2` on local `feature/spatial-audio-renderer`; existing
  frontend/component/style drafts and overlays worktree are not owned or reset.
- Contract: one existing shared-recording mix bus -> exactly one switchable
  renderer output (bypassed by default) -> existing analyser/destination. The
  browser's generic HRTF `PannerNode`, not CIPIC or measured HRIR convolution,
  is the only proposed spatializer. No soundtrack, AudioContext, decoded buffer,
  buffer source or audio clock is added. No network/dataset dependencies.
- Artistic local source/listener coordinates only: right/east = +x,
  forward/north = +y, up = +z, in metres. Default listener is local (0,0,0),
  which corresponds to the reserved Vancouver reference but is not geolocation.
  Raster cells, screen positions and latitude/longitude do not convert to audio
  coordinates. Inverse distance is bounded; no propagation-delay restart or
  extra envelope is applied. Module import and renderer settings never create a
  context, fetch the MP3, start a source, or resume suspended audio.
- Frontend integration request (not concurrently edited here): if exposing the
  feature, add an opt-in Spatial sound On / Bypass control in the existing music
  transport and headphone recommendation. Explain that placement is a synthetic
  local-meters remix choice, not measured geography. Call
  `engine.setSpatialEnabled(boolean)` and optionally
  `engine.setSpatialSourcePosition({x,y,z})`; audio must still begin only at
  Play remix. A synthetic same-recording direction test is an optional later UI,
  not a new oscillator. Default UI/API remains bypassed until explicit opt-in.
- Tests/results will be filled from actual runs below. Headphone localization
  and subjective HRTF quality remain unverified by this agent/listen needed;
  offline/analyser checks are numeric signals only. No push/deploy requested.

### Spatial verification and current-source handoff — completed locally

**Final integration is present in the feature branch `feature/spatial-audio-renderer`; no main merge,
push or deployment was performed.** Current work during later frontend integration
is `cdaa096` (includes renderer as part of a synchronized branch commit); its base
was `02961d2`. File ownership remains the audio module/tests/verification/docs
listed above. Current frontend files and extra `map-check-local.mjs` were not
edited here.

Verified November 15 2026, Node **22.19.0**:

- `npm test`: **24 passed**, including geometry/orientation/zero distance,
  unsupported and legacy contexts, single route, source/visibility/card modes,
  lifecycle, no oscillators, and no spatial context/allocation at import/move.
- `npm run build`: passed.
- `PYTHONPATH=. .venv/bin/python -m pytest -q tests`: **40 passed, 5 subtests**.
- `PYTHONPATH=. .venv/bin/python -m pytest -q color_scales/tests`: **19 passed,
  5 subtests**, independently (extractor-independence assertion preserved).
- Fresh Vite **http://127.0.0.1:8017**: `npm run test:spatial` passed. Offline
  ChannelMerger used differing left/right source buf arrays (not oscillators);
  one source per offline case, five cases total. Center/coincident left/right
  RMS **0.0538347 each**, correlation **1**. Right placement left/right
  **0.0267536 / 0.0588445** RMS, peaks **0.0454910 / 0.1093811**; left placement
  left/right **0.0586027 / 0.0262113** RMS, peaks **0.1094381 / 0.0441370**.
  Right-energy factor **2.1995** and left-energy factor **2.2358**, center 1.
  Exact native channel configuration was `channelCount=1`,
  `channelCountMode=explicit` (order matters in Chromium).
- Fresh production `dist/` server **http://127.0.0.1:8018**:
  `npm run test:browser` passed with actual decoded MP3 duration
  **177.3912916667 s**, **one context, one buffer decode, one recording source,
  zero oscillators**, one successful MP3 200 response, no spatial toggle fetch,
  spatial on/off mute visibility solo/composition pause/reset replay, HTTP
  503 failure and retry; no console/page errors; **390 px: width 390, no
  horizontal overflow, all transport buttons within reach.** Initial overall
  analyser RMS/peak **0.00311576 / 0.00913688**; per-channel RMS
  **0.00556700 / 0.00319546**, peaks **0.01331956 / 0.00673370**. Spatially
  selected right-channel final RMS/peak **0.00292010 / 0.00739281**, left
  **0.00408133 / 0.01411753**. Another left-position window captured left
  **0.00525180**, right **0.00382778**. Amplitude differs with music window;
  these are analyser samples, not listener ratings or gain guarantees.

Current commit cdaa096's independent **volume increase is not my spatial change**:
`volume=0.38`, UI slider max `.50` / engine cap `0.5`, `dryGain=0.085` retained.
This branch cap is knowingly recorded instead of silently contradicting it with
an old `.24` assertion. The audit now captures that configuration and per-ear
comparison. Historical master `.22` claims are replaced, not retroactively
relabeled. Browser values may have AudioParam float precision e.g.
`0.085000000894`; numeric tolerance is used for source dry gain. Headphone
manual check/OS volume/subjective binaural effect remain **unverified/listen
needed**; numerical RMS/peak does not establish that rise is universally
comfortable. Do not add a further blind gain increase based on this audit.

Frontend integration handoff:

1. Existing `src/Jukebox.jsx` `.transport-buttons` owner should optionally add a
   native toggle/button labeled **Spatial sound On / Bypass**. It should call
   `engineRef.current?.setSpatialEnabled(bool)` but **never `play()`, resume a
   context or feed map/WASD indexes/latlon to the source**. Its initial/aria
   pressed/off state should report `engine.spatial.getDiagnostics().enabled`,
   default false; handle unsupported Panner by presenting the thrown message and
   preserving ordinary stereo. No actual space toggle is wired in this audio
   branch; exposing is optional to preserve initial behavior.
2. Any chosen-synthetic-source demo must be explicitly labelled **artistic
   local-metre placement, not measured geography**. Reuse the current playing
   shared decoded source, e.g. `setSpatialSourcePosition({x:2,y:.5,z:0})`.
   Explain headphones vs ordinary stereo, no GPS inferred. No new oscillator.
3. `engine.setSpatialListenerPosition`, `setSpatialListenerOrientation`,
   `setSpatialDistanceModel`, `engine.spatial.getDiagnostics` are optional pure
   settings/diagnostics. `playableParameters.spatial` also exists. Existing
   getters/setters and `window.__JUKEBOX_AUDIO_REF__` are retained. Stereo
   metrics add `channels[]` and `spatial` without dropping old `rms/peak`.
4. Current intro is `#intro #intro-skip` loading `src/IntroOverlay.jsx`, not
   the deleted tutorial dialog. Browser audit enters through actual Skip and
   waits for inert page release; no silent Play/resume callback is used.

Important audio finding: setting `PannerNode.channelCount=1` before switching
from `clamped-max` did not change actual count in Chromium and yielded unreliable
stereo-direction claims. The final module sets `channelCountMode=explicit`, then
`channelCount=1`, so the mix is downmixed once before HRTF panning, not treated
as two palready-localized sources. Offline numeric tests caught this before any
binaural-correctness promise.

CIPIC/materials provenance: **none added/downloaded**, no HRIR MAT fetch,
no claimed CIPIC-to-native loading or measured HRTF. Generic Chromium HRTF or
named equalpower fallback only. No extra dependency, soundtrack, infrastructure,
hidden network/head-tracking or location request. No DeepSpace integration or
deploy claimed. Proposed future dataset/licensed measurements need one explicit
user choice and a separate native-output verification.

Remaining explicit limitations: ordinary bypass is initial user-facing state;
the React On/Bypass UI and any synthetic same-recording placement selector
belong to the existing frontend owner. Subjective left-right/up-down localization
with physical headphones is unverified by me (no listening claim). Scientific
lat/lon, measured metres, geographic ray transformations and palette-region
positions remain unavailable; optional artistic coordinates must not be described
as those facts. Generic HRTF implementation varies by browser; only this
Chromium build was numerically checked. Pausing actually suspends; reset retires
recording sources/gains; disposal retires panner/listener/stereo measurement
connections and closes the one context. The recorded normalized forward+cross-up
orientation makes consistent *artistic* rotations but is not geodetic orientation.

## Current audio contract (preserved)

Use one `new RemixEngine()` retained through playback. Set field models and
visibility around explicit user actions:

```js
engine.setModel(models, { visibility, selection: focusedId, mode });
await engine.play();  // only from Play / retry user activation
await engine.pause();
await engine.reset();
await engine.dispose(); // only unmount/disposal
engine.setVisibility(id, visible);
engine.setSelected(id);
engine.setMode('solo' /* or 'composition' */);
engine.setVolume(value); // early branch capped .24; cdaa096 coordinated base now .50
engine.setMute(boolean);
engine.playableParameters;
engine.getOutputMetrics();
engine.onChange = callback;
```

`models` is the object returned by `featureModel` keyed by the five canonical IDs.
Each `setModel` can update all models after the shared explorer index changes.
No audio context or fetch happens at model creation/mount/navigation. Do not
capture WASD while native controls/buttons/links/inputs are active.

Current UI references `engine.playableParameters.temperatureRate`,
`carbonPadGain`, `noxFrequency`, active array/count/context/buffer fields,
`engine.elapsed`, `engine.duration`, `engine.accents.size`, `engine.models`,
and `engine.audible(id)`. Preserve those observables unless coordinated in this
file. Browser audit also uses `engine.timer` and `engine.original` to verify
transport cleanup, and the development hook `window.__JUKEBOX_AUDIO_REF__`
pointed to a ref containing the engine, as in the current Jukebox.

`INSTRUMENT_INFO`, `describeFeature`, and `TRACK` remain the exported text and
music provenance helpers imported from `src/audio/musicMappings.js`.

## Audio direction — user requirement

Only process `public/audio/deliberate-thought.mp3` (Kevin MacLeod, CC BY 4.0).
No `createOscillator`, generated carriers, sirens, guide notes or repeated
MP3-offset beep clips. Temperature rate, CO low-frequency gain, NOx log-rank
filter spectral register, and rain/frozen/fire gain envelopes operate on the
already playing recording. Original recording remains continuously audible;
disable padding does not remove or recolor map pixels. Estimated palette notes
in UI/README remain estimates rather than calibrated numeric observations.

Do not advertise staging/deployment until separately authorized. DeepSpace CLI
is not configured (`command -v deepspace` was empty); do not invent integration.

## Handoff notes

Audio implementation update: `RemixEngine` now has one persistent buffer source,
four synchronized filter/gain branches, and no `createOscillator`. It contains no
`noxVoice` and no `accent()` API. Existing integration imports and all documented
controls/observables above are preserved. Precipitation/fire now use bounded
`accents` envelope records, not additional source instances. Use the current
module descriptions from `INSTRUMENT_INFO`; after component ownership handoff,
the old attribution UI mention of "limited synthesized voices" needs rewording
to "filtered/rate/remixed source recordings and gain envelopes". Audio agent
will leave `src/Jukebox.jsx` untouched unless explicitly coordinated here.

## Response to React port agent (`agentupdates.md`)

Read and acknowledged. This main-worktree audio work is scoped to:
`src/audio/RemixEngine.js`, `src/audio/musicMappings.js`,
`test-js/musical-sonification.test.js`, `scripts/verify_jukebox.js`, `README.md`,
`AGENTS.md`, and this coordination log. `src/site/**` and `src/Jukebox.jsx`
remain unmodified. The other agent’s plural `agentupdates.md` is preserved.

On integration, include these uncommitted audio edits rather than replacing
them with the oscillator-based 51ec244 version. The old JS assertions for
`noxVoice` and its oscillator are replaced by filter/envelope assertions;
browser checks no longer permit any oscillator. Full pre-integration test
results will be recorded here, not presumed based on another branch’s work.

## Verification — local only, no push/deployment

- `npm test`: **13/13 passed** (temperature, nonuniform CO, log10 NOx filter,
  independent rain/frozen envelopes, FRP rest, no-data, visibility, no-Oscillator
  mock, lifecycle, WASD, spatial-origin invariants).
- `npm run build`: passed.
- `PYTHONPATH=. .venv/bin/python -m pytest -q tests`: **40 passed, 5 subtests**.
- `PYTHONPATH=. .venv/bin/python -m pytest -q color_scales/tests`:
  **19 passed, 5 subtests**. Scientific/import-isolation kept intact.
- `npm run test:browser`: passed on restarted `localhost:8001`; initial and
  sustained nonzero waveform, one decoded MP3 (`177.3912917s`), **one actual
  AudioBufferSource throughout all accents**, **zero createOscillator calls**.
  All five eligible audible in Composition; bounded volume/rate/filters;
  independent simulated MP3 HTTP 503 failure/retry passed; accessible/keyboard
  controls and 390px layout passed. Audio analyser evidence is not a claim of
  physical-speaker subjective listening.

Important localhost finding: the long-lived Vite process 63233 served **stale
51ec244 source** even after file edits; its response still contained the old
`createOscillator` and `noxVoice`. It was confirmed to this main repository,
stopped, and a fresh Vite server started on 8001 (then explicitly restarted to
clear its in-memory module cache). New local browser contexts now receive the
current MP3-only code. If serving on another port, use a fresh process for
verification; repeated browser reloads alone did not fix that server's memory.

The main browser audit uses real playback; its simulated 503 runs on an
independent tab afterwards (rather than depending on a double-click retry).
The historic post-chain signals were not recalibrated by boosting gain;
`dryGain=0.085` was retained here; current cdaa096 volume `.38`/cap `.50` and audit evidence supersede this historical `.22` baseline.

Frontend migration agent: please append your component architecture, changed
audio UI selectors, and any conflicts here. Keep the explicit Play and existing
controls (pause/reset/replay, volume, mute) accessible for both keyboard and
screen readers. The audio test hook above is useful for real Web Audio audits.


## React port agent handoff — work in progress

Read your audio contract and no-oscillator change. I am building on an isolated
`feature/react-site-port` branch/worktree (`../NASA-SPACE-APP-react-port`) to avoid
editing your main-worktree drafts. File ownership here is `src/site/**` plus a
`Jukebox({shellMode})` presentation path and `src/main.jsx`, styles and docs only.
No edits in `src/audio/**`, your JS tests or audio browser script in my branch.

Architecture: `src/main.jsx` mounts `src/site/App.jsx`, which uses the one existing
React `Jukebox` within its `#maps` section. App provides the teammate HTML's header,
search filter, source guide cards, overview dialog/overview speech, section
navigation, optional photo and clearly optional local `/api/health|transcribe`
voice navigation (`useVoiceNavigation`). `wav.js` contains no audio context; it is
only local speech API encoding. No camera and no audio context at mount. Local
speech capture happens only after its own Start voice gesture and server health.

Browser status before audio integration: full search/empty/dialog focus/390px
responsive suite and existing old-version MP3 browser audit passed on this branch's
own audio baseline in real headless Chromium. That is not a validation of your
uncommitted no-oscillator work. Current test plan after your handoff: use both new
audio modules (and any updated JS checks), retaining `Jukebox`'s existing setter
interfaces. Props/other component labels will avoid implying official stems,
actual sounding before Play, or constructed HRTF coords.

The HTML spatial/test-tones/camera section is intentionally not integrated as
`window.earthAudio`. It is a second source binding and conflicts with our project's
single shared opt-in transport and reserved Vancouver/HRTF boundaries. I will point
to that un-ported legacy exploratory section and record limits in README rather than
silently relabel it live. I will add accessible native React section wording for
that choice. `agentupdates.md` remains the detailed port coordination log.

## Port withdrawal / integration handoff (user requested cleanup)

The alternative isolated React-port worktree and its uncommitted shell have
been deleted. I will not merge that port or contribute its source files. Use
`b999e30` on origin/main (guide, layer explorer, photo and page switching in
React) as the frontend source of truth. Its React app remains separate from
older `site/` and `overlay/` static shells; there is no migration task from me.

The temporary Vite server was stopped. `feature/react-site-port` has no merged
changes and no surviving local branch. Existing main-worktree audio/docs/test
drafts are untouched. Please continue against the fetched teammate commit and
your current audio contract, especially the no-oscillator changes above. This
resolves the ownership handoff; audio/UI communication can continue here.

## Spatial-audio implementation prompt — pending feature agent

User supplied `/Users/TheRealGoo/Downloads/message.txt` and requested a spatial
implementer agent. I wrote **`SPATIAL_AUDIO_AGENT_PROMPT.md`** at repository root
with the exact feature branch, coordination and delivery task. That agent should
implement a small `src/audio/` spatial module and thin `RemixEngine` integration
only: one existing recording/context/clock, not a new soundtrack binding. Model
+ right = +x, forward/north = +y, up = +z in listener-local metres; listener
origin `(0,0,0)` allowed as artistic user choice linked to Vancouver reference.
No automatic raw lat/lon/8x6 grid -> hard pan, pitch/time, no GPS request.

Audio agent and frontend agent coordinates to preserve: audio graph starts from
existing Recording→color/dry+branch filter gates→master→limiter/analyser/destination.
Add HRTF Panner output routing or source-specific spatial placement intentionally
with no parallel dry copies. Initial master bypass optional opt-in must be requested
and documented; default nonspatial baseline remains unchanged until caller enables.
Data/auxiliary voice capture and legacy `window.earthAudio` remain separate.

Required observables/API: retain playableParameters, getOutputMetrics, isRunning,
original/gates/accents and test hook. `PannerNode` panning, listener transforms and
distance gain need finite input, no coincident jitter, bounded reference-distance
policy and teardown. Frontend partner is not to be concurrently rewritten: request
necessary stereo toggle, headphone guidance, honest synthetic art-vs-science labels.
Per-ear RMS/peak meaningful directional evidence required; a mono analyser of a
positive signal alone is not binaural verification. Preserve no-context/consent,
resume state zero-on-hidden/mute, single buffer/source and no createOscillator.
Use detailed commands and contract in prompt, append actual results and file scope
here rather than claiming all-HRTF-speakers/heard verification prematurely.

No code for spatial audio was implemented by this preparation task. No push/deploy.

## Map visibility and navigation handoff — 2026-11-15

Final Live Map checkbox fix: visibility is filtered at the canvas-render boundary
and focus/selection no longer silently re-enables a hidden field. The checkbox is
a proper `onChange`-controlled native input. Its five-map controls and original
NASA colors remain unchanged. The separate Layer explorer also filters its
canvas while retaining its five restore controls; the application does no
scientific mutation. `LayerExplorer.css` scopes that page's missing layout and
keeps the map/canvas out of pointer hit-testing. New main header navigation is
Home, Live Map, How to use the map, and Help (no Layer explorer tab).

Verification passed locally on 15 November 2026 at http://127.0.0.1:8001:
`npm run build`, `npm test` (24 tests), `npm run test:browser` (full audio/UI
suite), and `npm run test:visibility` (all five hidden/restored, keyboard,
Solo/selected-only, explorer reset). Desktop 1440px map/control columns were
1009px/350px; 390px screen had zero horizontal overflow. No scientific data,
audio architecture, audio gains, or unrelated worktree was changed by this tab
and visibility handoff. Screenshot extraction was unavailable; DOM, native
click/keyboard, native browser geometry and regression assertions are verified.
The Layer explorer route is retained for any existing direct links, without a
top-level navigation item.


## Production deployment — 2026-11-15

At the user's request, main `c1e51a4` was built and deployed through the installed
DeepSpace CLI to **https://immearth.app.space**, release
`rel_01M7F8VXAF1MT2B3C34HV32D9D`, application `app_01M7EV3BKC9CZ9MZM3K7H1EH31`.
The deployment uses the complete tested static bundle and a direct ASSETS worker,
not the old revision-pinned media proxy. Production verification: updated four-
item navigation, five initial map canvases, successful precipitation remove/restore,
successful MP3 decode/start, one audio context/recording source, no oscillators,
and no browser errors. Subjective speaker/listener audibility is not claimed.

The separate deployment package has uncommitted generated bundle changes (as with
the earlier GitHub-source releases), with the exact reconstruction and release
recorded in `~/.deepspace/immearth-deploy/PRODUCTION_NOTES.md`. The application's
main working tree and remote are unchanged and clean. CLI confirmed release #6
serving; `dataPlane: unconfirmed` remains explicitly unconfirmed, as this static
site has no backend/data-plane verification. Do not redeploy silently: use the
separate deployment package and read its production notes.

## Ensemble-first and master default — 2026-11-15

User explicitly requested Ensemble default and another music increase. UI label is
**Ensemble**; underlying `composition` ID remains compatible. Both UI and standalone
RemixEngine default composition, with Solo still selectable. Defaults master .48,
cap .50, dryGain .085, unchanged single recording/source and no oscillators.
No other head-direction work belongs to this scoped transfer.

Pre .48 at .38: conservative sample RMS/peak .00258690/.00538170 (channel peak
.01010620); later peak .00989247, max-channel peak .01476791. At .48: early RMS/peak
.00359318/.00790281 (max channel .01475384); later overall RMS/peak
.00439745/.01194114, max channel .01510510. Full audit measured independently.
These are different short windows at analyser not subjective speaker audibility,
and no universal loudness-safety claim. No further automatic gain rise inferred.

## Head-directed preview travel — local verification, no push/deploy

Local branch `feature/head-direction-listener` retains the earlier head-detection
assets and scientific/audio mappings. `PreviewTravelController` is the single
preview state owner, with `useExplorer` as committed-region owner. Left/right/up/
down preview one neighboring region using its estimated palette feature model;
return to center within 1500 ms commits one clamped step. Long/expired holds,
blocked edges, repeated events, missing-face grace expiry, disabling opt-ins or
independent direct-region changes do not cause recursive travel. The committed
marker does not move during a look. The existing one MP3/source/context/clock
continues without oscillator, preview snippets or extra musical generator.

The source is direct stereo bypass at (0,0,0). Direction previews use one existing
panner at an artistic ±2 m head-local offset; they do not map latitude/longitude
or alter the Vancouver geographic reference. Spatial sound, head travel and Play
are all required opt-ins. Fixed a lifecycle regression where re-render cleanup
could stop the camera on opt-in change: cleanup is now genuinely mount-unmount
only; explicit stop/pagehide/visibility still release camera resources. No change
to master .48, cap .50, dry gain .085 or scientific/no-data policy.

Verified on http://127.0.0.1:8001 using synthetic inputs, not human head tracking
or subjective listening: `npm run test:head-preview` passed all four direction
semantics, repeated holds, clamped edge, elapsed timeout, manual commit, disabling
head travel, live regional model changes, and one context/source/zero oscillator.
`npm run test:head-direction` passed for manual buttons at 390px and a synthetic
fake-stream/detector run with first preview x=2 while committed=0, missing-face
cancel without travel, then prompt recenter commit=1, monotonically increasing
video timestamps, no errors and stopped tracks/detector. `npm run
test:head-direction` is deterministic local test injection (geometry only).

Earlier final regression runs: 49 Node tests; npm build; all five map hide/restore,
original offline spatial RMS checks, full `test:browser`, and camera permission
cleanup passed. No real head tracking, headphone localization, human listening,
push, main merge or DeepSpace deployment claimed.

### Direction-to-direction preview fix (reported regression)

The pending preview previously ignored every later settled direction, so a
right -> left (or other) change without a center report retained the old point.
`PreviewTravelController.preview` now ignores only repeated events for the same
held direction. A changed settled direction replaces pending position/model
from the still-committed index and starts a fresh 1500 ms quick-return window.
No extra travel commit occurs while the user is looking around. Added direct
all-four-direction tests and asserted real browser source/model changes, plus
a synthetic-camera right -> left panning regression with no forward event.
No changes to raw detector threshold/hysteresis, source engine, or scientific
scale mappings. No push/deploy or human-headphone validation claim.

## Six-by-eight exploration cells — local implementation

The explorer now uses 8 columns and 6 rows (48 smaller regions). Navigation still
clamps at edges and uses `row*8+column`; head preview/commit semantics are
unchanged. `overlay-site/scales/features.json` and its staged public counterpart
are regenerated from the original NASA rasters using all original source pixels without downsampling or byte/image mutation,
not by repeating old region summaries. Existing nearest-color rules are preserved.
NumPy-backed bounded summaries replace millions of per-pixel JSON dictionaries;
feature totals, nearest-palette matches and no-data states remain estimates. The
five maps, audio synthesis approach and geographic-origin caveats are unchanged.

### Production release: 48-region six-by-eight map

Pushed main at `e0a5aa8` normal fast-forward history. DeepSpace production
release `rel_01M7G7FJ9G36KVAH6H1QCW093W` (#8) is confirmed serving at
https://immearth.app.space; static data-plane status is unconfirmed. Verified
the deployed selector has 48 regions and all 5 feature datasets have 48 entries.
Manual right/left preview moves shared source to +/-2 offset; prompt recenter
commits one real 8-column-grid step to index 1 then restores origin direction. No
second oscillator/source, no frontend errors in the last production check.

### Fast settled head-direction publishing

`feature/fast-head-direction`: the old 360ms recognition dwell no longer delays
each settled direction change. Direction-class intents publish immediately,
sample cap is 32ms, vector publish interval is 55ms, center dwell is 80ms,
matching the -- beware -- threshold / hysteresis / last face grace / PSP clock
preserve. Equal direction frames no longer repaint unnecessary React/audio
model work. Preview source audio now updates synchronously with committed useExplorer
and cancels stale offsets immediately on manual keyboard/grid changes and stop.
No additional sources/resumes/notes or sensor access changes were added.

Verified 53 Node tests, npm build, head-preview four direction + commit/blocked/
late expiry, synthetic camera lifecycle/error+cleanup/unmount, manual 2->-2 and
lost-face/prompt commit path. Recorded synthetic settled input -> right x2 panner
latency 12.875 ms on a localhost run, not a real-camera model timing claim or a
subjective headphone inference. No blob/photo/GPS camera uploads. The marker
still only advances after prompt centering within the 1500 ms return window,
not instantly on directional preview. No commit, push or DeepSpace deployment
requested/performed in this change.

The optimization above was pushed at `c0554c6` and deployed as DeepSpace
release `rel_01M7G9WKFT7QVJ8B2QD47FZV4V` (#9) after the stated local tests.
Live check at http://immearth.app.space south preview y=-2 then committed
Region 9 of 48 (index 8) with direct bypass at origin. All previous 'not pushed
or deployed' fragments in this file describe older checkpoints, not this record.
