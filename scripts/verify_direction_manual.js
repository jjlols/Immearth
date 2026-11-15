/** Manual-input browser check; not a human-camera or headphone listening claim. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const origin = process.env.JUKEBOX_URL || 'http://127.0.0.1:8001';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    window.__manual = { contexts: 0, sources: 0, decodes: 0, oscillators: 0, gum: 0 };
    const Context = AudioContext;
    window.AudioContext = class extends Context {
      constructor(...args) { super(...args); window.__manual.contexts++; }
      createBufferSource(...args) { window.__manual.sources++; return super.createBufferSource(...args); }
      decodeAudioData(...args) { window.__manual.decodes++; return super.decodeAudioData(...args); }
      createOscillator() { window.__manual.oscillators++; throw new Error('oscillator forbidden'); }
    };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia() { window.__manual.gum++; throw new Error('Unexpected camera request without Enable camera'); },
    } });
  });
  await page.goto(`${origin}/?view=music`, { waitUntil: 'networkidle' });
  await page.locator('.manual-direction').evaluate(node => { node.open = true; });
  const direction = value => page.locator(`[data-direction-button=${value}]`).click();
  const diagnostic = () => page.evaluate(() => window.__JUKEBOX_AUDIO_REF__.current?.spatial.getDiagnostics());
  const committed = () => page.locator('[data-exploration-region]').getAttribute('data-exploration-region');
  const spatial = page.getByRole('checkbox', { name: 'Spatial sound (headphones)' });
  const travel = page.getByRole('checkbox', { name: 'Head travel' });

  await direction('right');
  assert.equal(await committed(), '0');
  assert.equal(await page.evaluate(() => window.__manual.contexts), 0);
  await spatial.check();
  await direction('right');
  assert.equal(await committed(), '0', 'head following also must be opted in');
  await travel.check();
  await direction('right');
  assert.equal(await committed(), '0', 'a look only previews');
  assert.equal(await page.evaluate(() => window.__manual.contexts), 0, 'no context before explicit Play');

  await page.getByRole('button', { name: 'Play remix', exact: true }).click();
  await page.waitForFunction(() => window.__JUKEBOX_AUDIO_REF__.current?.isRunning, null, { timeout: 45000 });
  await page.waitForTimeout(250);
  for (const [label, key, position] of [
    ['Right', 'right', { x: 2, y: 0, z: 0 }],
    ['Left', 'left', { x: -2, y: 0, z: 0 }],
    ['Up', 'up', { x: 0, y: 2, z: 0 }],
    ['Down', 'down', { x: 0, y: -2, z: 0 }],
  ]) {
    await direction(key);
    assert.equal(await page.locator('[data-direction]').getAttribute('data-direction'), key);
    const output = await diagnostic();
    assert.deepEqual(output.sourcePosition, position);
    assert.ok(Math.abs(output.nativeSourcePosition.x - position.x) < 1e-7);
    assert.ok(Math.abs(output.nativeSourcePosition.y - position.z) < 1e-7);
    assert.ok(Math.abs(output.nativeSourcePosition.z + position.y) < 1e-7, 'signed native float -0 and +0 are the same origin component');
    assert.equal(output.route, 'panner-only');
    assert.equal(output.orientation.forward.y, 1, 'a displaced preview stays at an artistic head-local offset');
    await direction('forward');
    assert.deepEqual((await diagnostic()).sourcePosition, { x: 0, y: 0, z: 0 });
    assert.equal((await diagnostic()).route, 'bypass-only');
  }
  await page.getByRole('button', { name: 'Reset manual', exact: true }).click();
  assert.equal((await diagnostic()).sourcePosition.y, 0);
  assert.deepEqual(await page.evaluate(() => window.__manual), { contexts: 1, sources: 1, decodes: 1, oscillators: 0, gum: 0 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await travel.isChecked(), true);
  console.log(JSON.stringify({ status: 'passed', origin, synthetic: true, promptRecenterMovement: true, layout: 390, audio: { contexts: 1, sources: 1, decodes: 1, oscillators: 0 }, limitation: 'Manual artistic direction only; no human, real-camera, HRTF localization or speaker audibility was tested.' }, null, 2));
} finally { await browser.close(); }
