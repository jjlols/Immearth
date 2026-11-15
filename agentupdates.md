# Agent updates

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
