/**
 * Synthetic camera + detector lifecycle: Enable camera, direction labels,
 * Calibrate front, lost face and Stop camera. Not a real-face or listening claim.
 */
import assert from 'node:assert/strict';
import { openHeadPage, origin, POSITIONS } from './lib/headHarness.js';
import {enableHeadTravel} from './lib/headHarness.js';

const { browser, page, errors, ...h } = await openHeadPage({ legacyTravelOnRecenter: true });
try {
  assert.equal((await h.spy()).gum, 0, 'no camera request before Enable camera');
  try { await h.enableCamera(); await enableHeadTravel(page); } catch (error) {
    console.error(await page.evaluate(() => ({ head: document.querySelector('.head-direction')?.outerHTML, spy: window.__HEAD_TEST__, video: document.querySelector('video')?.readyState })));
    throw error;
  }
  assert.equal(await page.getByRole('button', { name: 'Calibrate front', exact: true }).isEnabled(), true);

  // Every coarse label reaches the DOM. Head travel is live whenever the camera is,
  // so the final down -> forward return is a prompt recenter and commits one row south.
  const labels = [];
  for (const label of ['forward', 'right', 'left', 'up', 'down', 'forward']) {
    await h.look(label);
    labels.push(label);
  }
  await h.waitMarker('8');
  await h.press('Home');
  await h.waitMarker('0');
  assert.equal((await h.spy()).contexts, 0, 'no AudioContext before explicit Play');

  await h.play();
  // Calibrate front from an offset head. Back in view at 12 degrees right after a lost face is
  // neither forward nor right (from forward, 12 degrees would stay forward).
  await h.loseFace();
  await h.look('uncertain', { yaw: 12, pitch: 0 });
  await page.getByRole('button', { name: 'Calibrate front', exact: true }).click();
  await h.waitDirection('forward');
  await h.frames();
  assert.equal(await h.direction(), 'forward', 'the calibrated front holds on later frames');
  assert.equal(await h.marker(), '0', 'calibrating with no pending look commits nothing');

  await h.look('right', { yaw: 37, pitch: 0 });
  await h.waitSource(POSITIONS.right);
  const preview = await page.evaluate(() => {
    const spatial = window.__JUKEBOX_AUDIO_REF__.current.spatial.getDiagnostics();
    return { enabled: spatial.enabled, sourcePosition: spatial.sourcePosition, route: spatial.route,
      marker: document.querySelector('[data-exploration-region]').dataset.explorationRegion };
  });
  assert.deepEqual(preview, { enabled: true, sourcePosition: POSITIONS.right, route: 'panner-only', marker: '1' },
    'a look right of the calibrated front previews region 1');
  // A settled left detection without an intervening forward event replaces the source
  // placement and the preview (blocked at the west edge), without any grid movement.
  await h.look('left', { yaw: -13, pitch: 0 });
  await h.waitSource(POSITIONS.left);
  await h.waitMarker('0');
  // Losing the face cancels the look and recentres the source; nothing commits.
  await h.loseFace();
  assert.deepEqual((await h.diag()).sourcePosition, POSITIONS.forward);
  assert.equal(await h.marker(), '0');
  await h.look('right', { yaw: 37, pitch: 0 });
  await h.look('forward', { yaw: 12, pitch: 0 });
  await h.waitMarker('1');
  assert.deepEqual((await h.diag()).sourcePosition, POSITIONS.forward);

  await h.stopCamera();
  const callsAtStop = (await h.spy()).calls;
  await page.waitForTimeout(300);
  const outcome = await page.evaluate(() => ({
    ...window.__HEAD_TEST__, src: document.querySelector('.head-video').srcObject,
    viewport: innerWidth, bodyWidth: document.documentElement.scrollWidth,
    direction: document.querySelector('[data-head-test]').dataset.direction,
    sourcePosition: window.__JUKEBOX_AUDIO_REF__.current.spatial.getDiagnostics().sourcePosition,
    marker: document.querySelector('[data-exploration-region]').dataset.explorationRegion,
  }));
  assert.equal(outcome.src, null, 'the video element releases the stream');
  assert.equal(outcome.stops, 1, 'Stop camera stops the camera track');
  assert.equal(outcome.closes, 1, 'Stop camera closes the detector');
  assert.equal(outcome.calls, callsAtStop, 'no detector frames after Stop camera');
  assert.equal(outcome.gum, 1);
  assert.equal(outcome.direction, 'uncertain');
  assert.deepEqual(outcome.sourcePosition, POSITIONS.forward);
  assert.equal(outcome.marker, '1');
  assert.equal(await page.getByRole('button', { name: 'Enable camera', exact: true }).isVisible(), true);
  assert.equal(await page.getByRole('button', { name: 'Calibrate front', exact: true }).isDisabled(), true);
  assert.equal(outcome.bodyWidth <= outcome.viewport, true, 'no horizontal overflow at 390px');
  assert.ok(outcome.timestamps.every((value, i, values) => i === 0 || value > values[i - 1]), 'detector timestamps stay monotonic');
  assert.equal(outcome.contexts, 1);
  assert.equal(outcome.oscillators, 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'passed', origin, synthetic: true, labels, preview, calibratedFrontOffsetDegrees: 12,
    lostFaceCancelled: true, promptRecenterCommit: 1, detectorFrames: outcome.calls, errors,
    limitation: 'Synthetic camera frames and face matrices; not human tracking, physical pose accuracy, subjective HRTF, or speaker audibility.' }, null, 2));
} finally { await browser.close(); }
