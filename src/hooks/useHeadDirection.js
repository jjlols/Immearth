import React from 'react';
import { relativeCalibrationSession, HEAD_DIRECTION_DEFAULTS } from '../lib/headDirection.js';

const IDLE = { status: 'off', direction: 'uncertain', calibrated: false, error: null };
const NEUTRAL = { forward: { x: 0, y: 1, z: 0 }, up: { x: 0, y: 0, z: 1 } };

/** Optional local face direction. Never a camera-on-mount or transport start. */
export default function useHeadDirection({
  engineRef, enabled = true, detectorLoader = defaultDetectorLoader, onReady, onDirection,
}) {
  const [state, setState] = React.useState(IDLE);
  const [manualDirection, setManualDirection] = React.useState(null);
  const [preview, setPreview] = React.useState(false);
  const videoRef = React.useRef(null);
  const session = React.useRef(null);
  const detectorState = React.useRef(null);
  const engine = React.useRef(engineRef);
  const influenceEnabled = React.useRef(enabled);
  const notify = React.useRef(onDirection);
  engine.current = engineRef;
  influenceEnabled.current = enabled;
  notify.current = onDirection;

  const write = React.useCallback(orientation => {
    engine.current?.current?.setSpatialListenerOrientation(orientation.forward, orientation.up);
  }, []);
  const stop = React.useCallback((next = IDLE) => {
    const old = session.current;
    session.current = null;
    if (old) {
      old.closed = true;
      window.cancelAnimationFrame(old.frame);
      old.abort?.();
      try { old.detector?.close(); } catch {}
      for (const track of old.stream?.getTracks?.() || []) track.stop();
      if (old.video) {
        old.video.pause();
        old.video.srcObject = null;
        old.video.removeAttribute('src');
      }
    }
    detectorState.current?.stop();
    detectorState.current = null;
    notify.current?.({ direction: 'stop', now: performance.now(), source: 'stop' });
    setManualDirection(null);
    setState(next);
    write(NEUTRAL);
  }, [write]);

  React.useEffect(() => {
    engine.current?.current?.setSpatialListenerOrientation(NEUTRAL.forward, NEUTRAL.up);
    if (detectorState.current) notify.current?.({
      direction: enabled ? (manualDirection || detectorState.current.direction) : 'stop',
      now: performance.now(), source: 'modal',
    });
  }, [enabled, manualDirection]);

  // Cleanup belongs to component unmount only, not to a React effect identity
  // change while the camera is actively being used.
  React.useEffect(() => {
    return () => {
      const old = session.current;
      session.current = null;
      if (old) {
        old.closed = true;
        window.cancelAnimationFrame(old.frame);
        old.abort?.();
        try { old.detector?.close(); } catch {}
        for (const track of old.stream?.getTracks?.() || []) track.stop();
        if (old.video) {
          old.video.pause();
          old.video.srcObject = null;
          old.video.removeAttribute('src');
        }
      }
      detectorState.current = null;
    };
  }, []);

  React.useEffect(() => {
    const visibility = () => { if (document.hidden && session.current) stop(); };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', stop);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', stop);
    };
  }, [stop]);

  const start = React.useCallback(async () => {
    if (session.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setState({ ...IDLE, status: 'unsupported', error: 'Camera access requires HTTPS or localhost in a supported browser.' });
      return;
    }
    const current = {
      closed: false, stream: null, video: videoRef.current, detector: null,
      frame: 0, abort: null, lastVideoTime: -1, lastTimestamp: 0, lastFrame: -Infinity,
    };
    session.current = current;
    setState({ status: 'requesting', direction: 'uncertain', calibrated: false, error: null });
    const fail = error => {
      if (current.closed) return;
      const messages = {
        NotAllowedError: 'Camera permission denied. Allow camera access for this site to turn on head travel.',
        SecurityError: 'Camera permission denied. Allow camera access for this site to turn on head travel.',
        NotFoundError: 'No usable camera found.',
        OverconstrainedError: 'No usable camera found.',
        NotReadableError: 'The camera is unavailable or in use. Close other camera apps and press Enable camera again.',
        AbortError: 'Camera attempt stopped.',
      };
      stop({ ...IDLE, status: 'error', error: messages[error?.name] || error?.message || 'Head tracking could not start.' });
    };
    try {
      current.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      if (current.closed) { for (const track of current.stream.getTracks()) track.stop(); return; }
      const video = current.video;
      video.srcObject = current.stream;
      await new Promise((resolve, reject) => {
        if (video.readyState >= 1) { resolve(); return; }
        current.abort = () => reject(new DOMException('Stopped', 'AbortError'));
        video.onloadedmetadata = () => { current.abort = null; resolve(); };
      });
      await video.play();
      if (current.closed) return;
      if (document.hidden) throw new DOMException('Return to this tab to start camera tracking', 'AbortError');
      current.detector = await detectorLoader();
      if (current.closed) return;
      detectorState.current = relativeCalibrationSession();
      setState({ status: 'active', direction: 'uncertain', calibrated: false, error: null });
      for (const track of current.stream.getTracks()) track.addEventListener('ended', () => fail(new Error('The camera ended. Use manual controls or Enable camera to retry.')), { once: true });
      const sample = time => {
        current.frame = 0;
        if (current.closed || document.hidden) return;
        if (time - current.lastFrame >= HEAD_DIRECTION_DEFAULTS.sampleIntervalMs && video.readyState >= 2 && video.currentTime !== current.lastVideoTime) {
          current.lastVideoTime = video.currentTime;
          current.lastFrame = time;
          try {
            const timestamp = nextVideoTimestamp(current, video);
            const result = current.detector.detectForVideo(video, timestamp);
            const output = detectorState.current.frame(result, performance.now());
            if (current.publishedDirection !== output.direction) {
              notify.current?.({ direction: output.direction, now: performance.now(), source: 'head' });
            }
            if (current.publishedDirection !== output.direction || current.publishedCalibration !== output.calibrated) {
              setState({ status: 'active', direction: output.direction, calibrated: output.calibrated, error: null });
            }
            current.publishedDirection = output.direction;
            current.publishedCalibration = output.calibrated;
            // Repeated equal-direction camera frames do not repaint the React
            // tree or reset preview timing. Travel commits only on recenter.
            write(output.orientation);
          } catch (error) { fail(error); return; }
        }
        current.frame = requestAnimationFrame(sample);
      };
      current.frame = requestAnimationFrame(sample);
    } catch (error) { fail(error); }
  }, [detectorLoader, stop, write]);

  const calibrate = React.useCallback(() => {
    const current = session.current;
    if (!current?.detector) return false;
    const video = current.video;
    if (!video || video.readyState < 2) {
      setState(old => ({ ...old, error: 'Wait for a live camera frame before calibrating forward.' }));
      return false;
    }
    try {
      // Keep MediaPipe VIDEO clock monotonic across calibration too.
      const timestamp = nextVideoTimestamp(current, video);
      current.lastVideoTime = video.currentTime;
      const result = current.detector.detectForVideo(video, timestamp);
      if (!detectorState.current?.calibrate(result)) {
        setState(old => ({ ...old, error: 'Center one face in view and try Calibrate forward again.' }));
        return false;
      }
      setState(old => ({ ...old, error: null, direction: 'forward', calibrated: true }));
      notify.current?.({ direction: 'forward', now: performance.now(), source: 'calibrate' });
      write(NEUTRAL);
      return true;
    } catch (error) {
      stop({ ...IDLE, status: 'error', error: error.message });
      return false;
    }
  }, [stop, write]);

  const manual = React.useCallback(label => {
    if (!detectorState.current) detectorState.current = relativeCalibrationSession();
    const value = detectorState.current.manual(label);
    if (!value) return;
    setManualDirection(label);
    setState(old => ({ ...old, direction: label }));
    notify.current?.({ direction: label, now: performance.now(), source: 'manual' });
  }, []);

  const reset = React.useCallback(() => {
    detectorState.current?.recenter();
    setManualDirection(null);
    setState(old => ({ ...old, direction: session.current ? 'uncertain' : 'forward' }));
    notify.current?.({ direction: 'forward', now: performance.now(), source: 'reset' });
    if (!session.current) write(NEUTRAL);
  }, [write]);

  React.useEffect(() => {
    onReady?.(() => {
      if (influenceEnabled.current && detectorState.current) notify.current?.({
        direction: detectorState.current.direction, now: performance.now(), source: 'sync',
      });
    });
  }, [onReady]);

  return { state, manualDirection, preview, setPreview, videoRef, start, stop: () => stop(), calibrate, recenter: reset, manual, clearManual: reset };
}

export async function defaultDetectorLoader() {
  const { FilesetResolver, FaceLandmarker } = await import('@mediapipe/tasks-vision');
  const base = `${import.meta.env.BASE_URL}head-tracking`;
  const fileset = await FilesetResolver.forVisionTasks(base, false);
  return FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: `${base}/face_landmarker.task`, delegate: 'GPU' },
    runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: true, minFaceDetectionConfidence: 0.6,
    minFacePresenceConfidence: 0.6, minTrackingConfidence: 0.6,
  });
}

/** Detector timestamps stay in their VIDEO/videotime clock, never wall clock. */
function nextVideoTimestamp(current, video) {
  const last = Number(current.lastTimestamp) || 0;
  const videoClock = video.currentTime * 1000;
  current.lastTimestamp = Math.max(last + 1, Number.isFinite(videoClock) ? videoClock : last + 1);
  return current.lastTimestamp;
}
