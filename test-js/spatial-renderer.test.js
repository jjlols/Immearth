import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SpatialRenderer, cartesian, toWebAudioPosition, fromWebAudioPosition,
  sphericalDirection, sphericalToPosition, wrapAngle, headRadiusITD,
  inverseDistanceGain, listenerRelativePosition,
} from '../src/audio/spatialRenderer.js';
const close = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
function param() {
  return { value: 0, events: [], cancelScheduledValues() { return this; }, cancelAndHoldAtTime() { return this; },
    setValueAtTime(v, t) { this.value = v; this.events.push(['set', v, t]); return this; },
    setTargetAtTime(v, t, seconds) { this.value = v; this.events.push(['target', v, t, seconds]); return this; } };
}
class Node {
  constructor(name) { this.name = name; this.routes = []; }
  connect(node) { this.routes.push(node); return node; }
  disconnect() { this.routes = []; }
}
class Panner extends Node {
  constructor() { super('panner'); for (const axis of ['X', 'Y', 'Z']) this[`position${axis}`] = param(); this.panningModel = 'equalpower'; }
}
class MockContext {
  constructor() { this.currentTime = 20; this.panners = []; MockContext.calls++; }
  createPanner() { const node = new Panner(); this.panners.push(node); return node; }
  get listener() { return this._listener ||= {}; }
}
MockContext.calls = 0;
function attached({ enabled = false } = {}) {
  const context = new MockContext();
  for (const prefix of ['position', 'forward', 'up']) for (const axis of ['X', 'Y', 'Z']) context.listener[`${prefix}${axis}`] = param();
  const input = new Node('mix'), output = new Node('limiter'), renderer = new SpatialRenderer();
  const contexts = MockContext.calls;
  if (enabled) renderer.setEnabled(true);
  assert.equal(MockContext.calls, contexts, 'constructor never allocates AudioContext');
  renderer.attach(context, input, output);
  return { context, input, output, renderer, panner: context.panners[0] };
}

test('local-metre conversion is finite, consistent, and not a latitude/longitude projection', () => {
  const p = { x: 0, y: 2, z: 3 };
  assert.deepEqual(toWebAudioPosition(p), { x: 0, y: 3, z: -2 });
  assert.deepEqual(fromWebAudioPosition(toWebAudioPosition(p)), p);
  assert.throws(() => cartesian({ x: 0, y: 1 }), /finite/);
  assert.throws(() => cartesian({ x: Infinity, y: 0, z: 0 }), /finite/);
  assert.throws(() => cartesian({ latitude: 49.2827, longitude: -123.1207 }), /finite/);
});
test('left/right/front/back/up/down, zero distances and orientation are unambiguous', () => {
  close(sphericalDirection({ x: 2, y: 4, z: 3 }).distance, Math.sqrt(29));
  close(sphericalDirection({ x: 1, y: 0, z: 0 }).azimuth, Math.PI / 2);
  close(sphericalDirection({ x: -1, y: 0, z: 0 }).azimuth, -Math.PI / 2);
  close(sphericalDirection({ x: 0, y: 1, z: 0 }).azimuth, 0);
  close(Math.abs(sphericalDirection({ x: 0, y: -1, z: 0 }).azimuth), Math.PI);
  close(sphericalDirection({ x: 0, y: 0, z: 2 }).elevation, Math.PI / 2);
  const origin = sphericalDirection({ x: 0, y: 0, z: 0 });
  assert.equal(origin.directional, false);
  assert.equal(listenerRelativePosition({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }).z, -1);
  assert.equal(sphericalDirection({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }).azimuth, 0);
  assert.throws(() => listenerRelativePosition({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }), /nonzero/);
  assert.throws(() => listenerRelativePosition({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 2, z: 0 }), /parallel/);
});
test('orientation seam, wrap, spherical round trip and zero radius are finite', () => {
  close(wrapAngle(3 * Math.PI), -Math.PI);
  const left = sphericalToPosition(Math.PI - 1e-6, 0), right = sphericalToPosition(-Math.PI + 1e-6, 0);
  close(sphericalDirection(left, right).distance, 0, 2e-5);
  for (const azimuth of [-Math.PI, -Math.PI / 2, 0, Math.PI / 2, Math.PI - 0.001]) {
    const point = sphericalToPosition(azimuth, 0.35, 2, { x: 1, y: 2, z: 3 });
    const direction = sphericalDirection(point, { x: 1, y: 2, z: 3 });
    close(wrapAngle(direction.azimuth - azimuth), 0);
    close(direction.elevation, 0.35);
  }
  assert.deepEqual(sphericalToPosition(0, 0, 0, { x: 1, y: 2, z: 3 }), { x: 1, y: 2, z: 3 });
  assert.throws(() => sphericalToPosition(0, 0, -1), /non-negative/);
  assert.throws(() => wrapAngle(NaN), /finite/);
});
test('bounded inverse distance rejects infinities; optional head-radius ITD is not claimed as HRTF', () => {
  assert.equal(inverseDistanceGain(0), 1);
  close(inverseDistanceGain(2), 0.5);
  assert.equal(inverseDistanceGain(1, { rolloffFactor: 0 }), 1);
  assert.throws(() => inverseDistanceGain(-1), /non-negative/);
  assert.throws(() => inverseDistanceGain(2, { referenceDistance: 0 }), /bounded/);
  assert.throws(() => inverseDistanceGain(NaN), /finite/);
  assert.ok(headRadiusITD(Math.PI / 2) > 0 && headRadiusITD(-Math.PI / 2) < 0);
  assert.equal(headRadiusITD(Math.PI / 2, 0), 0);
  assert.throws(() => headRadiusITD(0, -1), /non-negative/);
});
test('bypass and enabled never create parallel dry/panner center copies', () => {
  const { input, output, renderer, panner } = attached();
  assert.deepEqual(input.routes, [output]);
  assert.equal(panner.channelCount, 1, 'shared recording mono-sums once before spatializing');
  assert.equal(panner.channelCountMode, 'explicit');
  assert.equal(renderer.setEnabled(true).route, 'panner-only');
  assert.deepEqual(input.routes, [panner]);
  assert.deepEqual(panner.routes, [output]);
  assert.equal(renderer.setSourcePosition({ x: 0, y: 0, z: 0 }).direction.directional, false);
  renderer.setSourcePosition({ x: 2, y: 0, z: 0 });
  assert.equal(panner.positionX.value, 2);
  renderer.setSourcePosition({ x: 0, y: 1, z: 2 });
  assert.equal(panner.positionY.value, 2);
  assert.equal(panner.positionZ.value, -1);
  renderer.setBypass();
  assert.deepEqual(input.routes, [output]);
  assert.equal(panner.routes.length, 0);
  renderer.dispose();
  assert.deepEqual(input.routes, [output]);
  assert.equal(renderer.getDiagnostics().enabled, false);
});
test('pre-permission settings, listener-relative source orientation, bounded model, reset and disposal', () => {
  const { context, input, output, renderer, panner } = attached({ enabled: true });
  renderer.setListenerPosition({ x: 2, y: 3, z: 4 });
  assert.equal(panner.positionX.value, -2);
  assert.equal(panner.positionY.value, -4);
  assert.equal(panner.positionZ.value, 2);
  assert.equal(context.listener.positionX.value, 0, 'transform supplies listener movement; native head is canonical');
  renderer.setListenerOrientation({ x: 1, y: 0, z: 0 });
  assert.equal(renderer.isRunning, undefined);
  assert.equal(panner.positionZ.value, 2);
  renderer.setSourcePosition({ x: 3, y: 3, z: 4 });
  assert.equal(panner.positionX.value, 0);
  assert.equal(panner.positionZ.value, -1);
  renderer.setDistanceModel({ referenceDistance: 2, maxDistance: 5, rolloffFactor: 0.5 });
  assert.equal(panner.refDistance, 2);
  assert.equal(panner.maxDistance, 5);
  assert.equal(panner.rolloffFactor, 0.5);
  assert.throws(() => renderer.setSourcePosition({ x: NaN, y: 0, z: 0 }), /finite/);
  renderer.reset();
  assert.equal(renderer.enabled, false);
  assert.deepEqual(input.routes, [output]);
  assert.equal(panner.positionZ.value, -1);
  assert.equal(context.listener.forwardZ.value, -1);
  assert.equal(context.listener.upY.value, 1);
  renderer.dispose();
  assert.equal(renderer.getDiagnostics().available, false);
});
test('unavailable panners preserve ordinary stereo, named equalpower fallback is not CIPIC', () => {
  const before = MockContext.calls;
  const renderer = new SpatialRenderer();
  renderer.setSourcePosition({ x: 1, y: 2, z: 3 });
  assert.equal(renderer.ctx, undefined);
  assert.equal(MockContext.calls, before);
  const input = new Node(), output = new Node(), context = new MockContext();
  context.createPanner = () => { throw new Error('unsupported'); };
  renderer.attach(context, input, output);
  assert.equal(renderer.setEnabled(true).enabled, false);
  assert.deepEqual(input.routes, [output]);
  renderer.dispose();
  const fallback = new SpatialRenderer({ panningModel: 'equalpower' });
  fallback.attach(context, input, output);
  assert.equal(fallback.panningModel, 'equalpower');
  assert.equal(fallback.getDiagnostics().hrirDataset, null);
  fallback.dispose();
  assert.throws(() => new SpatialRenderer({ panningModel: 'CIPIC' }), /HRTF or equalpower/);
});
