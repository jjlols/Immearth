/* Optional QA: npm install --no-save --no-package-lock playwright && npx playwright install chromium
 * Start python3 -m http.server 8765 --directory overlay-site first. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.env.EIC_OVERLAY_URL || 'http://localhost:8765');
    await page.waitForFunction(() => document.body.dataset.ready === 'true');
    await page.waitForFunction(() => [...document.querySelectorAll('canvas')].every(canvas => canvas.width > 0 && canvas.dataset.tint));
    const bitmap = await page.evaluate(() => [...document.querySelectorAll('canvas')].map(canvas => {
      const ctx = canvas.getContext('2d');
      const pixel = ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data;
      return Array.from(pixel);
    }));
    // A full-canvas screen fill previously saturated midpoints near white (248+).
    // Per-pixel source luminance masks must leave at least one un-clipped channel.
    for (const pixel of bitmap) assert.ok(Math.min(pixel[0], pixel[1], pixel[2]) < 235, `Clipped R/G/B layer pixel: ${pixel}`);
    assert.equal(await page.locator('canvas').evaluateAll(canvases => new Set(canvases.map(canvas => getComputedStyle(canvas).mixBlendMode)).size), 1);
    assert.equal(await page.locator('canvas').first().evaluate(canvas => getComputedStyle(canvas).mixBlendMode), 'normal');
    await page.screenshot({ path: '/tmp/eic-overlay-desktop.png', fullPage: true });
    assert.equal(await page.locator('#error').isVisible(), false);
    assert.equal(await page.locator('canvas').count(), 5);
    await page.getByRole('button', { name: 'Focus Carbon monoxide', exact: true }).click();
    assert.equal(await page.evaluate(() => window.eicOverlay.getState().focusedId), 'carbon_monoxide');
    assert.equal(await page.locator('canvas.is-selected').count(), 1);
    assert.equal(await page.locator('canvas.is-muted').count(), 4);
    await page.waitForTimeout(700);
    await page.screenshot({ path: '/tmp/eic-overlay-selected.png', fullPage: true });
    await page.getByRole('button', { name: 'Focus Carbon monoxide', exact: true }).click();
    assert.equal(await page.evaluate(() => window.eicOverlay.getState().focusedId), null);
    await page.getByRole('checkbox', { name: 'Show Active fires', exact: true }).uncheck();
    assert.equal(await page.getByRole('checkbox', { name: 'Show Active fires', exact: true }).isChecked(), false);
    await page.getByRole('button', { name: 'Focus Active fires', exact: true }).click();
    assert.equal(await page.getByRole('checkbox', { name: 'Show Active fires', exact: true }).isChecked(), true);
    await page.getByRole('button', { name: 'Reset composition', exact: true }).click();
    await page.getByRole('button', { name: 'Focus Precipitation', exact: true }).focus();
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Focus Active fires');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => window.eicOverlay.getState().focusedId), 'active_fires');
    await page.keyboard.press('KeyA');
    assert.equal(await page.evaluate(() => window.eicOverlay.getState().focusedId), 'active_fires');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => window.eicOverlay.getState().focusedId), null);
    await page.getByRole('checkbox', { name: 'Show subdued basemap', exact: true }).uncheck();
    assert.equal(await page.locator('#map-canvas.no-base').count(), 1);
    await page.getByRole('button', { name: 'Reset composition', exact: true }).click();
    for (const name of ['Precipitation', 'Active fires', 'Carbon monoxide', 'Nitrogen oxides', 'Temperature']) {
      await page.getByRole('checkbox', { name: `Show ${name}`, exact: true }).uncheck();
    }
    assert.match(await page.locator('#mode-label').textContent(), /No visualization layers/);
    await page.getByRole('button', { name: 'Reset composition', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    const width = await page.evaluate(() => ({ screen: window.innerWidth, body: document.body.scrollWidth }));
    assert.equal(width.body, width.screen);
    await page.screenshot({ path: '/tmp/eic-overlay-mobile.png', fullPage: true });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.ok(Number.parseFloat(await page.locator('.map-layer').first().evaluate(element => getComputedStyle(element).transitionDuration)) <= 0.00001);
    await page.route('**/layers.json', route => route.fulfill({ status: 503, body: 'Service unavailable' }));
    await page.reload();
    await page.locator('#error').waitFor({ state: 'visible' });
    assert.match(await page.locator('#error').textContent(), /503/);
    assert.equal(await page.locator('#loading').isVisible(), false);
    await page.unroute('**/layers.json');
    await page.route('**/layers/carbon_monoxide.webp', route => route.abort());
    await page.reload();
    await page.locator('#error').waitFor({ state: 'visible' });
    assert.match(await page.locator('#error').textContent(), /Unable to decode Carbon monoxide/);
    assert.equal(await page.locator('#loading').isVisible(), false);
    console.log('PASS textured canvases, focus, dimming, toggles, keyboard, reduced motion, mobile overflow, empty and fetch-failure states');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
