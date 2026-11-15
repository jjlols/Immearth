/** Optional spatial output for existing web-audio samples—not a soundtrack.
 * Synthetic local metres: +x right, +y forward, +z up. No map/grid/GPS/latlon
 * conversion. Native Web Audio uses +x right, +y up, -z forward.
 * No AudioContext, samples, timers, nodes or requests are made on import.
 */
export const LISTENER_LOCAL_ORIGIN = Object.freeze({ x: 0, y: 0, z: 0 });
export const DEFAULT_SOURCE_POSITION = Object.freeze({ x: 0, y: 1, z: 0 });
export const DEFAULT_FORWARD = Object.freeze({ x: 0, y: 1, z: 0 });
export const DEFAULT_UP = Object.freeze({ x: 0, y: 0, z: 1 });
export const SPEED_OF_SOUND_METRES_PER_SECOND = 343;

export function cartesian(value, label = 'Position') {
  if (!value || !['x', 'y', 'z'].every(axis => Number.isFinite(value[axis]))) {
    throw new TypeError(`${label} requires finite local-metre x, y and z coordinates.`);
  }
  return { x: value.x, y: value.y, z: value.z };
}
export function toWebAudioPosition(value, label) {
  const { x, y, z } = cartesian(value, label);
  return { x, y: z, z: -y };
}
export function fromWebAudioPosition(value, label) {
  const { x, y, z } = cartesian(value, label);
  return { x, y: -z, z: y };
}
export function subtractPosition(position, listener = LISTENER_LOCAL_ORIGIN) {
  const point = cartesian(position, 'Source position');
  const origin = cartesian(listener, 'Listener position');
  return { x: point.x - origin.x, y: point.y - origin.y, z: point.z - origin.z };
}
export function distanceBetween(position, listener = LISTENER_LOCAL_ORIGIN) {
  const delta = subtractPosition(position, listener);
  return Math.hypot(delta.x, delta.y, delta.z);
}
function listenerBasis(forward, up) {
  const f = cartesian(forward, 'Forward orientation');
  const u = cartesian(up, 'Up orientation');
  const fm = Math.hypot(f.x, f.y, f.z);
  const um = Math.hypot(u.x, u.y, u.z);
  if (!(fm > 0) || !(um > 0)) throw new RangeError('Forward and up orientations must have nonzero length.');
  const front = { x: f.x / fm, y: f.y / fm, z: f.z / fm };
  const unitUp = { x: u.x / um, y: u.y / um, z: u.z / um };
  const dot = front.x * unitUp.x + front.y * unitUp.y + front.z * unitUp.z;
  if (Math.abs(dot) >= 1 - 1e-9) throw new RangeError('Forward and up orientations must not be parallel.');
  const right = { x: front.y * unitUp.z - front.z * unitUp.y,
    y: front.z * unitUp.x - front.x * unitUp.z, z: front.x * unitUp.y - front.y * unitUp.x };
  const rm = Math.hypot(right.x, right.y, right.z);
  right.x /= rm; right.y /= rm; right.z /= rm;
  const correctedUp = { x: right.y * front.z - right.z * front.y,
    y: right.z * front.x - right.x * front.z, z: right.x * front.y - right.y * front.x };
  return { right, front, up: correctedUp };
}
/** Explicit camera/world -> listener-relative native Web Audio coordinates. */
export function listenerRelativePosition(position, listener = LISTENER_LOCAL_ORIGIN,
  forward = DEFAULT_FORWARD, up = DEFAULT_UP) {
  const basis = listenerBasis(forward, up);
  const delta = subtractPosition(position, listener);
  const project = vector => delta.x * vector.x + delta.y * vector.y + delta.z * vector.z;
  return { x: project(basis.right), y: project(basis.up), z: -project(basis.front) };
}
/** Azimuth 0 is facing, +π/2 right. Elevation is up/down, not latitude. */
export function sphericalDirection(position, listener = LISTENER_LOCAL_ORIGIN, forward, up) {
  const native = forward === undefined ? toWebAudioPosition(subtractPosition(position, listener)) :
    listenerRelativePosition(position, listener, forward, up);
  const relative = fromWebAudioPosition(native);
  const horizontal = Math.hypot(relative.x, relative.y);
  const distance = Math.hypot(horizontal, relative.z);
  if (distance === 0) return { azimuth: 0, elevation: 0, distance, relative, directional: false };
  return {
    azimuth: horizontal === 0 ? 0 : Math.atan2(relative.x, relative.y),
    elevation: Math.atan2(relative.z, horizontal), distance, relative, directional: true,
  };
}
export function wrapAngle(angle) {
  if (!Number.isFinite(angle)) throw new TypeError('Angle must be finite radians.');
  const wrapped = ((angle + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  return Object.is(wrapped, -0) ? 0 : wrapped;
}
/** Optional educational ITD helper—not CIPIC, HRTF or an audio delay path. */
export function headRadiusITD(azimuth, radius = 0.0875) {
  if (!Number.isFinite(radius) || radius < 0) throw new RangeError('Head radius must be finite and non-negative.');
  const angle = wrapAngle(azimuth);
  const adjusted = Math.abs(angle) > Math.PI / 2 ? Math.sign(angle) * Math.PI - angle : angle;
  return radius / SPEED_OF_SOUND_METRES_PER_SECOND * (adjusted + Math.sin(adjusted));
}
export function sphericalToPosition(azimuth, elevation, radius = 1, origin = LISTENER_LOCAL_ORIGIN) {
  if (!Number.isFinite(azimuth) || !Number.isFinite(elevation)) throw new TypeError('Angles must be finite radians.');
  if (!Number.isFinite(radius) || radius < 0) throw new RangeError('Radius must be finite and non-negative.');
  const center = cartesian(origin, 'Listener position');
  const horizontal = radius * Math.cos(elevation);
  return {
    x: center.x + horizontal * Math.sin(wrapAngle(azimuth)),
    y: center.y + horizontal * Math.cos(wrapAngle(azimuth)),
    z: center.z + radius * Math.sin(elevation),
  };
}
export function inverseDistanceGain(distance, { referenceDistance = 1, rolloffFactor = 1, maxDistance = 10000 } = {}) {
  if (![distance, referenceDistance, rolloffFactor, maxDistance].every(Number.isFinite)) {
    throw new TypeError('Distance and all distance-model values must be finite.');
  }
  if (distance < 0 || referenceDistance <= 0 || rolloffFactor < 0 || maxDistance < referenceDistance) {
    throw new RangeError('Distances and rolloff must define a non-negative, bounded inverse model.');
  }
  const safe = Math.max(referenceDistance, Math.min(distance, maxDistance));
  return referenceDistance / (referenceDistance + rolloffFactor * (safe - referenceDistance));
}
function write(param, value, time, seconds) {
  if (!param) return;
  if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(time);
  else {
    param.cancelScheduledValues?.(time);
    param.setValueAtTime?.(Number.isFinite(param.value) ? param.value : value, time);
  }
  if (param.setTargetAtTime) param.setTargetAtTime(value, time, Math.max(0.01, seconds));
  else if (param.setValueAtTime) param.setValueAtTime(value, time);
  else param.value = value;
}
const disconnect = node => { try { node?.disconnect(); } catch { /* Already retired. */ } };

// A bounded gain fade with an actual 0/1 endpoint. Keep one *programme* route.
// Do not repeatedly switch stationary panner coordinates or audio streams.
function fade(param, target, time, seconds) {
  param.pendingTarget = target;
  param.cancelScheduledValues?.(time);
  param.setValueAtTime?.(Number.isFinite(param.value) ? param.value : target, time);
  if (param.linearRampToValueAtTime) param.linearRampToValueAtTime(target, time+seconds);
  else write(param,target,time,seconds);
}

export class SpatialRenderer {
  constructor({ panningModel = 'HRTF', distanceModel = 'inverse', referenceDistance = 2,
    maxDistance = 10000, rolloffFactor = 1, transitionSeconds = 0.06 } = {}) {
    if (!['HRTF', 'equalpower'].includes(panningModel)) throw new TypeError('Panning model must be declared HRTF or equalpower.');
    if (distanceModel !== 'inverse') throw new TypeError('Only bounded inverse distance is supported.');
    inverseDistanceGain(1, { referenceDistance, maxDistance, rolloffFactor });
    Object.assign(this, { enabled: false, panningModel, distanceModel, referenceDistance, maxDistance, rolloffFactor });
    this.listenerPosition = { ...LISTENER_LOCAL_ORIGIN };
    this.sourcePosition = { ...DEFAULT_SOURCE_POSITION };
    this.forward = { ...DEFAULT_FORWARD };
    this.up = { ...DEFAULT_UP };
    this.transitionSeconds = Number.isFinite(transitionSeconds) && transitionSeconds >= 0 ? transitionSeconds : 0.06;
    this.outputMode = false;
    this.transitionUntil = 0;
  }
  attach(context, input, output) {
    if (this.ctx) throw new Error('Spatial renderer is already attached.');
    if (!context || !input?.connect || !output?.connect) throw new TypeError('Attach requires an existing shared context, mix input and output.');
    if (input.context && input.context !== context) throw new TypeError('Mix input must belong to the shared AudioContext.');
    this.ctx = context;
    this.input = input;
    this.output = output;
    try { this.panner = context.createPanner?.(); } catch { this.panner = null; }
    if (this.panner) {
      try { this.panner.panningModel = this.panningModel; } catch { this.panner.panningModel = 'equalpower'; }
      this.panningModel = this.panner.panningModel;
      this.panner.channelCountMode = 'explicit';
      this.panner.channelCount = 1;
      // The artistic preview radius is 2 m. A 1 m inverse reference halves
      // the programme before panning, so keep that close preview at unity.
      // Any farther caller position retains bounded inverse attenuation.
      Object.assign(this.panner, { distanceModel: 'inverse', refDistance: this.referenceDistance,
        maxDistance: this.maxDistance, rolloffFactor: this.rolloffFactor });
      this.#writeListener();
      this.#writePannerPosition(0);
      this.dryGain = context.createGain();
      this.wetGain = context.createGain();
      this.dryGain.gain.value = this.isDirectional() ? 0 : 1;
      this.wetGain.gain.value = this.isDirectional() ? 1 : 0;
      // Build once. Head movement only automates AudioParams; neither MP3 is
      // disconnected nor a PannerNode/HRTF state is torn down and recreated.
      this.input.connect(this.panner).connect(this.wetGain).connect(this.output);
      this.input.connect(this.dryGain).connect(this.output);
    } else {
      this.enabled = false;
      this.input.connect(this.output);
    }
    return this;
  }
  #writeListener() {
    const listener = this.ctx.listener;
    const vectors = { position: [0, 0, 0], forward: [0, 0, -1], up: [0, 1, 0] };
    const modern = Object.keys(vectors).every(prefix => ['X', 'Y', 'Z'].every(axis => listener?.[`${prefix}${axis}`]));
    for (const [prefix, values] of Object.entries(vectors)) {
      if (modern) ['X', 'Y', 'Z'].forEach((axis, i) => {
        // The listener itself never moves; these are not recurring head vectors.
        write(listener[`${prefix}${axis}`], values[i], this.ctx.currentTime, 0);
      });
      else if (prefix === 'position') listener?.setPosition?.(...values);
      else if (prefix === 'forward') listener?.setOrientation?.(...vectors.forward, ...vectors.up);
    }
  }
  isDirectional() {
    return this.enabled && Boolean(this.panner) &&
      distanceBetween(this.sourcePosition, this.listenerPosition) > 0;
  }
  #writePannerPosition(seconds = this.transitionSeconds) {
    if (!this.panner) return;
    const relative = listenerRelativePosition(this.sourcePosition, this.listenerPosition, this.forward, this.up);
    this.requestedPannerPosition = Object.fromEntries(Object.entries(relative).map(([axis, value]) => [axis, value || 0]));
    const now = this.ctx.currentTime;
    for (const axis of ['X', 'Y', 'Z']) {
      const parameter = this.panner[`position${axis}`];
      const target = this.requestedPannerPosition[axis.toLowerCase()];
      if (!parameter) continue;
      fade(parameter, target, now, seconds);
    }
  }
  #route() {
    if (!this.ctx || !this.panner) return;
    const spatial = this.isDirectional();
    if (spatial) {
      this.#writePannerPosition();
      // Pure direction changes stay on the existing wet branch. Crossfading
      // the entire recording here would cause an unnecessary level/color jump.
      if (spatial === this.outputMode) return;
    }
    this.outputMode = spatial;
    if (this.ctx.state === 'suspended') {
      this.dryGain.gain.value = spatial ? 0 : 1;
      this.wetGain.gain.value = spatial ? 1 : 0;
      this.transitionUntil = 0;
      return;
    }
    const now = this.ctx.currentTime, seconds = Math.max(0.025, this.transitionSeconds);
    // Complementary gain envelopes sum to unity and never double the recording.
    fade(this.dryGain.gain, spatial ? 0 : 1, now, seconds);
    fade(this.wetGain.gain, spatial ? 1 : 0, now, seconds);
    this.transitionUntil = now + seconds;
  }
  setEnabled(enabled) {
    this.enabled = Boolean(enabled && (!this.ctx || this.panner));
    this.#route();
    return this.getDiagnostics();
  }
  setBypass(value = true) { return this.setEnabled(!value); }
  setListenerPosition(value) {
    this.listenerPosition = cartesian(value, 'Listener position');
    if (this.ctx) {
      this.#writeListener();
      this.#writePannerPosition();
      this.#route();
    }
    return this.getDiagnostics();
  }
  setSourcePosition(value) {
    this.sourcePosition = cartesian(value, 'Source position');
    if (this.ctx) this.#route();
    return this.getDiagnostics();
  }
  setListenerOrientation(forward, up = this.up) {
    listenerBasis(forward, up);
    this.forward = cartesian(forward, 'Forward orientation');
    this.up = cartesian(up, 'Up orientation');
    if (this.ctx) this.#route();
    return this.getDiagnostics();
  }
  setDistanceModel({ distanceModel = 'inverse', referenceDistance = this.referenceDistance,
    maxDistance = this.maxDistance, rolloffFactor = this.rolloffFactor } = {}) {
    if (distanceModel !== 'inverse') throw new TypeError('Only bounded inverse distance is supported.');
    inverseDistanceGain(referenceDistance, { referenceDistance, maxDistance, rolloffFactor });
    Object.assign(this, { referenceDistance, maxDistance, rolloffFactor });
    if (this.panner) Object.assign(this.panner, { distanceModel, refDistance: referenceDistance,
      maxDistance, rolloffFactor });
    return this.getDiagnostics();
  }
  getDiagnostics() {
    const native = listenerRelativePosition(this.sourcePosition, this.listenerPosition, this.forward, this.up);
    const nativeSourcePosition = Object.fromEntries(Object.entries(native).map(([axis, value]) => [axis, value || 0]));
    const available = Boolean(this.panner);
    return {
      available, enabled: available && this.enabled, panningModel: this.panningModel,
      coordinateConvention: 'synthetic listener-local metres: +x right, +y forward, +z up',
      listenerPosition: { ...this.listenerPosition }, sourcePosition: { ...this.sourcePosition },
      distance: distanceBetween(this.sourcePosition, this.listenerPosition),
      direction: sphericalDirection(this.sourcePosition, this.listenerPosition, this.forward, this.up),
      nativeSourcePosition, positionAtOrigin: distanceBetween(this.sourcePosition, this.listenerPosition) === 0,
      orientation: { forward: { ...this.forward }, up: { ...this.up } },
      distanceModel: this.distanceModel, referenceDistance: this.referenceDistance,
      maxDistance: this.maxDistance, rolloffFactor: this.rolloffFactor,
      routes: this.ctx ? 1 : 0, route: this.outputMode ? 'panner-only' : 'bypass-only',
      transitioning: Boolean(this.ctx && this.ctx.currentTime < this.transitionUntil),
      commonPropagationDelayApplied: false, mixesStereoToMonoWhenEnabled: true,
      measuredGeography: false, hrirDataset: null,
    };
  }
  // Kept only for legacy test diagnostics. Live fades advance with the audio
  // clock; no wall-clock timer or reconnection is introduced here.
  settle() {
    if (!this.ctx) return this.getDiagnostics();
    for (const parameter of [this.dryGain?.gain, this.wetGain?.gain,
      ...['X', 'Y', 'Z'].map(axis => this.panner?.[`position${axis}`])]) {
      if (!parameter) continue;
      const target = parameter.pendingTarget ?? parameter.value;
      this.#settleParameter(parameter, target);
    }
    this.transitionUntil = this.ctx.currentTime;
    return this.getDiagnostics();
  }
  #settleParameter(parameter, target) {
    parameter.cancelScheduledValues?.(this.ctx.currentTime);
    parameter.setValueAtTime?.(target, this.ctx.currentTime);
    if (!parameter.setValueAtTime) parameter.value = target;
  }
  reset() {
    this.enabled = false;
    this.listenerPosition = { ...LISTENER_LOCAL_ORIGIN };
    this.sourcePosition = { ...DEFAULT_SOURCE_POSITION };
    this.forward = { ...DEFAULT_FORWARD };
    this.up = { ...DEFAULT_UP };
    if (this.ctx) this.#route();
    return this.getDiagnostics();
  }
  dispose() {
    if (!this.ctx) return;
    this.enabled = false;
    this.outputMode = false;
    this.transitionUntil = 0;
    this.input.disconnect();
    disconnect(this.dryGain);
    disconnect(this.wetGain);
    disconnect(this.panner);
    this.input.connect(this.output);
    this.panner = null;
    this.dryGain = null;
    this.wetGain = null;
    this.ctx = null;
    this.input = null;
    this.output = null;
  }
}
