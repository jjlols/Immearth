# Agent coordination — audio / React frontend

Last updated: 2026-11-14 (audio work in progress, **not pushed or deployed**).

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
engine.setVolume(value); // engine caps it at 0.24
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
`dryGain=0.085` and master `0.22` are retained.

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
No automatic raw lat/lon/3x4 grid -> hard pan, pitch/time, no GPS request.

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
