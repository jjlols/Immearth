/** Mouse, touch and key movement on the Live Map; no audio may start from any of it. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = process.env.JUKEBOX_URL || 'http://127.0.0.1:8001';
if (!new URL(origin).hostname.match(/^(127\.0\.0\.1|localhost|\[::1\])$/)) throw new Error('The map input audit may only target a local server.');
const musicUrl = new URL(origin);
musicUrl.searchParams.set('view', 'music');

const countAudio = () => {
  window.__INPUT_AUDIO__ = { contexts: 0 };
  const Original = window.AudioContext;
  if (!Original) return;
  window.AudioContext = class extends Original {
    constructor(...args) { super(...args); window.__INPUT_AUDIO__.contexts++; }
  };
};

async function open(context) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(countAudio);
  await page.goto(musicUrl.href, { waitUntil: 'networkidle' });
  if (await page.locator('#intro #intro-skip').count()) {
    await page.locator('#intro-skip').click();
    await page.waitForSelector('#intro', { state: 'detached', timeout: 5000 });
  }
  await page.waitForSelector('[data-source-card]');
  await page.waitForFunction(() => !document.querySelector('.music-console .main-action')?.disabled);
  return { page, errors };
}

const region = page => page.locator('[data-exploration-region]').getAttribute('data-exploration-region').then(Number);
const status = page => page.locator('.current-region').innerText();
const contexts = page => page.evaluate(() => window.__INPUT_AUDIO__.contexts);
/** Page coordinates of the centre of a grid cell. */
async function cellPoint(page, row, column) {
  const box = await page.locator('.geographic-canvas').boundingBox();
  return { x: box.x + (column + 0.5) * box.width / 8, y: box.y + (row + 0.5) * box.height / 6, box };
}

const browser = await chromium.launch({ headless: process.env.HEADED !== '1' });
const result = { status: 'passed', origin };
try {
  // Mouse: a crosshair and no hover square; a click moves and puts the marker on the clicked spot; W A S D and the arrow keys step.
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const { page, errors } = await open(context);
    assert.equal(await region(page), 0);
    const before = await status(page);
    // The voice commands turn left / turn right / recenter open #map-navigation: it is the map, and it takes focus.
    assert.equal(await page.locator('#map-navigation.geographic-canvas').count(), 1);
    assert.equal(await page.locator('#map-navigation').getAttribute('tabindex'), '-1');
    // No visible arrow-button bar: the step buttons stay for screen readers only (hidden, out of the Tab order),
    // and the region text stays a visually hidden polite live region.
    assert.equal(await page.locator('.map-move-row').count(), 0);
    const steps = await page.locator('.map-move button').evaluateAll(list => list.map(button => ({
      label: button.getAttribute('aria-label'), tabIndex: button.tabIndex, hidden: button.closest('.map-move').getBoundingClientRect().width <= 1,
    })));
    assert.deepEqual(steps.map(step => step.label), ['Move north', 'Move west', 'Move south', 'Move east']);
    assert.ok(steps.every(step => step.tabIndex === -1 && step.hidden), 'step buttons are hidden and skipped by Tab');
    assert.ok(await page.locator('.current-region').evaluate(node => node.getBoundingClientRect().width <= 1), 'region text is visually hidden');
    assert.match(before, /^Region 1 of 48, row 1 of 6, column 1 of 8\./);
    const hoverPoint = await cellPoint(page, 4, 6);
    await page.mouse.move(hoverPoint.x, hoverPoint.y);
    assert.equal(await page.locator('.region-hover').count(), 0, 'hover draws no square');
    assert.equal(await page.locator('.geographic-canvas').evaluate(node => getComputedStyle(node).cursor), 'crosshair');
    assert.equal(await region(page), 0, 'hover never moves the region');
    assert.equal(await status(page), before, 'hover never changes the announced region');
    const target = await cellPoint(page, 2, 3);
    // Click off the cell centre: the region is the cell, the marker sits on the clicked spot.
    const spot = { x: target.x + 20, y: target.y - 15 };
    await page.mouse.click(spot.x, spot.y);
    assert.equal(await region(page), 19);
    assert.match(await status(page), /^Region 20 of 48, row 3 of 6, column 4 of 8\. /);
    const markerAt = () => page.locator('.exploration-marker').evaluate(node => [parseFloat(node.style.left), parseFloat(node.style.top)]);
    const [left, top] = await markerAt();
    assert.ok(Math.abs(left - (spot.x - target.box.x) / target.box.width * 100) < 0.2, 'marker sits on the clicked spot (x)');
    assert.ok(Math.abs(top - (spot.y - target.box.y) / target.box.height * 100) < 0.2, 'marker sits on the clicked spot (y)');
    // A drag is not a tap.
    await page.mouse.move(target.x, target.y);
    await page.mouse.down();
    await page.mouse.move(target.x + 120, target.y + 60, { steps: 6 });
    await page.mouse.up();
    assert.equal(await region(page), 19, 'a drag does not pick a region');
    // Wheel over the map scrolls the page and never moves the region.
    await page.mouse.move(target.x, target.y);
    await page.mouse.wheel(0, 200);
    assert.equal(await region(page), 19, 'wheel is left to the browser');
    // Right click does not move.
    const other = await cellPoint(page, 0, 0);
    await page.mouse.click(other.x, other.y, { button: 'right' });
    assert.equal(await region(page), 19);
    await page.mouse.move(0, 0);

    // Focus the map the way the voice commands do, then step with keys.
    await page.locator('#map-navigation').focus();
    for (const [key, expected] of [['d', 20], ['ArrowDown', 28], ['a', 27], ['ArrowUp', 19]]) {
      await page.keyboard.press(key);
      assert.equal(await region(page), expected, key);
    }
    // Back on the clicked cell by keys, the marker is at the cell centre, not the old clicked spot.
    const centre = await markerAt();
    assert.ok(Math.abs(centre[0] - (3 + 0.5) / 8 * 100) < 0.01 && Math.abs(centre[1] - (2 + 0.5) / 6 * 100) < 0.01, 'keys put the marker at the cell centre');
    // The hidden step buttons take the same steps, as a screen reader would press them.
    for (const [name, expected] of [['Move east', 20], ['Move south', 28], ['Move west', 27], ['Move north', 19]]) {
      await page.getByRole('button', { name, exact: true }).evaluate(button => button.click());
      assert.equal(await region(page), expected, name);
    }
    for (let i = 0; i < 3; i++) await page.keyboard.press('w');
    assert.equal(await region(page), 3, 'north clamps at the top row');
    // The screen-reader status names the region and the selected map's estimate.
    const announced = await status(page);
    assert.match(announced, /^Region 4 of 48, row 1 of 6, column 4 of 8\. Nitrogen oxides: /);
    assert.equal(await page.locator('.current-region').getAttribute('aria-live'), 'polite');
    assert.equal(await contexts(page), 0, 'mouse, hover, keys and step buttons never create audio');
    assert.deepEqual(errors, []);
    result.mouse = { click: 19, hoverSquare: false, markerOnClickedSpot: true, keySteps: [20, 28, 27, 19], hiddenButtonSteps: [20, 28, 27, 19], announced };
    await context.close();
  }

  // Touch at phone width: a tap moves, a swipe scrolls, nothing creates audio.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const { page, errors } = await open(context);
    await page.locator('.geographic-canvas').scrollIntoViewIfNeeded();
    const tap = await cellPoint(page, 5, 7);
    await page.touchscreen.tap(tap.x, tap.y);
    assert.equal(await region(page), 47);
    // A one-finger swipe across the map stays a scroll, not a tap.
    const start = await cellPoint(page, 3, 1);
    const cdp = await context.newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await touch('touchStart', start.x, start.y);
    for (let step = 1; step <= 8; step++) await touch('touchMove', start.x, start.y - step * 12);
    await touch('touchEnd');
    assert.equal(await region(page), 47, 'a swipe does not pick a region');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal page overflow at 390px');
    const transport = await page.locator('.live-transport').getByRole('button').evaluateAll(list => list.map(button => {
      const rect = button.getBoundingClientRect();
      return rect.width >= 44 && rect.height >= 44 && rect.left >= 0 && rect.right <= innerWidth && Boolean(button.textContent.trim() || button.getAttribute('aria-label'));
    }));
    assert.ok(transport.length >= 3 && transport.every(Boolean), 'labelled 44px transport buttons stay reachable at 390px');
    assert.equal(await contexts(page), 0, 'touch never creates audio');
    assert.deepEqual(errors, []);
    result.touch = { tap: 47, swipeIgnored: true, layout: 390 };
    await context.close();
  }

  // While playing, a click changes the region the music reads, and no second context appears.
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const { page, errors } = await open(context);
    await page.getByRole('button', { name: 'Play remix', exact: true }).click();
    await page.waitForFunction(() => window.__JUKEBOX_AUDIO_REF__?.current?.isRunning, null, { timeout: 45000 });
    const target = await cellPoint(page, 1, 1);
    await page.mouse.click(target.x, target.y);
    assert.equal(await region(page), 9);
    assert.equal(await contexts(page), 1);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    assert.deepEqual(errors, []);
    result.playing = { click: 9, contexts: 1 };
    await context.close();
  }
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
