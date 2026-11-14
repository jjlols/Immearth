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
    await page.waitForFunction(() => [...document.querySelectorAll('canvas')].every(canvas => canvas.width > 0 && canvas.dataset.originalColor));

    // No filters or source pixel recoloring should remain.
    assert.equal(await page.locator('canvas[data-original-color="true"]').count(), 5);
    const exactColors = await page.evaluate(async () => {
      for (const layer of window.eicOverlay.getState().layers) {
        const canvas = [...document.querySelectorAll('canvas')].find(el => el.dataset.layerId === layer.id);
        const source = new Image();
        source.src = layer.url;
        await source.decode();
        const expected = document.createElement('canvas'); expected.width = source.naturalWidth; expected.height = source.naturalHeight;
        const ctx = expected.getContext('2d'); ctx.drawImage(source, 0, 0);
        const positions = [[25, 48], [512, 512], [1024, 700], [1500, 300]];
        for (const [x, y] of positions.filter(([x, y]) => x < source.naturalWidth && y < source.naturalHeight)) {
          if (canvas.width !== expected.width || canvas.height !== expected.height) return false;
          const left = canvas.getContext('2d').getImageData(x, y, 1, 1).data;
          const right = ctx.getImageData(x, y, 1, 1).data;
          if (!left.every((value, index) => value === right[index])) return false;
        }
      }
      return true;
    });
    assert.equal(exactColors, true, 'Each source image must retain exact RGB pixels');
    const noColorFilters = await page.locator('canvas').evaluateAll(canvases => canvases.every(canvas => getComputedStyle(canvas).filter === 'none'));
    assert.equal(noColorFilters, true);
    assert.equal(await page.locator('canvas').evaluateAll(canvases => new Set(canvases.map(canvas => getComputedStyle(canvas).mixBlendMode)).size), 1);
    assert.equal(await page.locator('canvas').first().evaluate(canvas => getComputedStyle(canvas).mixBlendMode), 'normal');
    await page.screenshot({ path: '/tmp/eic-overlay-desktop.png', fullPage: true });
    assert.equal(await page.locator('#error').isVisible(), false);
    assert.equal(await page.locator('canvas').count(), 5);
    await page.getByRole('button', { name: 'Focus Carbon monoxide', exact: true }).click();
    assert.equal(await page.evaluate(() => window.eicOverlay.getState().focusedId), 'carbon_monoxide');
    assert.equal(await page.locator('canvas.is-selected').count(), 1);
    assert.equal(await page.locator('canvas.is-muted').count(), 4);
    assert.equal(await page.locator('canvas.is-selected').evaluate(canvas => getComputedStyle(canvas).zIndex), '20');
    assert.equal(await page.locator('canvas.is-selected').evaluate(canvas => getComputedStyle(canvas).opacity), '1');
    assert.equal(await page.locator('canvas.is-selected').evaluate(canvas => getComputedStyle(canvas).filter), 'none');
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
    await page.route('**/layers/carbon_monoxide.png', route => route.abort());
    await page.reload();
    await page.locator('#error').waitFor({ state: 'visible' });
    assert.match(await page.locator('#error').textContent(), /Unable to decode Carbon monoxide/);
    assert.equal(await page.locator('#loading').isVisible(), false);
    console.log('PASS textured canvases, focus, dimming, toggles, keyboard, reduced motion, mobile overflow, empty and fetch-failure states');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
