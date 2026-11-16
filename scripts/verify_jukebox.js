import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const assert_ok = (actual, expected) => assert.equal(actual, expected);

const origin = process.env.JUKEBOX_URL || 'http://127.0.0.1:8001';
if (!new URL(origin).hostname.match(/^(127\.0\.0\.1|localhost|\[::1\])$/)) throw new Error('The audio/UI audit may only target a local server.');
const browser = await chromium.launch({ headless: process.env.HEADED !== '1' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [], requests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error' && !message.text().includes('status of 503')) errors.push(message.text()); });
page.on('response', response => { if (response.url().endsWith('/audio/deliberate-thought.mp3')) requests.push(response.status()); });

await page.addInitScript(() => {
 window.__AUDIO_AUDIT__ = { contexts: [], calls: [] };
 const Original = window.AudioContext || window.webkitAudioContext;
 if (!Original) return;
 class AuditedContext extends Original {
  constructor(...args) { super(...args); window.__AUDIO_AUDIT__.contexts.push(this); }
  decodeAudioData(...args) { window.__AUDIO_AUDIT__.calls.push('decode'); return super.decodeAudioData(...args); }
  createBufferSource(...args) {
   window.__AUDIO_AUDIT__.calls.push('source');
   const source = super.createBufferSource(...args);
   window.__AUDIO_AUDIT__.originalSource ||= source;
   return source;
  }
  createOscillator(...args) { window.__AUDIO_AUDIT__.calls.push('oscillator'); throw new Error('The MP3-only remix must not create an oscillator.'); }
 }
 window.AudioContext = AuditedContext;
 window.webkitAudioContext = AuditedContext;
});
const region = () => page.locator('[data-exploration-region]').getAttribute('data-exploration-region').then(Number);
const engine = expression => page.evaluate(expression);
async function enterPage(target = page) {
 if (await target.locator('dialog.listening-tutorial[open]').count()) {
  await target.getByRole('button', { name: 'Start exploring', exact: true }).click();
 }
 if (await target.locator('#intro #intro-skip').count()) {
  await target.locator('#intro-skip').click();
  await target.waitForSelector('#intro', { state: 'detached', timeout: 5000 });
 }
 await target.evaluate(() => document.activeElement?.blur());
}

try {
 const musicUrl = new URL(origin);
 musicUrl.searchParams.set('view', 'music');
 await page.goto(musicUrl.href, { waitUntil: 'networkidle' });
 await enterPage();
 await page.waitForSelector('[data-source-card]');
 await page.waitForFunction(() => !document.querySelector('.music-console .main-action')?.disabled);
 assert.equal(await engine(() => window.__AUDIO_AUDIT__.contexts.length), 0);
 await page.keyboard.press('d');
 assert.equal(await region(), 1);
 await page.keyboard.press('Home');
 assert.equal(await region(), 0);
 assert.equal(await engine(() => window.__AUDIO_AUDIT__.contexts.length), 0);
 const unnamedControls = await page.locator('button,input').evaluateAll(elements => elements.filter(element => {
  if (element.tagName === 'BUTTON') return !(element.getAttribute('aria-label') || element.textContent.trim());
  return !(element.getAttribute('aria-label') || element.labels?.length);
 }).map(element => element.outerHTML));
 assert.deepEqual(unnamedControls, []);
 await page.getByRole('button', { name: /Ensemble/ }).focus();
 await page.keyboard.press('Enter');

 assert.equal(await page.getByRole('button', { name: /Ensemble/ }).getAttribute('aria-pressed'), 'true');

 await page.getByRole('button', { name: /Solo \/ Explore/ }).focus();
 await page.keyboard.press('Space');
 assert.equal(await page.getByRole('button', { name: /Solo \/ Explore/ }).getAttribute('aria-pressed'), 'true');
 assert_ok(await page.locator('.playback-status').getAttribute('role'), 'status');
 assert_ok(await page.locator('.current-region').getAttribute('role'), 'status');
 assert.equal(await page.getByRole('button', { name: 'Show future spatial audio origin, Vancouver, BC' }).count(), 0);
 assert.equal(await engine(() => window.__AUDIO_AUDIT__.contexts.length), 0);
 await page.getByRole('button', { name: 'Play remix', exact: true }).click();
 await page.waitForFunction(() => window.__AUDIO_AUDIT__.contexts[0]?.state === 'running' && window.__JUKEBOX_AUDIO_REF__.current?.original && window.__JUKEBOX_AUDIO_REF__.current?.isRunning, { timeout: 45000 });
 await page.waitForTimeout(1200);
 assert.equal(await engine(() => window.__AUDIO_AUDIT__.contexts.length), 1);
 assert.equal(await engine(() => window.__AUDIO_AUDIT__.calls.filter(call => call === 'decode').length), 1);
 assert.equal(await engine(() => window.__AUDIO_AUDIT__.calls.filter(call => call === 'source').length), 1);
 const initial = await engine(() => {
  const e = window.__JUKEBOX_AUDIO_REF__.current;
  return { duration: e.buffer.duration, rateTarget: e.original.playbackRate.value,
   state: e.ctx.state, signals: e.getOutputMetrics(), volume: e.volume, dryGain: e.dryGain?.gain.value,
   ids: [...e.models.keys()].filter(id => e.audible(id)) };
 });
 assert.ok(initial.duration > 170);
 assert.equal(initial.state, 'running');
 assert.deepEqual(requests, [200], 'one successful source request per decoded track');
 assert.ok(initial.signals.peak > 0, 'post-chain waveform must contain nonzero audio');
 assert.ok(initial.signals.rms > 0, 'post-chain RMS must contain nonzero audio');
 assert.ok(Math.abs(initial.dryGain - 0.085) < 1e-6, 'source envelope stays at the conservative last-known good value');
 assert.equal(initial.volume, 0.32, 'current user-requested baseline: 0.32 default and 0.5 cap, with comparison signal evidence');
 const spatialBefore = await engine(() => {
  const e = window.__JUKEBOX_AUDIO_REF__.current;
  const fetches = window.__AUDIO_AUDIT__.calls.filter(call => call === 'decode').length;
  const before = document.activeElement;
  e.setSpatialEnabled(true);
  e.setSpatialSourcePosition({ x: 0, y: 0, z: 0 });
  return { source: e.original === window.__AUDIO_AUDIT__.originalSource, fetches,
   position: e.spatial.getDiagnostics().direction.directional, selected: e.playableParameters.spatial.enabled,
   unchangedFocus: document.activeElement === before };
 });
 assert.equal(spatialBefore.source, true);
 assert.equal(spatialBefore.fetches, 1);
 assert.equal(spatialBefore.position, false, 'co-located sources have no inferred direction');
 assert.equal(spatialBefore.selected, true);
 await page.waitForTimeout(300);
 await engine(() => { const e = window.__JUKEBOX_AUDIO_REF__.current;
  e.setSpatialListenerPosition({ x: 0, y: 0, z: 0 });
  e.setSpatialListenerOrientation({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 });
  e.setSpatialSourcePosition({ x: 2, y: 0, z: 0 });
 });
 await page.waitForTimeout(600);
 await engine(() => window.__JUKEBOX_AUDIO_REF__.current.setSpatialEnabled(false));
 assert.equal(await engine(() => window.__AUDIO_AUDIT__.contexts.length), 1);
 assert.equal(await engine(() => window.__AUDIO_AUDIT__.calls.filter(call => call === 'source').length), 1);
 assert.equal(await engine(() => window.__AUDIO_AUDIT__.calls.filter(call => call === 'decode').length), 1);

 await page.evaluate(() => document.activeElement?.blur());
 assert.equal(await region(), 0);
 await page.keyboard.press('d');
 assert.equal(await region(), 1);
 await page.keyboard.press('s');
 assert.equal(await region(), 9);
 await page.keyboard.press('a');
 assert.equal(await region(), 8);
 await page.keyboard.press('w');
 assert.equal(await region(), 0);
 await page.evaluate(() => document.activeElement?.blur());
 await page.keyboard.press('ArrowUp');
 assert.equal(await region(), 0);
 assert.equal(await engine(() => window.__AUDIO_AUDIT__.calls.filter(call => call === 'decode').length), 1);
 await page.keyboard.press('s');
 await page.keyboard.press('d');
 assert.equal(await region(), 9);
 await page.evaluate(() => document.activeElement?.blur());
 await page.waitForTimeout(100);
 await page.keyboard.press('d');
 assert.equal(await region(), 10);
 await page.waitForTimeout(100);
 await page.keyboard.press('Home');
 assert.equal(await region(), 0);
 await page.getByLabel('Show Temperature on map and enable its musical layer').focus();
 await page.keyboard.press('d');
 assert.equal(await region(), 0);
 assert.equal(await page.getByRole('button', { name: 'Show future spatial audio origin, Vancouver, BC' }).count(), 0);
 assert.equal(await engine(() => window.__AUDIO_AUDIT__.calls.filter(call => call === 'decode').length), 1);

 await page.getByRole('button', { name: /Ensemble/ }).click();
 await page.getByRole('button', { name: 'Explore Temperature musical mapping' }).click();
 const live = await engine(() => {
  const e = window.__JUKEBOX_AUDIO_REF__.current;
  return { rateTarget: e.playableParameters.temperatureRate, carbonGainTarget: e.playableParameters.carbonPadGain,
   noxHzTarget: e.playableParameters.noxFrequency, accents: e.accents.size,
   ids: [...e.models.keys()].filter(id => e.audible(id)), metrics: e.getOutputMetrics() };
 });
 assert.ok(live.rateTarget >= 0.83 && live.rateTarget <= 1.22);
 assert.ok(live.carbonGainTarget > 0);
 assert.ok(live.noxHzTarget >= 1200 && live.noxHzTarget <= 16000);
 assert.ok(live.accents <= 8);
 assert.ok(live.metrics.peak > 0);
 // Long enough for a second precipitation schedule, with no generated source.
 await page.waitForTimeout(8500);
 const sustained = await engine(() => {
  const e = window.__JUKEBOX_AUDIO_REF__.current;
  return { originalSource: e.original === window.__AUDIO_AUDIT__.originalSource,
   sources: window.__AUDIO_AUDIT__.calls.filter(call => call === 'source').length,
   oscillators: window.__AUDIO_AUDIT__.calls.filter(call => call === 'oscillator').length,
   rainTarget: e.gates.get('rain').gain.gain.value, fireTarget: e.gates.get('active_fires').gain.gain.value,
   metrics: e.getOutputMetrics() };
 });
 assert.ok(sustained.originalSource);
 assert.equal(sustained.sources, 1, 'envelopes must not spawn independent buffer sources');
 assert.equal(sustained.oscillators, 0);
 assert.ok(sustained.rainTarget <= 0.085 && sustained.fireTarget <= 0.085);
 assert.ok(sustained.metrics.peak > 0);
 await page.getByLabel('Show Temperature on map and enable its musical layer').uncheck();
 assert.equal(await engine(() => window.__JUKEBOX_AUDIO_REF__.current.playableParameters.temperatureRate), 1);
 await page.getByLabel('Show Carbon monoxide on map and enable its musical layer').uncheck();
 assert.equal(await engine(() => window.__JUKEBOX_AUDIO_REF__.current.audible('carbon_monoxide')), false);
 await page.getByRole('button', { name: /Solo \/ Explore/ }).click();
 await page.getByRole('button', { name: 'Explore Nitrogen oxides musical mapping' }).click();
 assert.deepEqual(await engine(() => [...window.__JUKEBOX_AUDIO_REF__.current.models.keys()].filter(id => window.__JUKEBOX_AUDIO_REF__.current.audible(id))), ['nitrogen_oxides']);
 const spatial = await engine(() => {
  const e = window.__JUKEBOX_AUDIO_REF__.current;
  let count = window.__AUDIO_AUDIT__.calls.filter(call => call === 'decode').length;
  e.setSpatialEnabled(true);
  e.setSpatialSourcePosition({ x: 2, y: 0.15, z: 0.1 });
  return { settings: e.spatial.getDiagnostics(), fetchesBefore: count, source: e.original };
 });
 await page.waitForTimeout(1300);
 const spatialSignals = await engine(() => window.__JUKEBOX_AUDIO_REF__.current.getOutputMetrics());
 assert.ok(spatialSignals.channels.length >= 2);
 assert.ok(spatialSignals.channels[0].rms > 0 && spatialSignals.channels[1].rms > 0);
 assert.ok(spatialSignals.channels.every(channel => Number.isFinite(channel.peak) && channel.peak > 0));
 assert.deepEqual(await engine(() => [...window.__JUKEBOX_AUDIO_REF__.current.models.keys()].filter(id => window.__JUKEBOX_AUDIO_REF__.current.audible(id))), ['nitrogen_oxides']);
 await engine(() => { window.__JUKEBOX_AUDIO_REF__.current.spatial.reset();
  window.__JUKEBOX_AUDIO_REF__.current.setSpatialSourcePosition({ x: -2, y: 0.15, z: 0.1 });
  window.__JUKEBOX_AUDIO_REF__.current.setSpatialEnabled(true); });
 await page.waitForTimeout(1300);
 const spatialLeftSignals = await engine(() => window.__JUKEBOX_AUDIO_REF__.current.getOutputMetrics());
 assert.equal(await engine(() => window.__AUDIO_AUDIT__.calls.filter(call => call === 'decode').length), spatial.fetchesBefore);
 assert.equal(await engine(() => window.__AUDIO_AUDIT__.calls.filter(call => call === 'source').length), 1);
 assert.equal(await engine(() => window.__AUDIO_AUDIT__.calls.filter(call => call === 'oscillator').length), 0);
 await engine(() => window.__JUKEBOX_AUDIO_REF__.current.setSpatialEnabled(false));
 await page.getByRole('button', { name: 'Mute', exact: true }).click();
 await page.waitForFunction(() => window.__JUKEBOX_AUDIO_REF__.current.getOutputMetrics().channels.every(channel => channel.rms < 0.0001));
 const muteSpatial = await engine(() => window.__JUKEBOX_AUDIO_REF__.current.getOutputMetrics());
 await page.getByRole('button', { name: 'Unmute', exact: true }).click();
 await page.waitForTimeout(250);

 await page.getByRole('button', { name: 'Pause', exact: true }).click();
 await page.waitForFunction(() => window.__AUDIO_AUDIT__.contexts[0].state === 'suspended');
 assert.equal(await engine(() => window.__JUKEBOX_AUDIO_REF__.current.timer), null);
 await page.getByRole('button', { name: 'Start over', exact: true }).click();
 assert.equal(await engine(() => window.__JUKEBOX_AUDIO_REF__.current.original), null);
 assert.equal(await engine(() => window.__AUDIO_AUDIT__.contexts[0].state), 'suspended');
 await page.waitForFunction(() => window.__JUKEBOX_AUDIO_REF__.current.master.gain.value <= 0.001);
 const measuredMaster = await engine(() => window.__JUKEBOX_AUDIO_REF__.current.master.gain.value);
 await page.getByRole('button', { name: 'Play remix', exact: true }).click();
 await page.waitForFunction(() => window.__AUDIO_AUDIT__.contexts[0].state === 'running' && window.__JUKEBOX_AUDIO_REF__.current?.original && window.__JUKEBOX_AUDIO_REF__.current?.isRunning, { timeout: 45000 });
 assert.equal(await engine(() => window.__AUDIO_AUDIT__.calls.filter(call => call === 'decode').length), 1);
 assert.equal(await engine(() => window.__AUDIO_AUDIT__.contexts.length), 1);
 const volumeTarget = await engine(() => window.__JUKEBOX_AUDIO_REF__.current.volume);
 if (measuredMaster >= 0) await page.waitForFunction(expected => window.__JUKEBOX_AUDIO_REF__.current.master.gain.value >= expected * 0.95, volumeTarget);
 await page.waitForFunction(expected => Math.abs(window.__JUKEBOX_AUDIO_REF__.current.master.gain.value - expected) < 1e-6, volumeTarget);
 assert.ok(Math.abs(await engine(() => window.__JUKEBOX_AUDIO_REF__.current.master.gain.value)-volumeTarget) < 1e-6);
 await page.getByRole('button', { name: 'Mute', exact: true }).click();
 await page.getByRole('button', { name: 'Unmute', exact: true }).click();

 // Leaving the Live Map in-app must stop its music (it once kept playing and Home added a second copy).
 const liveContext = await engine(() => { const e = window.__JUKEBOX_AUDIO_REF__.current; return { running: e.isRunning, state: e.ctx.state }; });
 assert.deepEqual(liveContext, { running: true, state: 'running' });
 await page.locator('a.wordmark').first().click();
 await page.waitForFunction(() => new URLSearchParams(location.search).get('view') === null);
 await page.waitForFunction(() => window.__AUDIO_AUDIT__.contexts[0].state === 'closed', null, { timeout: 5000 });
 await page.waitForTimeout(500);
 assert.ok(await engine(() => window.__AUDIO_AUDIT__.contexts.filter(context => context.state === 'running').length) <= 1, 'Home never runs a second copy beside the Live Map');
 const leftLiveMap = await engine(() => ({ liveMapContext: window.__AUDIO_AUDIT__.contexts[0].state, contexts: window.__AUDIO_AUDIT__.contexts.map(context => context.state) }));
 await page.goto(musicUrl.href, { waitUntil: 'networkidle' });
 await enterPage();

 const failedPage = await browser.newPage();
 const failureUrl = new URL(origin);
 failureUrl.searchParams.set('view', 'music');
 await failedPage.goto(failureUrl.href, { waitUntil: 'networkidle' });
 await enterPage(failedPage);
 await failedPage.route('**/audio/deliberate-thought.mp3', route => route.fulfill({ status: 503, body: 'unavailable' }));
 await failedPage.getByRole('button', { name: 'Play remix', exact: true }).click();
 await failedPage.getByRole('alert').waitFor();
 await failedPage.waitForFunction(() => window.__JUKEBOX_AUDIO_REF__.current?.ctx?.state === 'suspended');
 assert.equal(await failedPage.evaluate(() => window.__JUKEBOX_AUDIO_REF__.current.isRunning), false);
 await failedPage.unroute('**/audio/deliberate-thought.mp3');
 await failedPage.getByRole('button', { name: 'Dismiss', exact: true }).click();
 await failedPage.getByRole('button', { name: 'Retry', exact: true }).click();
 await failedPage.waitForFunction(() => window.__JUKEBOX_AUDIO_REF__.current?.ctx?.state === 'running');
 await failedPage.getByRole('button', { name: 'Pause', exact: true }).click();
 await failedPage.close();

 await page.setViewportSize({ width: 390, height: 844 });
 const responsive = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: innerWidth,
  transport: [...document.querySelectorAll('.music-console button')].every(button => { const rect = button.getBoundingClientRect(); return rect.width > 0 && rect.left >= 0 && rect.right <= innerWidth; }) }));
 assert.ok(responsive.scroll <= responsive.viewport);
 assert.equal(responsive.transport, true);
 assert.deepEqual(errors, []);
 console.log(JSON.stringify({ status: 'passed', origin, mp3Requests: requests, leftLiveMap, initial, live, sustained, spatial, spatialSignals, spatialLeftSignals, muteSpatial, responsive,
  contextCount: 1, decodedBuffers: 1, resetReplayUsesOriginalDecode: true,
  caveat: 'Headless analysers measure final-channel stereo RMS/peak, not subjective audibility or binaural localization. Manual headphone listening remains unverified. Check OS/browser/output volume before changing source gain.' }, null, 2));
} finally {
 await browser.close();
}
