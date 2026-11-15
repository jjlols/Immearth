# Music attribution and third-party data notices

## Deliberate Thought — backing music

- **Title:** Deliberate Thought
- **Artist:** Kevin MacLeod
- **Source recording:** [incompetech.com (MP3 provided by project brief)](https://incompetech.com/music/royalty-free/mp3-royaltyfree/Deliberate%20Thought.mp3)
- **Artist website:** [https://incompetech.com/](https://incompetech.com/)
- **License:** Creative Commons Attribution 4.0 International — [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- **Local copy:** `public/audio/deliberate-thought.mp3` (download filename supplied by brief)
- **Unmodified duration metadata checked with ffprobe:** 177.456 seconds.

**Required attribution:** **“Deliberate Thought” Kevin MacLeod (incompetech.com) — licensed under Creative Commons: Attribution 4.0 International (CC BY 4.0).** See full license at <https://creativecommons.org/licenses/by/4.0/>.

This project *modifies* the recording locally: Web Audio playback uses one decoded original MP3 at deliberately restrained gain; low-pass/high-pass or other generic settings, optional parallel filter gains, and finite synthesized accents tied to visualization-derived scientific color-palette interpretation. No official isolate synth/choir stems were obtained or used, no notes are inferred from the recording as scientific data, and no claim of official music-specific provision exists. Timestamp/bpm README description of pure source: 69 BPM and 2:57. Restating the MP3 title and artist is independent of NASA administrative endorsement.

The author’s licensing guide is at https://incompetech.com/music/royalty-free/licenses/. The Copy’s official reference catalog page remains JS-driven; it was not asserted to be a machine-known track-stem registry.

Scientific maps remain NASA assets; they retain all existing caveats. Independent Natural Earth vectors are public domain. Color scales stay estimated reviewed raster interpretations; no value is authoritative because a converted musical frequency is output.

## Local optional MediaPipe camera investigation (`@mediapipe/tasks-vision@1.2.3`)

Pinned Apache-2.0 package/runtime preserves its license in
`public/head-tracking/MEDIPIPE-LICENSE.txt`. Local WASM, exact task-source URL,
package integrity, hashes and limitations are in `public/head-tracking/PROVENANCE.md`.
The task is fetched only after explicit camera consent, not on Live Map mount.
No frames are served from this repository, no HRIR/CIPIC or other sound file is
added. Head pose estimation runs locally after explicit camera opt-in; unsupported, unavailable and uncertain pose states still retain the manual fallback. This
must not be confused with an eye-gaze or geolocation-based direction service,
nor with the continued single Kevin MacLeod audio transport license.
