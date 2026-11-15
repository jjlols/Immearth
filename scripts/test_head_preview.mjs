import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = process.env.JUKEBOX_URL || 'http://127.0.0.1:8001';
if (!new URL(origin).hostname.match(/^(127\.0\.0\.1|localhost)$/)) throw Error('Local-only');
const browser = await chromium.launch({ headless: process.env.HEADED !== '1' });
try {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    window.__HEAD_TRAVEL_AUDIO__ = { contexts: 0, sources: 0, oscillators: 0 };
    const Context = AudioContext;
    window.AudioContext = class extends Context {
      constructor(...args) { super(...args); window.__HEAD_TRAVEL_AUDIO__.contexts++; }
      createBufferSource(...args) { window.__HEAD_TRAVEL_AUDIO__.sources++; return super.createBufferSource(...args); }
      createOscillator() { window.__HEAD_TRAVEL_AUDIO__.oscillators++; throw new Error('single MP3 source only'); }
    };
  });
  await page.goto(`${origin}/?view=music`, { waitUntil: 'networkidle' });
  await page.locator('.manual-direction').evaluate(element => { element.open = true; });
  await page.getByRole('checkbox', { name: /Spatial sound/ }).check();
  const headTravel = page.getByRole('checkbox', { name: 'Head travel' });
  await headTravel.check();
  await page.getByRole('button', { name: 'Play remix', exact: true }).click();
  await page.waitForFunction(() => window.__JUKEBOX_AUDIO_REF__.current?.isRunning, null, { timeout: 45000 });
  const measure = () => page.evaluate(async () => {
    await Promise.resolve();
    const engine = window.__JUKEBOX_AUDIO_REF__.current;
    return {
      committed: document.querySelector('[data-exploration-region]').dataset.explorationRegion,
      position: engine.spatial.getDiagnostics().sourcePosition,
      route: engine.spatial.getDiagnostics().route,
      native: engine.spatial.getDiagnostics().nativeSourcePosition,
      nox: engine.playableParameters.noxFrequency,
      rate: engine.playableParameters.temperatureRate,
      audio: { ...window.__HEAD_TRAVEL_AUDIO__ },
    };
  });
  const hold = direction => page.locator(`[data-direction-button=${direction}]`).click();
  await page.locator('.regional-grid button').nth(5).click();
  const direct = [];
  for (const [direction, position, index] of [
    ['right', { x: 2, y: 0, z: 0 }, '5'],
    ['left', { x: -2, y: 0, z: 0 }, '5'],
    ['up', { x: 0, y: 2, z: 0 }, '5'],
    ['down', { x: 0, y: -2, z: 0 }, '5'],
  ]) {
    await hold(direction);
    await page.waitForFunction(expected => {
      const point = window.__JUKEBOX_AUDIO_REF__.current.spatial.getDiagnostics().sourcePosition;
      return point.x === expected.x && point.y === expected.y && point.z === expected.z;
    }, position);
    const reading = await measure();
    assert.deepEqual(reading.position, position);
    assert.equal(reading.committed, index, 'direct looks do not move the committed map');
    direct.push({ direction, position: reading.position, nox: reading.nox, rate: reading.rate });
  }
  await page.locator('.regional-grid button').nth(0).click();
  await page.waitForFunction(() => window.__JUKEBOX_AUDIO_REF__.current.spatial.getDiagnostics().sourcePosition.x === 0);

  const start = await measure();
  assert.equal(start.committed, '0');
  assert.deepEqual(start.position, { x: 0, y: 0, z: 0 });
  assert.equal(start.route, 'bypass-only');

  await hold('right');
  const right = await measure();
  assert.equal(right.committed, '0');
  assert.deepEqual(right.position, { x: 2, y: 0, z: 0 });
  assert.equal(right.route, 'panner-only');
  assert.ok(right.native.x > 1.9 && Math.abs(right.native.z) < 0.01, 'right preview stays right even when head orientation follows');
  await hold('right');
  assert.equal((await measure()).committed, '0');
  await hold('forward');
  assert.equal((await measure()).committed, '1');
  assert.deepEqual((await measure()).position, { x: 0, y: 0, z: 0 });
  await hold('right');
  await hold('forward');
  assert.equal((await measure()).committed, '2');

  await hold('up');
  assert.equal((await measure()).position.y, 2);
  await hold('forward');
  assert.equal((await measure()).committed, '2', 'up at the top edge is blocked, not north travel');
  await page.locator('.regional-grid button').nth(10).click();
  await hold('up');
  assert.equal((await measure()).committed, '10');
  await hold('forward');
  assert.equal((await measure()).committed, '2');

  await hold('right');
  await page.waitForTimeout(1600);
  await hold('forward');
  assert.equal((await measure()).committed, '2', 'late return only cancels');
  await hold('right');
  await headTravel.uncheck();
  assert.deepEqual((await measure()).position, { x: 0, y: 0, z: 0 });
  await hold('forward');
  assert.equal((await measure()).committed, '2');
  await headTravel.check();
  await page.locator('.regional-grid button').nth(3).click();
  await hold('left');
  await page.locator('.regional-grid button').nth(47).click();
  assert.equal((await measure()).committed, '47');
  assert.deepEqual((await measure()).position, { x: 0, y: 0, z: 0 });
  await hold('forward');
  assert.equal((await measure()).committed, '47');
  await hold('down');
  await page.waitForTimeout(1600);
  await hold('forward');
  assert.equal((await measure()).committed, '47');
  assert.deepEqual((await measure()).audio, { contexts: 1, sources: 1, oscillators: 0 });
  console.log(JSON.stringify({ status: 'passed', origin, synthetic: true, start, right, direct, audio: (await measure()).audio }, null, 2));
} finally {
  await browser.close();
}
