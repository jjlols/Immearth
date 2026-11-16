# Task: Incremental, test-verified spatial audio for Earth Information Jukebox

Work in `/Users/TheRealGoo/NASA-SPACE-APP` on a **feature branch** from the current
`main` (last checked `02961d2`, also `origin/main`). A separate teammate/agent is
working mostly on React frontend/UI (`src/guide/**`, `src/App.jsx`,
`src/Jukebox.jsx`, page styles/navigation). **Use `agentupdate.md` to coordinate**
from the start: record your ownership, current base, contracts, handoff requests
and actual test results; read the frontend agent's updates before merging. Do not
silently replace components or the other agent's incomplete audio work.

Before edits, inspect and preserve the existing state as described in `AGENTS.md`:
`git status --short --branch`, `git worktree list`, `git log --oneline -6`, fetch
`origin` if needed, and read `agentupdate.md`. The existing `..-overlays` worktree
is off-limits to resets/cleanup. No force-push, hard reset, broad deletion, main
push or deployment without specific user permission.

## Audio reference and intended task

Read `/Users/TheRealGoo/Downloads/message.txt` (spatial-audio explanation supplied
by the user) for Cartesian source/listener geometry, azimuth/elevation, head-radius
ITD, ILD, HRTF/HRIR convolution, distance and propagation delay. CIPIC is an
**optional validated HRTF dataset direction**, not an automatically downloaded or
silently uncredited dependency. Its HRIR interaural-polar lookup would need clear
coordinate conversion, dataset provenance/license, physical measurements and
binaural validation. Do not imply this was implemented when using a generic Web
Audio HRTF `PannerNode` instead.

Current `AGENTS.md` reserves Vancouver `(49.2827 N, -123.1207 W, WGS84)` as the
geographic **reference**, while a listener-relative local origin `(0,0,0)` is
future metadata. The existing nearest-palette/WASD explorer (3 rows × 4 columns)
is image-relative and must **not** directly produce geographic pan, pitch,
latitude/longitude timing or misleading geospatial precision. Read
`src/lib/spatialOrigin.js`, `VANCOUVER_ORIGIN.md`, `src/Jukebox.jsx`,
`src/hooks/useExplorer.js`, `src/audio/RemixEngine.js`,
`src/audio/musicMappings.js`, `test-js/spatial-origin.test.js` and
`test-js/musical-sonification.test.js` before designing the boundary. Also inspect
`site/spatial-audio.js` and its guide hook in `src/guide/GuidePage.jsx` for the
older controlled test-tone behavior. **Do not import `window.earthAudio` into the
RemixEngine or add a second soundtrack/context/binding.**

Implement a **small, reusable, DOM- and React-independent spatial renderer/output
module** owned under `src/audio/` plus a thin engine connection in the current
`RemixEngine`. The desired role is one stereo/binaural output path for the approved
shared decoded recording and its already-existing rate/filter/gain branches,
**not generated notes, oscillators or fresh cloned MP3 events**. If per-field
spatial sources are desirable, route existing branches without duplicating their
already-playing sound or pretending that map pixels/cells are calibrated physical
locations. Make this explicit in the API and documentation.

## Preserve the audio contract

- Only `public/audio/deliberate-thought.mp3`, **Deliberate Thought — Kevin MacLeod**,
  **CC BY 4.0**, license link retained in LICENSES/attribution/UI. Original official
  stems were **not** available; generic filter/gain/spatial branches are remixes.
  No new soundtrack files, unlicensed HRIR downloads or reattributed NASA noises.
  The existing **no-oscillator/no-guide-tone** implementation is authoritative.
- Exactly **one lazy AudioContext**, one decoded original buffer, one shared
  transport clock for the soundtrack. It is created only by explicit **Play remix**
  or subsequent Retry—not mount, monkey-patched module imports, camera, microphone,
  WASD, map/region moves, Vancouver marker, page switching, or feature metadata.
- Keep `play`, `pause`, `reset`, `dispose`, `setModel`, `setVisibility`,
  `setSelected`, `setMode`, `setVolume`, `setMute`, `elapsed`, `duration`,
  `original`, `accents`, `gates`, `timer`, `playableParameters`,
  `getOutputMetrics`, `onChange` and `window.__JUKEBOX_AUDIO_REF__` behavioral
  compatibility with the existing browser audit. Preserve or extend meaningful
  observables rather than replacing them with mock knobs.
- The original decoded buffer remains one single `AudioBufferSourceNode` reused
  across field envelopes. One source of music cannot accidentally become two
  dry copies by audio-bar filters. A master connected both to a panner and
  directly to the destination (or unmuted identical branches at a coincident
  location) doubles the center signal. Test that.
- Pause actually suspends; reset retires timers/envelopes/source/nodes while
  suspending the context; dispose closes and releases it. All new nodes, scheduled
  parameter transitions, listeners, pending load promises, etc. are cleaned up.
  Replay needs another explicit Play. A legacy Play invocation returns state; it
  must not start new contexts automatically from WASD/Home.
- A hidden/focus-ineligible/silent/unmatched voice must receive zero gain. Solo
  selection must not somehow leak other pads through a persistent spatial bus.
  Muting remains truly silent; the master cap stays conservative (`dryGain=0.085`,
  master default `0.22`, max `0.24` unless separately measured and coordinated).
  Maximum eight bounded envelope prescriptions remain, independent rain/frozen
  envelopes, fires >= 8-second rests, and existing scientific estimates unchanged.
- Do not multiply volume by an assumed panner distance cascades or apply the
  same envelope twice across filters/panners. Prevent clipping from multiple
  localized branches; validate RMS/peak before/after and do not blindly boost.
- No microphone/camera integration is a prerequisite for spatial movement. Do not
  request browser geolocation or treat source coordinates as a user’s position.

## Proposed technical scope (keep small; choose deliberately)

1. **Independent coordinate/lifecycle module**, e.g.
   `src/audio/spatialRenderer.js`: caller-supplied listener/source Cartesian
   positions in explicitly documented local metres. Default listener at local
   `(0,0,0)` linked in UI to Vancouver origin. Choose, unit-test, and document a
   single convention (prefer matching message: **+x right/east, +y forward/north,
   +z up**). Provide finite validation and a well-defined camera/world conversion
   before any Web Audio `positionX/Y/Z` assignment. Do not accept unlabelled random
   latitude/longitude as metres or say a co-located source produces a direction.
2. `spatialRenderer` owns/uses only existing `AudioContext` and source/out nodes,
   with `attach`/`connectInput` (or a similarly small explicit contract),
   `setListenerPosition`, `setListenerOrientation`, `setSourcePosition`,
   `setEnabled` or `setBypass`, `setDistanceModel`, `reset`, `dispose` and explicit
   diagnostic data reporting. No timers or audio-context creation on import.
   Consider an enabled-only-after-explicit-opt-in flag default off to preserve the
   current stereo until the user chooses spatial listening; coordinate the phase
   name in `agentupdate.md` rather than silently changing behavior.
3. For a first upgrade, use a Web Audio **`PannerNode` with `panningModel='HRTF'`**
   and appropriate finite listener orientation and source positions connected to
   the existing master/output chain. Choose `equalpower` fallback only as a
   documented accessibility/device fallback, not falsely call it HRTF. Prefer one
   technical model per branch rather than doubling old panners and gains.
   `PannerNode` panning must be enabled only after the shared context has been
   created with permission and must run under its shared clock. Any raw ITD/ILD
   math, if later used, must be separate pure functions and never claimed to be
   equal to CIPIC-filtered signals.
4. Distance uses `distance = sqrt(dx² + dy² + dz²)`. Use a measurable documentation
   supported roll-off/gain policy such as inverse with a safe minimum reference
   radius; `1/r` is pressure not subjective absolute loudness. Clamp bounds,
   no infinite gain at zero relative distance. If this is just an artistic local
   renderer distance **not scientific geodistance**, say so immediately in UI/docs.
   Common propagation delay `distance/343` must not confound the single recording
   phase or every shared-channel time-alignment. ITD sign must follow the supplied
   convention (positive = listener hears the right ear earlier, with appropriate
   Web Audio semantics, if separately computed); do not derive an arbitrary delay
   every frame. Azimuth `atan2(dx,dy)` and elevation `atan2(dz,sqrt(dx²+dy²))`
   are preferred unambiguous angle helpers—not the supplied incomplete `at an`
   pseudocode. Side cases, origin, behind, wrap-around and angular discontinuities
   require tests.
5. Do **not** generate near-zero or coincident position panner jitter or drift.
   Move listener/source parameters with small smooth ramps suitable for bounded
   artistic selection, without aggressive panning sweeps. Do not make an essential
   user experience rely on measured pitch shifts from viewport movement.
6. If the UI counterpart is not already complete, provide exact existing-component
   integration requests instead of editing them concurrently. The frontend owner
   may expose spatial Bypass/On, headphone guidance, listener origin explanation,
   source selection status and a **clearly synthetic** test source (explicit opt-in,
   same decoded recording field/channel only—not a new oscillator). Distinguish
   this artistic test-source placement from later documents/raw geographic data.
7. If implementing CIPIC later, keep it out of the minimal first branch unless you
   have verified actual MAT-to-audio/HRIR loading, signed azimuth/elevation
   conversion, data provenance/license and native output. Treat nearest direction
   and wrap properly for available -80 to +80 azimuth; declare approximations. Do
   not add long unverified samples or remote runtime requests wanted by default.

## Required verification (real signal, not icons)

Add focused pure/helper/engine tests using Node's `node:test` consistent with
`test-js` and extend the actual Chromium audit. Do not debilitate an existing
scientific test to force agreement with a new pan algorithm.

- Cartesian distance, behind/left/right/up directions, coordinate conversion,
  wrap/clamp/orientation spherical continuity, invalid/non-finite input, nonduplicate
  center routing, radius 0 and zero/negative distances, disabled fallback.
- Listener local `(0,0,0)` correctly matches `headspaceListeningFrame` metadata but
  cannot automatically turn latitude/longitude into meter coords or use them for
  pitch/timing. Vancouver button does not start context or music; WASD grid rules
  plus normal Home/clamp/UI focus paths retain their behavior.
- Lifecycle: context 0 before Play (and before any spatial UI if appropriate),
  only one context/one decoded recording buffer across pause/reset/replay; no second
  dry copy on attachment; all newly attached panner/transform nodes retired or
  reconnected correctly; no hidden fields/panners leaking audio; consumed branch
  visibility and Solo/Composition still decide what actually sounds.
- No `createOscillator`, no new BufferSources during spatial/envelope operations.
  No unexpected source fetch if spatial mode is toggled. Mute plus spatial bypass
  works. Any audible HRTF changes are disabled/bypassable with described baseline.
- Measure both **left and right final-channel RMS/peak**. A mono analyser of input
  alone cannot prove binaural behavior. Use an `offline` audio channel splitting
  or `OfflineAudioContext`/captured browser stereo graph robustly without adding an
  output path doubling, and separate ordinary signal checks from directional cues.
  In ChannelMerger tests, feed known positive/negative **different signals** into
  left/right input, not the same signals before panning. Compute numeric left/right
  energy before/after, show a meaningful left/right distinction for appropriately
  positioned input, and confirm correlated behavior for centered sources.
- Complete pause/reset and visible-eligibility testing; no fetch/state assertion
  presented as subjective listening. For manual headphones requiring audible UX
  testing, record `unverified by me/listen needed`, not guessed "heard" outcomes.
- Existing `scripts/verify_jukebox.js` stays meaningful: MP3 HTTP 503/failure+retry,
  actual decoded duration, one context/source, zero extra oscillators, no CPU
  duplicate buffers, analyser generation and no 390px horizontal overflow.
  Record final versioned measured output without generalizing browser analyser
  to subjective binaural perception.

Commands (coordinate with current frontend test routes/server as they change):

```bash
npm test
npm run build
PYTHONPATH=. .venv/bin/python -m pytest -q tests
PYTHONPATH=. .venv/bin/python -m pytest -q color_scales/tests
npm run test:browser
```

Run color-scales Python tests in an independent subprocess unchanged. For browser
tests, use a **fresh current-source Vite or static production server**, matching
`JUKEBOX_URL` correctly (current CUA tests default `?view=music`, not a different host).
Document real port and Node/browser results in `agentupdate.md`.

## Delivery criteria

Do not call finished just because Web Audio code or imaginary CIPIC algorithms
were written. Deliver minimal verified current-code integration (not speculative
untested fragments), measurable positional/bypass signal checks, preserved audio
and map contracts, written docs with coordinate units and optional test-tone
consistency. `agentupdate.md` must list files owned, API changes the frontend needs,
actual test evidence, source provenance/license of extra dataset (if added), honest
remaining manual binaural/HRTF/scientific-location limitations and final result.
No Push, force-push, main merge or deploy without explicit user request/permission.
Seek one explicit user choice for any future CIPIC downloads or extra UI changes;
make reasonable choices locally and coordinate interrupts through the notes.
