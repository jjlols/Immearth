# Agent updates

## Listener-origin integration status — fixed/verifying locally

### Browser + full test verification now completed

`npm test` 54 pass, `npm run build` passes. `npm run test:head-direction` passed
manual 390px native keyboard-free-camera and synthetic camera preview/lost-face/
recenter, page errors [], one context/recording/MP3 decode/zero oscillators. The
only test adjustment expected native `positionZ===-0`→+0 normalized semantic0,
*not* weakening coordinates. Full `npm run test:browser` also passed Vite 8019:
source/200+retry, bypass, route/mute, region Winslow, Color, volume/pad/tempo,
Pause/reset/replay, contribution/filter control access,390px no-overflow all.

The actual in-app console sequence **`window.__JUKEBOX_AUDIO_REF__.current`**
was also executed on 8019 (Spatial checkbox first, optional Head checkbox then
head-unselect, explicit Play next, steer +2 then caller listener0 → orientation
+fy,+uz → distance model → source0 → enabled). Immediately and after **700ms**:
`listenerPosition={x:0,y:0,z:0}`, `sourcePosition={x:0,y:0,z:0}`, zero native
displacement, `positionAtOrigin: true`, `route: bypass-only`, dry1 wet0,
`transitioning:true`→false; page errors **[]**. This is the exact reported
issue fixed (not only helper expectation).

**Handoff accepted by integration/test state now; no freeze requested further.**
Please continue any wet/dry smoothing refinements atop this tested source instead
of responding to my older mid-rewrite diagnostics. If manual console resets are
used while **Head travel remains enabled**, any subsequent ≥2 position may be
an immediately following *intentional preview event*, not failure of setter. The
relevant head UI only sets sources when direction/opt-ins active, so disabling
head doesn't re-enable audio by itself and the original shared buffer1 persists.

The current stable branch has a wet/dry crossfade again. I have **preserved it**,
not reverted to hard-disconnect experiments. This resolves the user's report
when the old global-input edge no longer led to bypass or panner-only paths:

- initialized input→panner→wetGain→limiter **and** input→dryGain→limiter, no
  unattended direct dry copy; generic panner explicit one-channel downmix.
- source nonzero-only pan updates, presets at prev/next transitions;listener
  moves now call listener position parameter writer *before* pan writing routing.
- co-location `(0,0,0)` strictly dry 1 / wet 0, native zero canonical.
- `settle()` completes actual fade endpoints for mock/browser tests; it cannot
  spawn a context or independently reset playback. Camera and UI not edited.

`test-js/listener-origin-contract.test.js` green original exact origin, rapid
direction, one-decode lifecycle; `npm test` **54 passed** (includes new value/
geometry coverage). `npm run test:spatial` validates direct 2:1 channels at
actual origin and numeric pan direction distinctions. `test:head-preview` passed:
all four synthetic directions via actual page, one context/source/zero oscillator.
Added `test:origin-signal` offline explicit right→origin sample transitions.
Full browser test+fake synthetic-camera test and final `git status` follow. No
call task missing: placeholder `spatial-renderer.test.js` got history-conflicted
during parallel edits; I did not silently remove it or reset to HEAD. The new
`spatial-renderer-contract.test.js` pure coverage non-geography/distance routes
restores geometry assertions *without modifying the ghost helper*. Please treat
`agentupdate.md` as detailed handoff and do not overwrite this without reread.

### Final handover / more tests

The latest `fade()` records `AudioParam.pendingTarget`, `settle()` just iterates
native gain+XYZ target params. Verified **again `npm test` 54 after this agent
file edit**, `node --check` clean. New `npm run test:spatial-smooth` passes with
bounded <.1 max adjacent-sample jump (direction max .01580; interrupted .07304),
all finite 0 offsets, unchanged panner. Offline origin signal left/right returns
2:1 ratio. No physical headphone claim and no subjective-STL heard judgment.

One recreation script's default `npm run test:spatial-smooth` printed 8001 because
its script retained the old VU env default; dedicated Node/cloud tests explicitly
used fresh 8019 Vite. A full actual Chromium browser audit at8019 WAS actually
passed, plus manual/faked head. Ephemeral test server stopped after test. No
deploy no push. Remaining handoff limit no own camera/head quality claim.

## Active handoff notice — please stop `spatialRenderer.js` edits

At the latest read the file has changed again to `mixGain` / `dryGain` and still
does not feed the global input into `dryGain`, making origin/bypass silent and
leaving the panner chain live at center. My private regression file is intact.
**Other agent: please acknowledge here in plain text "origin-fix handoff
accepted" before any further edits to `src/audio/spatialRenderer.js` or
`test-js/spatial-renderer.test.js`, then pause them until I append the test
result.** I will reconstruct one coherent implementation on the latest draft,
keep no-duplicate-route / gain-fade intent, preserve zero-origin ordinary
stereo and share the complete diff/tests as the result. Do not pull or reset the
current directory; this message preserves your intent while preventing it from
being continuously overwritten. Communication only through agent files as
requested, no built-in agent messaging.

## Please hand off `spatialRenderer.js` for origin-fix verification

The shared audio module was replaced again with uncommitted
`physicalPosition`/`crossfadeGain` during my local edits, and its transient state
now has conflicting private helpers. I have paused changes rather than resetting
it. **Please acknowledge a short freeze in `agentupdate.md` and stop edits to
`src/audio/spatialRenderer.js`/`test-js/spatial-renderer.test.js` until the
origin regression is verified and handed back.** My scope is this single user-
reported recenter/routing issue only. I will preserve your newest click-removal
design and rerun the actual audio tests, not erase your concurrent work.

## Audio/crossfade coordination — 2026-11-15

I am investigating the user's `(0,0,0)` listener/source recenter failure on the
current `feature/remove-preview-clicks` branch, without touching any frontend,
camera, or head-pose code. Please see the **Listener-origin/crossfade handoff**
section in `agentupdate.md` for ownership, reproduction details and updated
results. I will preserve the other agent's uncommitted remove-click crossfade
route and communicate only through these files as requested. No reset, main
checkout mutation, push or deployment.

## Duplicate React port withdrawn — 2026-11-15

The separate `feature/react-site-port` worktree (`../NASA-SPACE-APP-react-port`)
and its **uncommitted** `src/site/` alternative shell have been removed at the
user's request. Its unused isolated branch was deleted with no commits merged.
Its temporary Vite development server was stopped. No author attribution or
replacement is claimed for the teammate's implementation.

**Authority:** teammate commit `b999e30` on `origin/main`, **Move the guide,
layer explorer, and photo page into the React app**, already includes React
guide, photo and Layer explorer views alongside the existing Jukebox. Continue
there rather than reviving an alternative `src/site/` shell.

**Coordination:** please continue using `agentupdate.md` for audio/UI contracts.
The audio agent's uncommitted `src/audio/**`, test and documentation edits in the
main checkout were preserved throughout. Do not treat those as part of the
withdrawn port. No pushes, deployments, force-push, hard reset, or changes to
`NASA-SPACE-APP-overlays` were performed.

## Search handoff: teammate React was recovered on remote main

The true existing teammate authored React port is `b999e30`, and the next accessibility/
color-blind polish is `34d8257`; both are on remote `main`. A clean local `git pull
--ff-only` brought them into main, no merge/cherry-pick. Root React `App` already
uses shared `music | guide | layers | photo` views (`?view=` deep link), and
`PageSwitch` adds navigation and color-blind options. `npm run build` passes.

Use this branch for coherent color/layout consolidation and any legacy→music redirect.
Only public commit history is recovered for the actual teammate work; no viable
local files were found for the uncommitted alternate `src/site/` agent shell.
Early caption `voiceAction` contains old synthesized/guide-note phrases from
teammate and needs shared `INSTRUMENT_INFO` adaptation: current audio remains
one MP3 waveform with zero oscillators (do not reinstate old route). No deployment
or live changes made in the locator action.

## Standalone project checkpoint requested by user

`JJsFrontend/` is a standalone working React snapshot for teammate, not a
replacement nested React component or an automatic merge into the original root
frontend. It copies root `src→src/app`, `site→src/site`, `overlay/overlay.css→
src/overlay/overlay.css`, package manifest/Vite config and original public
fields/audio/features/geometry/attribution. Root `test-js` remains the source
of URL-audit and no-oscillator tests; single test helper script copied in it too.
`npm ci`, `npm run dev -- --port 8010`, `npm run build` supported within it.

Pending work explicitly in its README: shared style/color consolidation, old-
style→music routes via current `App`/`PageSwitch` router, synthesized wording
replaced with waveform shared mapping (rather than actual synth layer), careful
optional voice/module recognition. No live deployment changes in this folder's
creation. Current main and its running deployment stay unchanged.

Browser checks made during that exploratory branch do **not** validate the most
recent teammate/audio-agent versions. Rerun tests on current integrated code.

## Click-removal handoff result — continuous renderer verified

The stable `dryGain`/`wetGain` graph is now the implementation under verification:
one original recording and one panner, both connected once; exactly one programme
route fades audible, never a simultaneously audible direct duplicate. Direction-
to-direction changes only ramp existing position AudioParams; they do not
reconnect the MP3, replace HRTF, or wait for JavaScript settle timers. Returning
to zero source/listener coincidence fades to ordinary direct stereo and mutes
wet output, retaining unequal stereo channel levels. `settle()` is diagnostic,
not a recurring audio teardown. Focused origin, interruption, graph, parameters,
reset and disposal checks pass. `npm run build` passes; rendered-origin RMS
preserves real source 2:1 after returning from right, preserving non-duplicated
one-panner spatial output while rightward measurements remain right-energy-heavy.
Browser continuity audit and remaining full-browser tests are final verification.
No push/deploy performed. Edits may resume in this graph; please retain the
continuous-panner/no-reconnect contract and no new audio source or clock.

### Final verification — continuous spatial renderer

Completed on `feature/remove-preview-clicks`; no main push or deployment. Current
production renderer uses attached-once `input -> panner -> wetGain -> output` plus
`input -> dryGain -> output`, with complementary 0/1 gains and no dual-audible
programme copy. Direction-only changes leave the wet route/one existing panner
intact and automate positions. Changed `fade()` cancels prior automations and
sets the next value so immediate standby/route transitions cannot fade to silence;
direct origin and nonzero panning both measured alive. Own helper `pendingTarget`
supports test-only `settle()`, not a new clock or production teardown. Legacy
listener, panner allocation, pause/reset/dispose and unavailable-panner handling
remain covered by contract tests. Removed obsolete broken script scaffolding
from `test-js/spatial-renderer.test.js`, retaining its import as compatibility
with the new consolidated named contract tests. The audio-engine musical model
and master default were not edited by this origin continuity transfer.

Verified: 54 `npm test` tests, production `npm run build`, full `npm run
test:browser`, `npm run test:origin-signal`, `npm run test:spatial`, `npm run
test:spatial-transitions`, and `npm run test:head-preview` on localhost:8001.
Origin restoration returned separate stereo channels at original 2:1 RMS after
starting rightward. Ordinary direction case max sample delta .0112261, peak
.2852303, no nonfinite samples; rapid interrupted case max .0730934, peak
.2609924, no nonfinite. Both retained exact same panner. Core Chromium had one
context, decoded buffer and source, no oscillator; full mute/reset/mono-HRTF
routing and 390px layout passed. These tests establish graph continuity and
rendered output, not subjective speaker audibility, HRTF localization or a
human listening check. Worktree edits are ready for review, not committed.

## Direction-preview level — local adjustment requested by user

The original one-metre inverse reference meant all four 2 m artistic preview
positions received only 0.5 distance gain before native panning, independent of
spatial wet gains. The default reference distance now matches the artistic
2 m preview radius, giving unity near/center distance gain on left/right/up/
down without adding a second recording/source or changing musical parameters,
master 0.48, source dry 0.085, newer continuous-renderer topology or scientific
scale interpretation. Farther arbitrary sources still use bounded inverse
attenuation. A direct equal-stereo Chrome measurement at the 2 m test source
moved overall each-channel RMS .057-.072 -> .113-.143 (left/right retain
per-ear differences from HRTF). No extra volume slider/mapping was invented.
Node tests assert defaults, four preview unity distances and farther attenuation.
Final default/engine/offine and full browser checks follow; no commit, push or
DeepSpace change performed.

Final directional-level verification: `npm test` (54), `npm run build`, `npm run
test:browser`, `npm run test:head-preview`, `npm run test:head-direction` and
`npm run test:spatial-transitions` pass. Actual app diagnostics report reference
2, inverse rolloff 1, dry/wet continuity and proper bypass after center. Final
offline direction peaks .29116 sequential / .29262 interrupted, max sample
changes .01580 / .07304, both finite unchanged panner, one MP3, no oscillators;
these are not subjective hearing-safe guarantees. All four directions remain
correct, lost face cancels and prompt return commits once. No master/default
scientific-volume increase, push or deploy. Previous referenced test suite had
both old reset and wet/dry tests; this local modification adds radius-preserving
volume change atop that. User can refresh localhost:8001 to audition.
