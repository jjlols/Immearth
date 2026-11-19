import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const url = process.env.JUKEBOX_URL;
if (!url) throw new Error('Set JUKEBOX_URL to a local or explicitly reviewed Immearth server.');
const browser = await chromium.launch({ headless: process.env.HEADED !== '1' });
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { localStorage.clear(); sessionStorage.clear(); });
    const target = new URL(url);
    target.searchParams.set('view', 'music');
    await page.goto(target.href, { waitUntil: 'networkidle' });
    if (await page.locator('#intro #intro-skip').count()) await page.locator('#intro-skip').click();
    await page.waitForSelector('.live-tour', { state: 'visible' });
    assert.equal(await page.locator('.live-tour').evaluate(node => getComputedStyle(node).position), 'fixed');
    const gaps = await page.locator('.source-card').evaluateAll(cards => cards.map(card => {
      const label = card.querySelector('.visibility-toggle span').getBoundingClientRect();
      const icon = card.querySelector('.metric-symbol').getBoundingClientRect();
      return { id: card.dataset.sourceCard, gap: icon.left - label.right };
    }));
    assert.equal(gaps.length, 5);
    assert.ok(gaps.every(({ gap }) => gap >= 7), `Inclusion labels overlap metric icons: ${JSON.stringify(gaps)}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ viewport: width, tutorial: 'visible', iconGaps: gaps, errors }));
    await page.close();
  }
} finally {
  await browser.close();
}
