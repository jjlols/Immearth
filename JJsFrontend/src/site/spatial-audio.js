/* Spatial audio for the Earth Information Jukebox.
   One AudioContext, HRTF sources on a sphere around the listener.
   Longitude 0 starts straight ahead, east is to the right, north is up.
   This file does not turn Earth data into pitch or loudness. */
let installedSpatialAudio = null;

export function installSpatialAudio() {
  installedSpatialAudio?.();
  const RADIUS = 1.25;
  const VISION_MODULE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17";
  const VISION_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm";
  const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
  const PENTATONIC_SEMITONES = [0, 2, 4, 7, 9];

  const sources = new Map();
  const events = new Map();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let audioContext = null;
  let master = null;
  let masterVolume = 0.7;
  const paramTime = new WeakMap();
  let heading = 0;
  let audioHeading = 0;
  let forwardOffset = 0;
  let followId = 0;
  let lastEmittedHeading = 0;
  let announceTimer = 0;
  let unavailable = false;

  let testTones = [];
  let retired = [];
  let retireTimer = 0;

  let visionPromise = null;
  let landmarker = null;
  let cameraStream = null;
  let cameraFrame = 0;
  let cameraToken = 0;
  let cameraOn = false;
  let cameraStarting = false;
  let cameraCalibrated = false;
  let cameraZero = 0;
  let lastRawYaw = null;
  let lastVideoTime = -1;
  let cameraErrors = 0;
  let missStreak = 0;
  let lostMarkedAt = 0;
  const yawFilter = createOneEuro(1.1, 0.035, 1);

  let slider = null;
  let sliderActive = false;
  let sliderDriving = false;
  let readout = null;
  let volumeSlider = null;
  let cameraButton = null;
  let cameraStatus = null;
  let preview = null;
  let video = null;
  let playButton = null;

  function wrap(degrees) {
    if (!Number.isFinite(degrees)) return 0;
    let value = degrees % 360;
    if (value > 180) value -= 360;
    if (value < -180) value += 360;
    return value === 0 ? 0 : value;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function roundedHeading(value) {
    const shown = Math.round(wrap(value));
    return shown === 0 ? 0 : shown;
  }

  function regionName(degrees) {
    const d = wrap(degrees);
    const east = d >= 0;
    const amount = Math.abs(d);
    if (amount <= 8) return "the prime meridian";
    if (east) {
      if (d <= 35) return "Africa";
      if (d <= 60) return "eastern Africa and the Middle East";
      if (d <= 95) return "South Asia";
      if (d <= 125) return "Southeast Asia";
      if (d <= 160) return "East Asia";
      return "the Pacific";
    }
    if (amount <= 30) return "the Atlantic";
    if (amount <= 70) return "South America";
    if (amount <= 115) return "the Americas";
    if (amount <= 160) return "the northern Pacific";
    return "the Pacific";
  }

  function headingSentence() {
    const shown = roundedHeading(heading);
    const facing = roundedHeading(forwardOffset + heading);
    const place = regionName(facing);
    const amount = Math.abs(shown);
    const side = shown > 0 ? "east" : "west";
    const unit = amount === 1 ? "degree" : "degrees";
    if (shown === 0) {
      if (Math.abs(facing) <= 8) return "Facing the prime meridian, straight ahead.";
      return "Facing straight ahead, toward " + place + ".";
    }
    if (Math.abs(wrap(forwardOffset)) < 1) {
      return "Facing " + place + ", " + amount + " " + unit + " " + side + ".";
    }
    return "Facing " + place + ", " + amount + " " + unit + " " + side + " of forward.";
  }

  function motionReduced() {
    return reduceMotion.matches || document.documentElement.classList.contains("reduce-motion");
  }

  function announce(message) {
    const status = document.querySelector("#status");
    if (!status || !message) return;
    status.textContent = "";
    window.setTimeout(() => {
      status.textContent = message;
    }, 30);
  }

  function announceSoon(message) {
    window.clearTimeout(announceTimer);
    announceTimer = window.setTimeout(() => announce(message), 350);
  }

  function announceNow(message) {
    window.clearTimeout(announceTimer);
    announce(message);
  }

  function reportUnavailable() {
    if (unavailable) return;
    unavailable = true;
    if (readout) readout.textContent = "This browser cannot play spatial sound.";
    announceNow("This browser cannot play spatial sound.");
  }

  function listenerVector(relative) {
    const rad = wrap(forwardOffset + relative) * Math.PI / 180;
    return { x: Math.sin(rad), y: 0, z: -Math.cos(rad) };
  }

  function ensureContext() {
    if (audioContext) return audioContext;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error("This browser has no Web Audio.");
    audioContext = new Ctx();
    master = audioContext.createGain();
    const now = audioContext.currentTime;
    master.gain.setValueAtTime(masterVolume, now);
    master.connect(audioContext.destination);
    const listener = audioContext.listener;
    listener.positionX.setValueAtTime(0, now);
    listener.positionY.setValueAtTime(0, now);
    listener.positionZ.setValueAtTime(0, now);
    return audioContext;
  }

  function setParamAt(param, value) {
    const now = audioContext.currentTime;
    const previous = paramTime.get(param) ?? -1;
    const time = now > previous ? now : previous + 0.005;
    param.setValueAtTime(value, time);
    paramTime.set(param, time);
  }

  function armAudio() {
    try {
      const ctx = ensureContext();
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
    } catch (error) {
      reportUnavailable();
    }
  }

  function writeListener(relative) {
    const ctx = ensureContext();
    const listener = ctx.listener;
    const vector = listenerVector(relative);
    setParamAt(listener.forwardX, vector.x);
    setParamAt(listener.forwardY, vector.y);
    setParamAt(listener.forwardZ, vector.z);
    setParamAt(listener.upX, 0);
    setParamAt(listener.upY, 1);
    setParamAt(listener.upZ, 0);
  }

  function followHeading() {
    const delta = wrap(heading - audioHeading);
    if (Math.abs(delta) < 0.2) {
      audioHeading = heading;
      writeListener(audioHeading);
      if (followId) {
        window.cancelAnimationFrame(followId);
        followId = 0;
      }
      return;
    }
    const step = Math.max(-6, Math.min(6, delta));
    audioHeading = wrap(audioHeading + step);
    writeListener(audioHeading);
    if (followId) return;
    followId = window.requestAnimationFrame(function tick() {
      followId = 0;
      followHeading();
    });
  }

  function showHeading() {
    const description = headingSentence();
    if (readout) readout.textContent = description;
    if (slider) {
      if (!sliderDriving) slider.value = String(roundedHeading(heading));
      slider.setAttribute("aria-valuetext", description);
    }
    return description;
  }

  function emitHeading(description) {
    const shown = roundedHeading(heading);
    if (shown === lastEmittedHeading) return;
    lastEmittedHeading = shown;
    const listeners = events.get("headingchange");
    if (!listeners) return;
    const detail = { heading: shown, description };
    listeners.forEach((callback) => {
      try {
        callback(detail);
      } catch (error) {
        /* One listener should not stop the others or the audio graph. */
      }
    });
  }

  function setHeading(degrees, options) {
    const value = Number(degrees);
    if (!Number.isFinite(value)) throw new Error("Heading must be a finite number of degrees.");
    const opts = options || {};
    heading = wrap(value);
    try {
      followHeading();
    } catch (error) {
      reportUnavailable();
    }
    const description = showHeading();
    emitHeading(description);
    if (opts.announce === "now") announceNow(description);
    else if (opts.announce === "soon") announceSoon(description);
    return description;
  }

  function nudgeHeading(delta, options) {
    const amount = Number(delta);
    if (!Number.isFinite(amount)) throw new Error("nudgeHeading needs a number of degrees.");
    return setHeading(heading + amount, options);
  }

  function recenter(options) {
    const opts = options || {};
    if (followId) {
      window.cancelAnimationFrame(followId);
      followId = 0;
    }
    forwardOffset = wrap(forwardOffset + audioHeading);
    heading = 0;
    audioHeading = 0;
    if (audioContext) writeListener(0);
    if ((cameraOn || cameraStarting) && lastRawYaw != null) cameraZero = lastRawYaw;
    const description = showHeading();
    lastEmittedHeading = null;
    emitHeading(description);
    if (opts.announce !== "none") announceNow(description);
    return description;
  }

  function cartesian(longitude, latitude) {
    const lon = wrap(longitude) * Math.PI / 180;
    const lat = clamp(latitude, -90, 90) * Math.PI / 180;
    const cosLat = Math.cos(lat);
    return {
      x: RADIUS * cosLat * Math.sin(lon),
      y: RADIUS * Math.sin(lat),
      z: -RADIUS * cosLat * Math.cos(lon),
    };
  }

  function readPosition(position) {
    if (!position || !Number.isFinite(Number(position.longitude)) || !Number.isFinite(Number(position.latitude))) {
      throw new Error("A spatial source needs numeric longitude and latitude.");
    }
    return {
      longitude: wrap(Number(position.longitude)),
      latitude: clamp(Number(position.latitude), -90, 90),
    };
  }

  function rampParam(param, value, seconds) {
    const now = audioContext.currentTime;
    const current = Number.isFinite(param.value) ? param.value : value;
    param.cancelScheduledValues(now);
    param.setValueAtTime(current, now);
    if (Math.abs(current - value) < 0.0001) return;
    param.linearRampToValueAtTime(value, now + seconds);
  }

  function makePanner(point) {
    const ctx = ensureContext();
    const panner = ctx.createPanner();
    try {
      panner.panningModel = "HRTF";
    } catch (error) {
      panner.panningModel = "equalpower";
    }
    panner.distanceModel = "inverse";
    panner.refDistance = RADIUS;
    panner.maxDistance = 10000;
    panner.rolloffFactor = 1;
    panner.coneInnerAngle = 360;
    panner.coneOuterAngle = 360;
    panner.coneOuterGain = 1;
    const now = ctx.currentTime;
    panner.positionX.setValueAtTime(point.x, now);
    panner.positionY.setValueAtTime(point.y, now);
    panner.positionZ.setValueAtTime(point.z, now);
    return panner;
  }

  function addSource(id, audioNode, position) {
    if (typeof id !== "string" || !id) throw new Error("addSource needs a source id.");
    if (!audioNode || typeof audioNode.connect !== "function") throw new Error("addSource needs an AudioNode.");
    const place = readPosition(position);
    const ctx = ensureContext();
    if (audioNode.context !== ctx) {
      throw new Error("Create the audio node from earthAudio.context before addSource.");
    }
    if (sources.has(id)) removeSource(id);
    const point = cartesian(place.longitude, place.latitude);
    const mute = ctx.createGain();
    mute.gain.setValueAtTime(1, ctx.currentTime);
    const panner = makePanner(point);
    audioNode.connect(mute);
    mute.connect(panner);
    panner.connect(master);
    sources.set(id, {
      id,
      audioNode,
      mute,
      panner,
      longitude: place.longitude,
      latitude: place.latitude,
      muted: false,
      moveToken: 0,
    });
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return id;
  }

  function removeSource(id) {
    const source = sources.get(id);
    if (!source) return;
    source.moveToken += 1;
    try { source.audioNode.disconnect(source.mute); } catch (error) { /* already disconnected */ }
    try { source.mute.disconnect(); } catch (error) { /* already disconnected */ }
    try { source.panner.disconnect(); } catch (error) { /* already disconnected */ }
    sources.delete(id);
  }

  function setSourcePosition(id, position) {
    const source = sources.get(id);
    if (!source) throw new Error("Unknown spatial source: " + id);
    const place = readPosition(position);
    const fromLon = source.longitude;
    const fromLat = source.latitude;
    const toLon = place.longitude;
    const toLat = place.latitude;
    source.longitude = toLon;
    source.latitude = toLat;
    const token = (source.moveToken += 1);
    const start = performance.now();
    const step = (now) => {
      if (source.moveToken !== token || !sources.has(id) || !audioContext) return;
      const t = Math.min(1, (now - start) / 180);
      const lon = fromLon + wrap(toLon - fromLon) * t;
      const lat = fromLat + (toLat - fromLat) * t;
      const point = cartesian(lon, lat);
      const time = audioContext.currentTime;
      source.panner.positionX.setValueAtTime(point.x, time);
      source.panner.positionY.setValueAtTime(point.y, time);
      source.panner.positionZ.setValueAtTime(point.z, time);
      if (t < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
  }

  function setMuted(id, muted) {
    const source = sources.get(id);
    if (!source) throw new Error("Unknown spatial source: " + id);
    source.muted = Boolean(muted);
    ensureContext();
    rampParam(source.mute.gain, source.muted ? 0.0001 : 1, 0.04);
  }

  function setMasterVolume(value) {
    const volume = Number(value);
    if (!Number.isFinite(volume)) throw new Error("Volume must be a number from 0 to 1.");
    masterVolume = clamp(volume, 0, 1);
    if (audioContext) rampParam(master.gain, masterVolume, 0.04);
    if (volumeSlider) {
      const percent = String(Math.round(masterVolume * 100));
      if (document.activeElement !== volumeSlider) volumeSlider.value = percent;
      volumeSlider.setAttribute("aria-valuetext", percent + " percent");
    }
    return masterVolume;
  }

  function getSource(id) {
    const source = sources.get(id);
    if (!source) return null;
    return {
      id,
      longitude: source.longitude,
      latitude: source.latitude,
      muted: source.muted,
      x: source.panner.positionX.value,
      y: source.panner.positionY.value,
      z: source.panner.positionZ.value,
    };
  }

  function on(eventName, callback) {
    if (typeof callback !== "function") throw new Error("earthAudio.on needs a function.");
    if (!events.has(eventName)) events.set(eventName, new Set());
    events.get(eventName).add(callback);
    return function unsubscribe() { off(eventName, callback); };
  }

  function off(eventName, callback) {
    const listeners = events.get(eventName);
    if (listeners) listeners.delete(callback);
  }

  function pentatonicHz(degree, octave) {
    const index = ((degree % 5) + 5) % 5;
    const midi = (octave + 1) * 12 + PENTATONIC_SEMITONES[index];
    return 440 * 2 ** ((midi - 69) / 12);
  }

  function updateTestUi() {
    if (!playButton) return;
    playButton.setAttribute("aria-pressed", String(testTones.length > 0));
  }

  function killTone(tone) {
    try { tone.osc.stop(); } catch (error) { /* already stopped */ }
    try { tone.osc.disconnect(); } catch (error) { /* already disconnected */ }
    removeSource(tone.id);
  }

  function cutRetired() {
    window.clearTimeout(retireTimer);
    retired.forEach(killTone);
    retired = [];
  }

  function startTestTones() {
    if (testTones.length) {
      return "Test tones are already playing. One note is in front, one is on your right, one is behind you, and one is on your left. Press Stop or Escape to end them.";
    }
    let ctx;
    try {
      ctx = ensureContext();
    } catch (error) {
      reportUnavailable();
      return "This browser cannot play spatial sound.";
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    cutRetired();
    const now = ctx.currentTime;
    const tones = [
      { id: "test-tone-front", longitude: 0, degree: 0, octave: 4 },
      { id: "test-tone-right", longitude: 90, degree: 4, octave: 4 },
      { id: "test-tone-back", longitude: 180, degree: 2, octave: 4 },
      { id: "test-tone-left", longitude: -90, degree: 3, octave: 4 },
    ];
    tones.forEach((tone) => {
      const osc = ctx.createOscillator();
      const envelope = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(pentatonicHz(tone.degree, tone.octave), now);
      envelope.gain.setValueAtTime(0, now);
      envelope.gain.linearRampToValueAtTime(0.034, now + 1.6);
      osc.connect(envelope);
      addSource(tone.id, envelope, { longitude: tone.longitude, latitude: 0 });
      osc.start(now);
      testTones.push({ id: tone.id, osc, envelope });
    });
    updateTestUi();
    return "Playing four soft test tones. In front, on your right, behind you, and on your left. Stop or Escape ends them.";
  }

  function stopTestTones(options) {
    const opts = options || {};
    if (!testTones.length) return opts.quietIfIdle ? "" : "Test tones are already stopped.";
    const stopping = testTones.splice(0);
    updateTestUi();
    if (opts.immediate || !audioContext) {
      cutRetired();
      stopping.forEach(killTone);
      return "Test tones stopped.";
    }
    retired = retired.concat(stopping);
    const now = audioContext.currentTime;
    stopping.forEach((tone) => {
      try {
        const gain = tone.envelope.gain;
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(Math.max(gain.value, 0.0001), now);
        gain.linearRampToValueAtTime(0.0001, now + 0.05);
      } catch (error) { /* node already gone */ }
    });
    window.clearTimeout(retireTimer);
    retireTimer = window.setTimeout(() => {
      retired.forEach(killTone);
      retired = [];
    }, 80);
    return "Test tones stopped.";
  }

  function testTonesPlaying() {
    return testTones.length > 0;
  }

  function createOneEuro(minCutoff, beta, dCutoff) {
    let xPrev = null;
    let dxPrev = 0;
    let tPrev = null;
    function alpha(cutoff, dt) {
      const tau = 1 / (2 * Math.PI * cutoff);
      return 1 / (1 + tau / dt);
    }
    return {
      filter(x, tMs) {
        if (tPrev == null) {
          xPrev = x;
          tPrev = tMs;
          return x;
        }
        const dt = Math.max(0.001, (tMs - tPrev) / 1000);
        const dx = (x - xPrev) / dt;
        const aD = alpha(dCutoff, dt);
        const dxHat = aD * dx + (1 - aD) * dxPrev;
        const cutoff = minCutoff + beta * Math.abs(dxHat);
        const a = alpha(cutoff, dt);
        const xHat = a * x + (1 - a) * xPrev;
        xPrev = xHat;
        dxPrev = dxHat;
        tPrev = tMs;
        return xHat;
      },
      reset() {
        xPrev = null;
        dxPrev = 0;
        tPrev = null;
      },
    };
  }

  function yawFromLandmarks(landmarks) {
    const nose = landmarks[1];
    const eyeA = landmarks[33];
    const eyeB = landmarks[263];
    if (!nose || !eyeA || !eyeB) return null;
    const span = Math.hypot(eyeB.x - eyeA.x, eyeB.y - eyeA.y);
    if (span < 0.02) return null;
    const offset = (nose.x - (eyeA.x + eyeB.x) / 2) / span;
    return -Math.atan(offset * 1.2) * (180 / Math.PI);
  }

  function headYaw(result, landmarks) {
    const visual = yawFromLandmarks(landmarks);
    if (visual == null) return null;
    const matrices = result.facialTransformationMatrixes || result.facialTransformationMatrices || [];
    const matrix = matrices[0] && matrices[0].data;
    if (!matrix || matrix.length < 16) return visual;
    let posed = Math.atan2(matrix[8], matrix[10]) * (180 / Math.PI);
    if (!Number.isFinite(posed)) return visual;
    if (Math.abs(visual) >= 2 && Math.abs(posed) >= 2 && Math.sign(visual) !== Math.sign(posed)) posed = -posed;
    return (visual + posed) / 2;
  }

  function trackingMessage() {
    const hidden = motionReduced() ? " The preview is hidden because reduced motion is on." : "";
    return "Tracking your head. Turn to look around the Earth. Press Recenter to call this direction forward." + hidden;
  }

  function setCameraStatus(message, doAnnounce) {
    const changed = !cameraStatus || cameraStatus.textContent !== message;
    if (cameraStatus) cameraStatus.textContent = message;
    if (doAnnounce && changed) announceNow(message);
  }

  function setCameraButton(on) {
    if (!cameraButton) return;
    cameraButton.setAttribute("aria-pressed", on ? "true" : "false");
    cameraButton.textContent = on ? "Stop camera head tracking" : "Use camera to turn with your head";
  }

  function releaseCamera() {
    cameraOn = false;
    cameraStarting = false;
    if (cameraFrame) window.cancelAnimationFrame(cameraFrame);
    cameraFrame = 0;
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      cameraStream = null;
    }
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    if (preview) preview.hidden = true;
    if (landmarker) {
      try { landmarker.close(); } catch (error) { /* already closed */ }
      landmarker = null;
    }
    yawFilter.reset();
    missStreak = 0;
    lostMarkedAt = 0;
    cameraCalibrated = false;
    cameraErrors = 0;
    setCameraButton(false);
  }

  function stopCamera(options) {
    cameraToken += 1;
    releaseCamera();
    if (options && options.announce) {
      setCameraStatus("Camera is off. The camera has been stopped.", true);
    }
  }

  function noteMissingFace() {
    missStreak += 1;
    if (missStreak < 12) return;
    if (!lostMarkedAt) lostMarkedAt = performance.now();
    const missingFor = performance.now() - lostMarkedAt;
    if (missingFor < 1500) {
      setCameraStatus("No face in view. Holding the last direction.", true);
      return;
    }
    setCameraStatus("No face in view. Easing back to straight ahead.", true);
    if (sliderActive) return;
    if (Math.abs(heading) < 0.8) {
      if (heading !== 0) setHeading(0, { announce: "now" });
      return;
    }
    setHeading(heading * 0.94, { announce: "none" });
  }

  function trackFace(result) {
    const faces = result.faceLandmarks || result.landmarks || [];
    const landmarks = faces[0];
    if (!landmarks || landmarks.length < 264) {
      noteMissingFace();
      return;
    }
    const raw = headYaw(result, landmarks);
    if (raw == null || !Number.isFinite(raw)) {
      noteMissingFace();
      return;
    }
    const smoothed = yawFilter.filter(raw, performance.now());
    if (cameraCalibrated && lastRawYaw != null && Math.abs(wrap(smoothed - lastRawYaw)) > 70) return;
    lastRawYaw = smoothed;
    missStreak = 0;
    lostMarkedAt = 0;
    if (!cameraCalibrated) {
      cameraZero = wrap(smoothed - heading);
      cameraCalibrated = true;
      setCameraStatus(trackingMessage(), true);
      return;
    }
    setCameraStatus(trackingMessage(), true);
    if (sliderActive) return;
    const relative = wrap(smoothed - cameraZero);
    if (Math.abs(wrap(relative - heading)) < 2) return;
    setHeading(relative, { announce: "soon" });
  }

  function nextTimestamp() {
    let now = performance.now();
    if (now <= lastVideoTime) now = lastVideoTime + 1;
    lastVideoTime = now;
    return now;
  }

  function cameraLoop() {
    if (!cameraOn || !landmarker || !video) return;
    cameraFrame = window.requestAnimationFrame(cameraLoop);
    if (video.readyState < 2) return;
    let result;
    try {
      result = landmarker.detectForVideo(video, nextTimestamp());
    } catch (error) {
      cameraErrors += 1;
      if (cameraErrors >= 8) {
        stopCamera();
        setCameraStatus("Head tracking hit a problem and the camera was stopped. Use the slider or arrow keys to turn.", true);
      }
      return;
    }
    cameraErrors = 0;
    trackFace(result || {});
  }

  function loadVision() {
    if (!visionPromise) {
      visionPromise = import(VISION_MODULE).catch((error) => {
        visionPromise = null;
        throw error;
      });
    }
    return visionPromise;
  }

  function cameraErrorMessage(error) {
    const name = error && error.name;
    if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
      return "Camera permission was blocked. Allow the camera in the browser, then try again. You can still turn with the slider or arrow keys.";
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") {
      return "No camera was found on this computer. Use the slider or arrow keys to turn.";
    }
    if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") {
      return "The camera could not be opened. It may be in use by another app. Use the slider or arrow keys to turn.";
    }
    return "Head tracking could not be started. The camera was not left on. You can still turn with the slider or arrow keys.";
  }

  async function startCamera() {
    if (cameraOn || cameraStarting) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraStatus("This browser has no camera support. Use the slider or arrow keys to turn.", true);
      return;
    }
    const token = ++cameraToken;
    cameraStarting = true;
    setCameraButton(true);
    setCameraStatus("Starting the camera. Your picture stays on this computer.", true);
    let stream = null;
    try {
      const vision = await loadVision();
      if (token !== cameraToken) return;
      const fileset = await vision.FilesetResolver.forVisionTasks(VISION_WASM);
      if (token !== cameraToken) return;
      landmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate: "CPU" },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: true,
      });
      if (token !== cameraToken) {
        releaseCamera();
        return;
      }
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      if (token !== cameraToken) {
        stream.getTracks().forEach((track) => track.stop());
        releaseCamera();
        return;
      }
      cameraStream = stream;
      video.srcObject = stream;
      if (preview) preview.hidden = false;
      await video.play();
      if (token !== cameraToken) {
        releaseCamera();
        return;
      }
      cameraOn = true;
      cameraStarting = false;
      cameraCalibrated = false;
      lastVideoTime = -1;
      yawFilter.reset();
      const hidden = motionReduced() ? " The preview is hidden because reduced motion is on." : "";
      setCameraStatus("Camera is on. Your picture stays on this computer. Turn your head to look around. Press Recenter to call the current direction forward." + hidden, true);
      cameraFrame = window.requestAnimationFrame(cameraLoop);
    } catch (error) {
      if (stream && stream !== cameraStream) stream.getTracks().forEach((track) => track.stop());
      if (token !== cameraToken) return;
      releaseCamera();
      cameraToken += 1;
      setCameraStatus(cameraErrorMessage(error), true);
    }
  }

  function onEscape(event) {
    if (event.key !== "Escape") return;
    const message = stopTestTones({ quietIfIdle: true });
    if (message) announceNow(message);
  }

  const ui = new AbortController();
  function listen(target, type, listener, options) {
    if (!target) return;
    target.addEventListener(type, listener, { ...options, signal: ui.signal });
  }

  function bindUi() {
    slider = document.querySelector("#heading-slider");
    readout = document.querySelector("#heading-readout");
    volumeSlider = document.querySelector("#master-volume");
    cameraButton = document.querySelector("#head-tracking-toggle");
    cameraStatus = document.querySelector("#camera-status");
    preview = document.querySelector("#camera-preview");
    video = document.querySelector("#head-camera");
    playButton = document.querySelector("#play-test-tones");
    const turnLeft = document.querySelector("#turn-left");
    const turnRight = document.querySelector("#turn-right");
    const recenterButton = document.querySelector("#recenter-heading");
    const stopButton = document.querySelector("#stop-test-tones");

    showHeading();
    if (volumeSlider) volumeSlider.setAttribute("aria-valuetext", "70 percent");

    if (slider) {
      listen(slider, "focus", () => { sliderActive = true; });
      listen(slider, "blur", () => {
        sliderActive = false;
        if (lastRawYaw != null) cameraZero = wrap(lastRawYaw - heading);
        showHeading();
      });
      listen(slider, "pointerdown", () => { sliderActive = true; });
      listen(slider, "keydown", (event) => {
        const keys = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };
        const direction = keys[event.key];
        if (!direction) return;
        event.preventDefault();
        const step = Number(slider.step) || 1;
        const next = clamp(Number(slider.value) + direction * step, Number(slider.min), Number(slider.max));
        slider.value = String(next);
        slider.dispatchEvent(new Event("input", { bubbles: true }));
        slider.dispatchEvent(new Event("change", { bubbles: true }));
      });
      listen(slider, "input", () => {
        sliderDriving = true;
        try {
          if (lastRawYaw != null) cameraZero = wrap(lastRawYaw - Number(slider.value));
          setHeading(Number(slider.value), { announce: "soon" });
        } finally {
          sliderDriving = false;
        }
      });
      listen(slider, "change", () => {
        announceNow(headingSentence());
      });
    }

    listen(turnLeft, "click", () => nudgeHeading(-15, { announce: "now" }));
    listen(turnRight, "click", () => nudgeHeading(15, { announce: "now" }));
    listen(recenterButton, "click", () => recenter({ announce: "now" }));
    listen(volumeSlider, "input", () => {
      setMasterVolume(Number(volumeSlider.value) / 100);
      announceSoon("Overall volume " + volumeSlider.value + " percent.");
    });
    listen(cameraButton, "click", () => {
      if (cameraOn || cameraStarting) stopCamera({ announce: true });
      else startCamera();
    });
    listen(playButton, "click", () => announceNow(startTestTones()));
    listen(stopButton, "click", () => announceNow(stopTestTones()));
  }

  function onPageHide() {
    if (cameraOn || cameraStarting) stopCamera({ announce: false });
    stopTestTones({ quietIfIdle: true, immediate: true });
  }

  listen(document, "pointerdown", armAudio, { capture: true });
  listen(document, "keydown", armAudio, { capture: true });
  listen(document, "keydown", onEscape);
  listen(window, "pagehide", onPageHide);

  bindUi();

  const api = Object.freeze({
    get context() { return ensureContext(); },
    get output() {
      ensureContext();
      return master;
    },
    addSource,
    removeSource,
    setSourcePosition,
    setMuted,
    setMasterVolume,
    setHeading,
    getHeading() { return roundedHeading(heading); },
    nudgeHeading,
    describeHeading: headingSentence,
    recenter,
    on,
    off,
    startTestTones,
    stopTestTones,
    testTonesPlaying,
    getSource,
  });
  window.earthAudio = api;

  function dispose() {
    ui.abort();
    if (cameraOn || cameraStarting) stopCamera({ announce: false });
    stopTestTones({ quietIfIdle: true, immediate: true });
    if (window.earthAudio === api) delete window.earthAudio;
    if (installedSpatialAudio === dispose) installedSpatialAudio = null;
  }
  installedSpatialAudio = dispose;
  return dispose;
}
