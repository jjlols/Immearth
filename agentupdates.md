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

Browser checks made during that exploratory branch do **not** validate the most
recent teammate/audio-agent versions. Rerun tests on current integrated code.
