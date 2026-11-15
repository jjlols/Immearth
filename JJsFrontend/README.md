# JJ's React frontend — standalone working snapshot

The shared React frontend from `34d8257`, together with the verified MP3-only
remix from `98b0241`. This folder includes the complete source, original
public assets and optional voice/test-tone modules. This includes Jj's
authored `GuidePage`, `PhotoPage`, `LayerExplorer`, `PageSwitch`, `App`,
`ColorBlindToggle` and voice access work, retained independently for review.
Nothing here is a live merge of those files back into parent `src/`; it is a
working checkpoint for the next frontend iteration.

## Run and verify

Requires Node 22.15+ and npm:

```sh
cd JJsFrontend
npm ci
npm run dev -- --port 8010
npm test
npm run build
```

Open **http://localhost:8010**. Music is the default view; navigation selects
Guide, Layer explorer and Photo of the day. `?view=guide`, `?view=layers` and
`?view=photo` can be used directly/refreshed.

Build and audit production assets (in a second terminal):

```sh
python3 -m http.server 8010 --bind 127.0.0.1 --directory dist
JUKEBOX_URL=http://localhost:8010 npm run test:browser
```

All local `test-js/**/*` suites assert against **this snapshot's** `src/app`
imports. Last verification: **13/13** unit tests and the **real static-build
The audit decodes the licensed 177.391s MP3 once, verifies all-layer
composition, checks hidden+no-data controls, and creates **zero oscillators**
(no synthesized guide-note). Existing visual/static music frontends use one
Web Audio context and one RAF/browser scheduler for palette-swelling intervals.

## Ownership / next frontend work

- Consolidate colors and layouts across the music, guide, layer-explorer and
  photo pages. Preserve original NASA map colors; accessible wrappers/patterns
  should not replace their scientific source colors.
- Use the included `App.jsx` / `PageSwitch.jsx` view router to define
  old-page/music-view redirection intentionally. There is no disguised second
  React port in this folder and no automatic legacy route is currently added.
- Audio is waveform-only `src/app/audio/RemixEngine.js`. Some captions here
  continue older voice terms; reconcile them via `INSTRUMENT_INFO`. Do not add
  oscillator APIs simply to match old narration.
- `src/site` and `src/overlay` supply styling and optional test-tone/voice
  local APIs under the guide. Their separate exploratory spatial listener is
  **not the current shared Jukebox audio listener** and may be addressed in
  frontend integration rather than conflated into `RemixEngine`.
- Do not automatically deploy this folder over the running production app.
  That is a separate teammate merge/update requiring an explicit approval.
