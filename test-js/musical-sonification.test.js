import test from 'node:test';
import assert from 'node:assert/strict';
import { featureModel, coTier, coPadGain, logRank, temperaturePlaybackRate, precipitationDensities } from '../src/audio/musicMappings.js';
import { RemixEngine } from '../src/audio/RemixEngine.js';

function createParams() {
 return { value: 0, events: [], cancelScheduledValues() { return this; },
  cancelAndHoldAtTime() { return this; },
  setTargetAtTime(v) { this.value = v; this.events.push(['target', v]); return this; },
  setValueAtTime(v) { this.value = v; return this; },
  linearRampToValueAtTime(v) { this.value = v; return this; },
  exponentialRampToValueAtTime(v) { this.value = v; return this; } };
}
class ParamNode { connect(node) { this.connect_type = node; return node; } disconnect() { this.closed = true; } }
class MockBufferSource extends ParamNode {
 constructor() { super(); this.frequency = createParams(); this.type = 'sine'; this.started = 0; this.ended = 0; }
 start() { this.started++; }
 stop() { this.ended++; this.onended?.(); }
}
class MockContext {
 constructor() { this.state = 'suspended'; this.currentTime = 100; MockContext.instances++; }
 createGain() { const node = new ParamNode(); node.gain = createParams(); return node; }
 createOscillator() { throw new Error('Remix must never synthesize a tone.'); }
 createBiquadFilter() { const node = new ParamNode(); node.frequency = createParams(); node.Q = createParams(); return node; }
 createPanner() { const node = new ParamNode(); this.panners ||= []; this.panners.push(node);
  for (const key of ['positionX', 'positionY', 'positionZ']) node[key] = createParams(); return node; }
 createDynamicsCompressor() { const node = new ParamNode(); for (const key of ['threshold', 'knee', 'ratio', 'attack', 'release']) node[key] = createParams(); return node; }
 createBufferSource() { const node = new MockBufferSource(); node.loop = false; node.playbackRate = createParams(); (this.sources ||= []).push(node); return node; }
 get destination() { return {}; }
 async resume() { this.state = 'running'; }
 async suspend() { this.state = 'suspended'; }
 async close() { this.state = 'closed'; }
 async decodeAudioData() { this.decodeCount = (this.decodeCount || 0) + 1; return { duration: 177.456 }; }
}
MockContext.instances = 0;
const model = (value, extra = {}) => ({ median: value, classified_count: 20, ...extra });
const okFetch = () => Promise.resolve({ ok: true, arrayBuffer: async () => new Int8Array(8).buffer });
async function playingEngine(models = {}, contextClass = MockContext) {
 const engine = new RemixEngine({ contextClass });
 globalThis.fetch = okFetch;
 engine.setModel(models, { mode: 'composition' });
 await engine.play();
 return engine;
}

test('temperature maps the estimated −40…+40 °C rank to bounded, finite 0.83…1.22 speed', async () => {
 assert.equal(temperaturePlaybackRate(-40), 0.83);
 assert.equal(temperaturePlaybackRate(0), 1.025);
 assert.equal(temperaturePlaybackRate(40), 1.22);
 assert.ok(temperaturePlaybackRate(10) > temperaturePlaybackRate(-10));
 assert.equal(temperaturePlaybackRate(NaN), 1);
 const engine = new RemixEngine({ contextClass: MockContext });
 engine.setModel({ near_surface_temperature: featureModel('near_surface_temperature', model(40)) }, { selection: 'near_surface_temperature' });
 assert.equal(engine.ctx, null);
 globalThis.fetch = okFetch;
 await engine.play();
 assert.equal(engine.original.playbackRate.value, 1.22);
 assert.ok(engine.original.playbackRate.events.length > 0);
 engine.setVisibility('near_surface_temperature', false);
 assert.equal(engine.original.playbackRate.value, 1);
 engine.setVisibility('near_surface_temperature', true);
 engine.setModel({}, { selection: 'near_surface_temperature' });
 assert.equal(engine.original.playbackRate.value, 1);
 await engine.dispose();
});

test('CO uses actual nonuniform anchor gains, with no obsolete 65 ppbv sampling threshold', () => {
 const anchors = [40, 100, 130, 200, 500];
 const gains = anchors.map(coPadGain);
 assert.deepEqual(anchors.map(coTier), [0, 1, 2, 3, 4]);
 assert.equal(coTier(65), 0);
 assert.equal(coTier(99), 0);
 assert.ok(gains.every((gain, index) => index === 0 || gain > gains[index - 1]));
 assert.equal(coPadGain(undefined), 0);
});

test('NOₓ log rank filters the existing music, with no oscillators or repeated chirps', async () => {
 assert.ok(featureModel('nitrogen_oxides', model(0.001)).rank < featureModel('nitrogen_oxides', model(0.01)).rank);
 assert.ok(featureModel('nitrogen_oxides', model(0.01)).rank < featureModel('nitrogen_oxides', model(10)).rank);
 assert.equal(featureModel('nitrogen_oxides', model(NaN)).silent, true);
 assert.equal(logRank(0.01), 0.25);
 const engine = await playingEngine({ nitrogen_oxides: featureModel('nitrogen_oxides', model(0.001)) });
 assert.equal(engine.playableParameters.noxFrequency, 1200);
 const source = engine.original;
 const low = source.playbackRate.value;
 engine.setModel({ nitrogen_oxides: featureModel('nitrogen_oxides', model(10)) }, { mode: 'composition' });
 assert.equal(engine.playableParameters.noxFrequency, 16000);
 assert.equal(engine.original, source);
 assert.equal(source.playbackRate.value, low, 'NOx filtering must not alter playback rate');
 assert.equal(engine.ctx.sources.length, 1);
 assert.equal(engine.accents.size, 0);
 engine.setVisibility('nitrogen_oxides', false);
 assert.equal(engine.audible('nitrogen_oxides'), false);
 assert.equal(engine.playableParameters.noxFrequency, 16000);
 await engine.dispose();
});

test('CO and NOx are switched off by layer visibility without adding a source', async () => {
 const engine = await playingEngine({
  carbon_monoxide: featureModel('carbon_monoxide', model(500)),
  nitrogen_oxides: featureModel('nitrogen_oxides', model(10)),
 });
 assert.ok(engine.playableParameters.carbonPadGain > 0);
 engine.setVisibility('carbon_monoxide', false);
 assert.equal(engine.playableParameters.carbonPadGain, 0);
 assert.equal(engine.playableParameters.noxFrequency, 16000);
 engine.setVisibility('nitrogen_oxides', false);
 assert.equal(engine.playableParameters.noxFrequency, 16000);
 assert.equal(engine.ctx.sources.length, 1);
 await engine.dispose();
});

test('liquid and frozen precipitation remain separate; invalid or overflow readings stay silent', () => {
 const both = featureModel('precipitation', { rain_count: 1, snow_count: 20, max_value: 5, classified_count: 21 });
 assert.ok(both.densities.frozen > both.densities.rain);
 assert.ok(precipitationDensities({ rain_count: 4, snow_count: 0, max_value: 7.5 }).rain > 0);
 assert.equal(precipitationDensities({ rain_count: 0, snow_count: 0, max_value: 0 }).frozen, 0);
 assert.equal(featureModel('precipitation', { classified_count: 0, status: 'silent' }).silent, true);
 // Overflow is intentionally unquantified; it cannot trigger a fabricated strongest tier.
 assert.equal(featureModel('precipitation', { rain_count: 3, snow_count: 0, max_value: 50, classified_count: 3 }).silent, true);
});

test('FRP has sparse finite accents and rejects inactive visibility without scheduling anything', async () => {
 const fire = featureModel('active_fires', model(8));
 assert.equal(fire.power, 1);
 const engine = await playingEngine({ active_fires: fire });
 engine.tick();
 assert.equal(engine.accents.size, 1);
 assert.equal(engine.ctx.sources.length, 1, 'fire envelope must not restart the MP3');
 assert.equal(engine.gates.get('active_fires').gain.gain.value, 0, 'release ends at silence');
 const next = engine.nextFireAt;
 assert.ok(next - engine.currentTime >= 8);
 engine.ctx.currentTime += 1;
 engine.tick();
 assert.equal(engine.accents.size, 1);
 engine.ctx.currentTime += 2;
 engine.tick();
 assert.equal(engine.nextFireAt, next, 'a sparse fire must not retrigger each tick');
 engine.setVisibility('active_fires', false);
 assert.equal(engine.accents.size, 0);
 engine.ctx.currentTime = next + 1;
 engine.tick();
 assert.equal(engine.accents.size, 0);
 await engine.reset();
 assert.equal(engine.accents.size, 0);
 await engine.dispose();
});

test('one explicit Play creates one context and one decoded buffer; reset/replay creates neither again', async () => {
 const before = MockContext.instances;
 const engine = new RemixEngine({ contextClass: MockContext });
 assert.equal(engine.ctx, null);
 engine.setModel({ nitrogen_oxides: featureModel('nitrogen_oxides', model(0.01)), precipitation: { classified_count: 3, densities: {rain: 2, frozen: 0}, strength: .2 } });
 assert.equal(MockContext.instances, before);
 globalThis.fetch = okFetch;
 await engine.play();
 assert.equal(MockContext.instances, before + 1);
 assert.equal(engine.ctx.decodeCount, 1);
 assert.equal(engine.ctx.sources.length, 1);
 assert.ok(Number.isFinite(engine.original.playbackRate.value));
 await engine.play();
 assert.equal(engine.ctx.decodeCount, 1);
 assert.equal(engine.ctx.sources.length, 1);
 for (let i = 0; i < 200; i++) engine.shapeRecording('rain', 0.05);
 assert.ok(engine.accents.size <= 8);
 assert.equal(engine.ctx.sources.length, 1);
 engine.setVolume(12);
 assert.ok(engine.master.gain.value <= 0.5);
 engine.setVolume(0.38);
 assert.equal(engine.volume, 0.38);
 engine.setMute(true);
 assert.equal(engine.master.gain.value, 0);
 engine.setMute(false);
 await engine.pause();
 assert.equal(engine.ctx.state, 'suspended');
 assert.equal(engine.timer, null);
 await engine.play();
 assert.equal(engine.ctx.sources.length, 1);
 assert.notEqual(engine.timer, null, 'pause must be resumable');
 await engine.reset();
 assert.equal(engine.original, null);
 assert.equal(engine.accents.size, 0);
 assert.equal(engine.gates.size, 0);
 assert.equal(engine.ctx.state, 'suspended');
 await engine.play();
 assert.equal(MockContext.instances, before + 1);
 assert.equal(engine.ctx.decodeCount, 1);
 assert.equal(engine.ctx.sources.length, 2);
 await engine.dispose();
 assert.equal(engine.ctx, null);
});

test('only the recording supplies samples; no-data and independent rain/frozen controls stay silent', async () => {
 const engine = await playingEngine({ precipitation: featureModel('precipitation', {
  rain_count: 2, snow_count: 14, max_value: 5, classified_count: 16,
 }) });
 assert.equal(engine.accents.size, 2);
 assert.equal(engine.ctx.sources.length, 1);
 const nextRain = engine.nextDropletAt, nextFrozen = engine.nextFrozenAt;
 engine.tick();
 assert.equal(engine.accents.size, 2);
 assert.equal(engine.nextDropletAt, nextRain);
 assert.equal(engine.nextFrozenAt, nextFrozen);
 assert.ok(nextRain > engine.currentTime && nextFrozen > engine.currentTime);
 engine.setModel({ precipitation: featureModel('precipitation', { classified_count: 0, status: 'silent' }) }, { mode: 'composition' });
 assert.equal(engine.accents.size, 0);
 assert.equal(engine.gates.get('rain').gain.gain.value, 0);
 assert.equal(engine.gates.get('frozen').gain.gain.value, 0);
 await engine.dispose();
});

test('context stays suspended while a play load is pending, and load failures never fabricate playback', async () => {
 const engine = new RemixEngine({ contextClass: MockContext });
 let resolve;
 globalThis.fetch = () => new Promise(done => { resolve = done; });
 const pending = engine.play();
 await Promise.resolve();
 assert.equal(engine.ctx.state, 'suspended');
 resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) });
 await pending;
 assert.equal(engine.ctx.state, 'running');
 await engine.reset();
 assert.equal(engine.ctx.state, 'suspended');
 const failed = new RemixEngine({ contextClass: MockContext });
 globalThis.fetch = () => Promise.resolve({ ok: false, status: 503 });
 await assert.rejects(() => failed.play(), /original track/);
 assert.equal(failed.isRunning, false);
 assert.equal(failed.ctx.state, 'suspended');
 await failed.dispose();
});

test('spatial opt-in keeps one lazy context/source/buffer and one selected nonduplicated output route', async () => {
 const before = MockContext.instances;
 let fetches = 0;
 globalThis.fetch = () => { fetches++; return okFetch(); };
 const engine = new RemixEngine({ contextClass: MockContext });
 engine.setSpatialEnabled(true);
 engine.setSpatialSourcePosition({ x: 1.5, y: 0.25, z: 0 });
 engine.setSpatialListenerPosition({ x: 0, y: 0, z: 0 });
 engine.setModel({ carbon_monoxide: featureModel('carbon_monoxide', model(500)) }, { mode: 'solo', selection: 'carbon_monoxide' });
 assert.equal(engine.ctx, null);
 assert.equal(MockContext.instances, before);
 assert.equal(fetches, 0);
 await engine.play();
 assert.equal(MockContext.instances, before + 1);
 assert.equal(engine.ctx.decodeCount, 1);
 assert.equal(engine.ctx.sources.length, 1);
 const source = engine.original;
 assert.equal(engine.spatial.getDiagnostics().enabled, true);
 assert.equal(engine.master.connect_type, engine.spatial.panner);
 assert.equal(engine.spatial.panner.connect_type, engine.limiter);
 assert.equal(engine.spatial.getDiagnostics().routes, 1);
 assert.equal(engine.spatial.panner.positionX.value, 1.5);
 engine.setSpatialEnabled(false);
 assert.equal(engine.master.connect_type, engine.limiter);
 assert.equal(engine.original, source);
 engine.setSpatialEnabled(true);
 engine.setVisibility('carbon_monoxide', false);
 assert.equal(engine.gates.get('carbon_monoxide').gain.gain.value, 0);
 assert.equal(engine.ctx.sources.length, 1);
 assert.equal(fetches, 1);
 engine.setMute(true);
 engine.setSpatialEnabled(false);
 assert.equal(engine.master.gain.value, 0);
 await engine.pause();
 assert.equal(engine.ctx.state, 'suspended');
 assert.equal(engine.original, source);
 await engine.reset();
 assert.equal(engine.original, null);
 assert.equal(engine.spatial.panner.connect_type, engine.limiter);
 assert.equal(engine.master.connect_type, engine.limiter);
 await engine.play();
 assert.equal(engine.ctx.decodeCount, 1);
 assert.equal(MockContext.instances, before + 1);
 await engine.dispose();
 assert.equal(engine.spatial.panner, null);
 assert.equal(engine.spatial.getDiagnostics().enabled, false);
 assert.equal(engine.ctx, null);
});

test('dispose invalidates a pending decode and cannot later publish or resume removed audio', async () => {
 const engine = new RemixEngine({ contextClass: MockContext });
 let resolveFetch;
 globalThis.fetch = () => new Promise(done => { resolveFetch = done; });
 const pending = engine.play();
 await Promise.resolve();
 await engine.dispose();
 resolveFetch({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
 await pending;
 assert.equal(engine.ctx, null);
 assert.equal(engine.original, null);
 assert.equal(engine.buffer, null);
 assert.equal(engine.timer, null);
 assert.equal(engine.isRunning, false);
});

test('unsupported panners leave the approved recording playable and bypassed', async () => {
 const engine = await playingEngine({}, class extends MockContext { createPanner() { throw new Error('unsupported'); } });
 assert.equal(engine.ctx.sources.length, 1);
 assert.equal(engine.master.connect_type, engine.limiter);
 assert.equal(engine.spatial.getDiagnostics().enabled, false);
 assert.throws(() => engine.setSpatialEnabled(true), /PannerNode/);
 assert.equal(engine.master.connect_type, engine.limiter);
 await engine.dispose();
});
