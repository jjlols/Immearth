/** Pure coarse head-direction estimate: no DOM/audio/network side effects. */
export const DIRECTIONS = Object.freeze(['forward', 'up', 'left', 'right', 'down', 'uncertain']);
export const NEUTRAL_FORWARD = Object.freeze({ x: 0, y: 1, z: 0 });
export const NEUTRAL_UP = Object.freeze({ x: 0, y: 0, z: 1 });
export const HEAD_DIRECTION_DEFAULTS = Object.freeze({
  forwardDegrees: 10, directionDegrees: 15, exitDegrees: 5, maximumDegrees: 75,
  // Settled direction changes are fast; centering requires a deliberate small hold.
  directionDwellMs: 0,
  centerDwellMs: 80,
  lostGraceMs: 800,
  sampleIntervalMs: 32,
  minimumPublishMs: 55,
  audioChangeDegrees: 3,
});
const DEG = 180 / Math.PI;
const finite = n => typeof n === 'number' && Number.isFinite(n);

export function poseFromMatrix(matrix, { inputMirrored = false } = {}) {
  if (!matrix || matrix.rows !== 4 || matrix.columns !== 4 || !matrix.data || matrix.data.length !== 16) return null;
  const data = Array.from(matrix.data);
  if (!data.every(finite)) return null;
  const columns = [0, 1, 2].map(k => Math.hypot(data[k * 4], data[k * 4 + 1], data[k * 4 + 2]));
  if (columns.some(n => !finite(n) || n <= 1e-8) || Math.max(...columns) / Math.min(...columns) > 1.5) return null;
  const forward = [data[8] / columns[2], data[9] / columns[2], data[10] / columns[2]];
  if (!(forward[2] > 0.18)) return null;
  const yaw = -Math.atan2(forward[0], forward[2]) * DEG;
  const pitch = Math.atan2(forward[1], Math.hypot(forward[0], forward[2])) * DEG;
  return validPose({ yaw: inputMirrored ? -yaw : yaw, pitch });
}

export function calibrationFromMatrix(matrix, options = {}) {
  const pose = poseFromMatrix(matrix, options);
  return pose ? { yaw: pose.yaw, pitch: pose.pitch, inputMirrored: Boolean(options.inputMirrored) } : null;
}

export function relativePoseFromMatrix(matrix, calibration) {
  if (!calibration || !validPose(calibration) || typeof calibration.inputMirrored !== 'boolean') return null;
  const current = poseFromMatrix(matrix, { inputMirrored: calibration.inputMirrored });
  return current ? validPose({ yaw: current.yaw - calibration.yaw, pitch: current.pitch - calibration.pitch }) : null;
}

export function relativeCalibrationSession(options = {}) {
  const state = createHeadDirectionState(options);
  let calibration = null;
  let last = state.stop();
  function frame(result, now) {
    const matrix = result?.facialTransformationMatrixes?.[0];
    if (!calibration) {
      const center = calibrationFromMatrix(matrix);
      if (center) {
        calibration = center;
        last = { ...state.poseAt({ yaw: 0, pitch: 0 }, now), direction: 'forward', calibrated: true };
      } else last = { ...state.poseAt(null, now), calibrated: false };
    } else last = { ...state.poseAt(relativePoseFromMatrix(matrix, calibration), now), calibrated: true };
    last.calibrated = Boolean(calibration);
    return last;
  }
  function calibrate(result) {
    const center = calibrationFromMatrix(result?.facialTransformationMatrixes?.[0]);
    if (!center) return false;
    calibration = center;
    last = { ...state.stop(), direction: 'forward', calibrated: true };
    return true;
  }
  function reset() { calibration = null; last = state.stop(); return last; }
  function manual(direction) {
    const result = state.manual(direction);
    if (result) last = { ...result, calibrated: Boolean(calibration) };
    return result;
  }
  return {
    frame, calibrate, stop: reset, recenter: reset, manual,
    orientation: () => last.orientation,
    get direction() { return last.direction; },
    get calibrated() { return calibration !== null; },
  };
}

export function createHeadDirectionState(options = {}) {
  const config = { ...HEAD_DIRECTION_DEFAULTS, ...options };
  let direction = 'uncertain';
  let candidate = null;
  let candidateSince = null;
  let missingSince = null;
  let lastOrientation = null;
  let lastPublish = -Infinity;
  const neutral = () => ({ forward: { ...NEUTRAL_FORWARD }, up: { ...NEUTRAL_UP } });
  function poseAt(value, now) {
    if (!finite(now)) return { direction: 'uncertain', orientation: neutral() };
    const pose = validPose(value);
    if (!pose) {
      if (missingSince === null) missingSince = now;
      candidate = null;
      if (now - missingSince < config.lostGraceMs) return { direction, orientation: lastOrientation || neutral(), holding: true };
      direction = 'uncertain';
      lastOrientation = neutral();
      return { direction, orientation: lastOrientation };
    }
    missingSince = null;
    const next = classifyCalibrated(pose, direction, config);
    if (next !== candidate) { candidate = next; candidateSince = now; }
    const hold = next === 'forward' ? config.centerDwellMs : config.directionDwellMs;
    if (direction !== next && now - candidateSince >= hold) direction = next;
    if (direction === 'uncertain') return { direction, orientation: neutral() };
    const target = direction === 'forward' ? neutral() : orientationFromPose(pose);
    if (!lastOrientation || (now - lastPublish >= config.minimumPublishMs && angleBetween(lastOrientation.forward, target.forward) >= config.audioChangeDegrees)) {
      lastOrientation = target;
      lastPublish = now;
    }
    return { direction, orientation: lastOrientation, pose };
  }
  function manual(label) {
    const orientation = manualOrientation(label);
    if (!orientation) return false;
    lastOrientation = orientation;
    return { direction: label, orientation: lastOrientation };
  }
  function stop() {
    direction = 'uncertain'; candidate = null; candidateSince = null; missingSince = null;
    lastOrientation = neutral(); lastPublish = -Infinity;
    return { direction, orientation: lastOrientation };
  }
  return { poseAt, manual, stop, orientation: () => lastOrientation || neutral() };
}

function validPose(value) {
  return value && finite(value.yaw) && finite(value.pitch) && Math.abs(value.yaw) <= 85 && Math.abs(value.pitch) <= 85
    ? { yaw: value.yaw, pitch: value.pitch } : null;
}
function angleBetween(a, b) {
  return Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z))) * DEG;
}
export function classifyCalibrated(value, previous = 'uncertain', options = {}) {
  const pose = validPose(value);
  if (!pose) return 'uncertain';
  const { forwardDegrees, directionDegrees, exitDegrees, maximumDegrees } = { ...HEAD_DIRECTION_DEFAULTS, ...options };
  if (Math.abs(pose.yaw) > maximumDegrees || Math.abs(pose.pitch) > maximumDegrees) return 'uncertain';
  if (['left', 'right'].includes(previous) && ((previous === 'right' && pose.yaw >= exitDegrees) || (previous === 'left' && pose.yaw <= -exitDegrees))) return previous;
  if (['up', 'down'].includes(previous) && ((previous === 'up' && pose.pitch >= exitDegrees) || (previous === 'down' && pose.pitch <= -exitDegrees))) return previous;
  if (Math.abs(pose.yaw) <= forwardDegrees && Math.abs(pose.pitch) <= forwardDegrees) return 'forward';
  if (Math.abs(pose.yaw) >= directionDegrees && Math.abs(pose.yaw) > Math.abs(pose.pitch)) return pose.yaw > 0 ? 'right' : 'left';
  if (Math.abs(pose.pitch) >= directionDegrees && Math.abs(pose.pitch) > Math.abs(pose.yaw)) return pose.pitch > 0 ? 'up' : 'down';
  return 'uncertain';
}
export function orientationFromPose(value) {
  if (!validPose(value)) return null;
  const yaw = value.yaw / DEG, pitch = value.pitch / DEG;
  return {
    forward: { x: Math.sin(yaw) * Math.cos(pitch), y: Math.cos(yaw) * Math.cos(pitch), z: Math.sin(pitch) },
    up: { x: -Math.sin(yaw) * Math.sin(pitch), y: -Math.cos(yaw) * Math.sin(pitch), z: Math.cos(pitch) },
  };
}
export function manualOrientation(direction, angle = HEAD_DIRECTION_DEFAULTS.directionDegrees) {
  if (!['forward', 'up', 'left', 'right', 'down'].includes(direction) || !finite(angle)) return null;
  return orientationFromPose({
    yaw: direction === 'right' ? angle : direction === 'left' ? -angle : 0,
    pitch: direction === 'up' ? angle : direction === 'down' ? -angle : 0,
  });
}
export function sanitizeOrientation(forward = NEUTRAL_FORWARD, up = NEUTRAL_UP) {
  const f = [forward?.x, forward?.y, forward?.z], u = [up?.x, up?.y, up?.z];
  if (!f.every(finite) || !u.every(finite) || Math.hypot(...f) < 1e-8 || Math.hypot(...u) < 1e-8) return null;
  const fn = f.map(n => n / Math.hypot(...f));
  const un = u.map(n => n / Math.hypot(...u));
  const along = fn.reduce((sum, n, i) => sum + n * un[i], 0);
  if (Math.abs(along) >= 1 - 1e-9) return null;
  const orthogonal = un.map((n, i) => n - along * fn[i]);
  const length = Math.hypot(...orthogonal);
  return { forward: { x: fn[0] || 0, y: fn[1] || 0, z: fn[2] || 0 },
    up: { x: orthogonal[0] / length || 0, y: orthogonal[1] / length || 0, z: orthogonal[2] / length || 0 } };
}
