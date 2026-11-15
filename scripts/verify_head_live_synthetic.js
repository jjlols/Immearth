/** Synthetic camera + detector integration; not a real-face or listening claim. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = process.env.JUKEBOX_URL || 'http://127.0.0.1:8001';
const browser = await chromium.launch({ headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') console.error('browser:', message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true });
    window.__HEAD_TEST__ = { contexts: 0, closes: 0, calls: 0, gum: 0, stops: 0, timestamps: [] };
    window.__HEAD_POSE__ = { yaw: 0, pitch: 0, missing: false };
    window.DETECTOR = {
      // Head degrees: positive yaw is the subject's right, positive pitch is up.
      detectForVideo(video, timestamp) {
        const spy = window.__HEAD_TEST__;
        spy.calls++;
        spy.timestamps.push(timestamp);
        const { yaw, pitch, missing } = window.__HEAD_POSE__;
        const y = yaw * Math.PI / 180;
        const p = pitch * Math.PI / 180;
        const forward = [-Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p)];
        window.__HEAD_TEST__.lastPose = {yaw, pitch, missing};
        return { facialTransformationMatrixes: missing ? [] : [{
          rows: 4, columns: 4,
          data: [1, 0, 0, 0, 0, 1, 0, 0, ...forward, 0, 0, 0, 0, 1],
        }] };
      },
      close() { window.__HEAD_TEST__.closes++; },
    };
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      if (constraints.audio !== false) throw new Error('Microphone is not allowed');
      window.__HEAD_TEST__.gum++;
      const stream = await getUserMedia(constraints);
      for (const track of stream.getTracks()) {
        const stop = track.stop.bind(track);
        track.stop = () => { window.__HEAD_TEST__.stops++; stop(); };
      }
      return stream;
    };
    const Context = AudioContext;
    window.AudioContext = class extends Context {
      constructor(...args) { super(...args); window.__HEAD_TEST__.contexts++; }
      createOscillator() { throw new Error('oscillator forbidden'); }
    };
  });
  await page.route('**/src/hooks/useHeadDirection.js*', async route => {
    const response = await route.fetch();
    const source = await response.text();
    if (!source.includes('detectorLoader = defaultDetectorLoader')) throw new Error('Head hook detector injection point changed');
    const instrumented = source.replace(
      'detectorLoader = defaultDetectorLoader',
      'detectorLoader=()=>Promise.resolve(window.DETECTOR)',
    );
    await route.fulfill({ response, body: instrumented });
  });
  await page.goto(`${origin}/?view=music`, { waitUntil: 'networkidle' });
  await page.bringToFront();
  await page.locator('.head-start').click();
  await page.waitForSelector('[data-camera-status="active"]');
  await page.locator('.head-preview-choice input').check();
  for (const [label, yaw, pitch] of [
    ['forward', 0, 0], ['right', 25, 0], ['left', -25, 0],
    ['up', 0, 25], ['down', 0, -25], ['forward', 0, 0],
  ]) {
    await page.evaluate(pose => { window.__HEAD_POSE__ = { ...pose, missing: false }; }, { yaw, pitch });
    await page.waitForFunction(value => document.querySelector('[data-direction]')?.dataset.direction === value, label, { timeout: 6000 });
  }
  assert.equal(await page.getByRole('checkbox', { name: 'Head travel' }).isChecked(), false);
  await page.getByRole('checkbox', { name: 'Spatial sound (headphones)' }).check();
  await page.getByRole('checkbox', { name: 'Head travel' }).check();
  assert.equal(await page.evaluate(() => window.__HEAD_TEST__.contexts), 0);
  await page.getByRole('button', { name: 'Play remix', exact: true }).click();
  await page.waitForFunction(() => window.__JUKEBOX_AUDIO_REF__.current?.isRunning, null, { timeout: 45000 });
  await page.getByRole('button', { name: 'Calibrate forward from the current centered head', exact: true }).click();
  await page.evaluate(() => { window.__HEAD_POSE__ = { yaw: 25, pitch: 0, missing: false }; });
  await page.waitForFunction(() => window.__JUKEBOX_AUDIO_REF__.current.spatial.getDiagnostics().sourcePosition.x === 2, null, { timeout: 6000 });
  const preview = await page.evaluate(() => {
    const spatial = window.__JUKEBOX_AUDIO_REF__.current.spatial.getDiagnostics();
    return { enabled: spatial.enabled, sourcePosition: spatial.sourcePosition, route: spatial.route,
      committed: document.querySelector('[data-exploration-region]').dataset.explorationRegion };
  });
  assert.deepEqual(preview, { enabled: true, sourcePosition: { x: 2, y: 0, z: 0 }, route: 'panner-only', committed: '0' });
  // A settled left detection without an intervening forward event must replace
  // both source placement and preview model, without any grid movement.
  await page.evaluate(() => { window.__HEAD_POSE__ = { yaw: -25, pitch: 0, missing: false }; });
  await page.waitForFunction(() => document.querySelector('[data-direction]')?.dataset.direction === 'left', null, { timeout: 6000 });
  await page.waitForFunction(() => window.__JUKEBOX_AUDIO_REF__.current.spatial.getDiagnostics().sourcePosition.x === -2);
  assert.equal(await page.locator('[data-exploration-region]').getAttribute('data-exploration-region'), '0');
  await page.evaluate(() => { window.__HEAD_POSE__ = { yaw: 0, pitch: 0, missing: true }; });
  await page.waitForFunction(() => document.querySelector('[data-direction]')?.dataset.direction === 'uncertain', null, { timeout: 6000 });
  assert.deepEqual(await page.evaluate(() => window.__JUKEBOX_AUDIO_REF__.current.spatial.getDiagnostics().sourcePosition), { x: 0, y: 0, z: 0 });
  assert.equal(await page.locator('[data-exploration-region]').getAttribute('data-exploration-region'), '0');
  await page.evaluate(() => { window.__HEAD_POSE__ = { yaw: 25, pitch: 0, missing: false }; });
  await page.waitForFunction(() => document.querySelector('[data-direction]')?.dataset.direction === 'right', null, { timeout: 6000 });
  await page.evaluate(() => { window.__HEAD_POSE__ = { yaw: 0, pitch: 0, missing: false }; });
  await page.waitForFunction(() => document.querySelector('[data-direction]')?.dataset.direction === 'forward', null, { timeout: 6000 });
  await page.waitForFunction(() => document.querySelector('[data-exploration-region]')?.dataset.explorationRegion === '1');
  assert.deepEqual(await page.evaluate(() => window.__JUKEBOX_AUDIO_REF__.current.spatial.getDiagnostics().sourcePosition), { x: 0, y: 0, z: 0 });
  await page.getByRole('button', { name: 'Stop tracking', exact: true }).click();
  const outcome = await page.evaluate(() => ({
    ...window.__HEAD_TEST__, src: document.querySelector('.head-video').srcObject,
    viewport: innerWidth, bodyWidth: document.documentElement.scrollWidth,
    contexts: window.__JUKEBOX_AUDIO_REF__.current.ctx.state,
  }));
  assert.equal(outcome.src, null);
  assert.equal(outcome.closes, 1);
  assert.equal(outcome.stops, 1);
  assert.equal(outcome.bodyWidth <= outcome.viewport, true);
  assert.ok(outcome.timestamps.every((value, i, values) => i === 0 || value > values[i - 1]));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'passed', origin, synthetic: true, preview, lostFaceCancelled: true, promptRecenterCommit: 1, errors, limitation: 'Synthetic camera frames and face matrices; not human tracking, physical pose accuracy, subjective HRTF, or speaker audibility.' }, null, 2));
} finally { await browser.close(); }
