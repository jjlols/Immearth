# Local head-direction implementation and investigation: provenance and delivery limits

This folder contains no photographs, no captured frames, no HRIR and no audio.
The React UI attempts only the following local assets after the user explicitly
clicks **Enable camera**. That gesture never starts/fetches/resumes the musical MP3.

- **@mediapipe/tasks-vision 1.2.3**, exact npm package, **Apache-2.0**.
  npm registry metadata at https://registry.npmjs.org/@mediapipe/tasks-vision/latest (checked 2026-11-15).
  Package https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-1.2.3.tgz uses
  integrity `sha512-sxJyfhbN+EamexhaaCmUlw7v8vWWMum7VDsORe6d4c8Dk/xlI4qiIgo2Sw9cE9hpvYhVRRVLIA8y605FbqWkNeQ==`
  and shasum `269f616515f3e244c9812e7738aa71551cbd9822`; pinned in `package-lock.json`.
  The repository does not automatically use the legacy static script/CDN asset.
- **vision_wasm_internal.js/.wasm** exactly copied from the installed 1.2.3
  package `wasm/` folder. Current supported classic fileset is selected with
  `FilesetResolver.forVisionTasks(base,false)`, avoiding a WASM runtime module-eval
  import.meta error observed with `true`. Do not hand-edit generated WASM/loader.
- **face_landmarker.task**, official float16 **v1** local task, from
  https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
  (download verified 2026-11-15), containing official face detector, landmarks,
  geometry pipeline metadata and blendshape models. Used with
  `outputFacialTransformationMatrixes:true`; **blendshapes are not used for gaze.**
- License locally retained in `MEDIPIPE-LICENSE.txt`; this is the upstream
  https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE (Apache-2.0).
  It is not the Kevin MacLeod recording's CC BY license.

SHA-256 (2026-11-15):

```
64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff  face_landmarker.task
2aa5fd3fdd3d8208cd7587df0bb19fb6925c4ea16a76dd025aedc1f64d6a6309  vision_wasm_internal.js
225bc06c0f51a9cf31fea0e9e0b0243e9e01fb5ef332cc1a7fa6656dbdfdaabf  vision_wasm_internal.wasm
8707eef0533987efc5b155d64761eeb6e20793f50b9bd1a68dad1cf4719d0ed8  MEDIPIPE-LICENSE.txt
```

The non-module loader/WASM hash matches each corresponding installed package
file. Package/model/runtime changes require fresh review, pin and hashes.

## Current functionality, primary validation and limits

The installed media task **is live in this build**. Enable camera calls
`detectForVideo` for valid current frame timestamps. The forward projection of the
facial matrix is subtracted from a user-controlled **Calibrate forward**. Five
direction labels dwell roughly 360 ms with sign-deadband/hysteresis. When no face is
available, prior state holds only 800 ms and then clears to Uncertain+neutral.
A supported API **is requested before continuing**, not replaced with another library.

Fresh Chromium source on **http://127.0.0.1:8031** received a real source-video track
(Playwright `--use-fake-ui-for-media-stream` / `--use-fake-device-for-media-stream`)
plus declared numeric detector input. The real React loop displayed **Forward, Right,
Left, Up, Down, Forward** (valid actual detector/head projection code) and zero
AudioContexts from the camera side; Stop closed detector and detached `srcObject`.
These are **synthetic detector lifecycle tests, not physical photographs/gaze/human
pose evidence**. Earlier an ordinary plain-object fake Stream failed native browser
srcObject type checking (test-harness flaw, not fabricated response).

Numeric DB until Sirengine resolved: installed task output real reference image from
MediaPipe-assets (not retained/committed). Valid matrix with frontal ~.9983 Z produced
finite yaw **-1.46°**, pitch **2.99°** at that chosen target snapshot; accepted by
poseFromMatrix. A synthetic baseline (not spatially anchored person measurement).
Exact per-person accuracy still requires a human session; no automatic Pass claim.

Additional in-core tests confirm canonical forward vectors for right/left/up/down
although `facialTransformationMatrixes` source of truth accepted, invalid null data
rejected. Lost reacquisition must wait dwell instead of pretend having ongoing direct
camera while window background/audio mount. Only selected Influence mixes est tray.

Primary reading used:

1. https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js —
   WebAssembly/browser inference, IMAGE/VIDEO, 478 landmarks, optional 52
   blendshapes and `outputFacialTransformationMatrixes`; VIDEO takes monotonic
   timestamps. Blendshape left/right belongs to a subject, not its mirrored viewer.
2. Installed 1.2.3 `vision.d.ts` — `FaceLandmarker.createFromOptions`,
   `detectForVideo`, `close`, `Matrix{rows,columns,data}` and option spellings.
3. https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/cc/vision/face_geometry/libs/geometry_pipeline.cc —
   canonical and runtime metric landmarks are right-handed; normalized screen is
   left-handed and has a deliberate change of handedness. Pose is model relative.
4. https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/framework/formats/matrix.cc —
   Eigen packed native data is column-major when no ROW_MAJOR flag is set.
5. https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia —
   HTTPS/localhost is needed (browser-dependent), permission denial
   `NotAllowedError`, unavailable device `NotFoundError`, promise may remain
   pending indefinitely; `{video: user camera, audio:false}` avoids microphone.
6. https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/stop —
   stop **all** desired tracks, readyState ends; detach `srcObject` per example.
7. https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API —
   hidden/inactive-page camera behavior must be dealt with explicitly; browsers vary.

No other camera or unrelated sensors/geolocation are requested. No frame network
upload, photographic evidence or eye/iris interpretation is generated.
