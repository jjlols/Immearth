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
    setTargetAtTime(v, t, seconds) { this.value = v; this.events.push(['target', v, t, seconds]); return this; },
    linearRampToValueAtTime(v, t) { this.value = v; this.events.push(['ramp', v, t]); return this; } };
}
class Node {
  constructor(name) { this.name = name; this.routes = []; }
  connect(node) { this.routes.push(node); return node; }
  disconnect() { this.routes = []; }
}
class Panner extends Node {
  constructor() { super('panner'); for (const axis of ['X', 'Y', 'Z']) this[`position${axis}`] = param(); this.panningModel = 'equalpower'; }
}
