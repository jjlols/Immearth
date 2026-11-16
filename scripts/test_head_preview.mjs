/**
 * Head preview travel rules through the synthetic camera driver: a look only
 * previews; a prompt return to forward commits one step; edges block; a late
 * return, Stop camera or a keyboard region change only cancels. The marker shows
 * the previewed region during a look and the committed region otherwise, so every
 * committed-region assertion is read after the look has ended.
 * Not a human-camera or listening claim.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { openHeadPage, origin, POSES, POSITIONS, RETURN_WINDOW_MS  } from './lib/headHarness.js';
import { replayHeadLog } from '../src/lib/headReplay.js';

const { browser, page, errors, ...h } = await openHeadPage({ viewport: { width: 1280, height: 840 }, legacyTravelOnRecenter: true });
try {
  const measure = () => page.evaluate(() => {
    const engine = window.__JUKEBOX_AUDIO_REF__.current;
    const spatial = engine.spatial.getDiagnostics();
    const { contexts, sources, decodes, oscillators } = window.__HEAD_TEST__;
    return {
      marker: document.querySelector('[data-exploration-region]').dataset.explorationRegion,
      position: spatial.sourcePosition, route: spatial.route, native: spatial.nativeSourcePosition,
      nox: engine.playableParameters.noxFrequency, rate: engine.playableParameters.temperatureRate,
      audio: { contexts, sources, decodes, oscillators },
    };
  });
  /** Look, return to forward and expect the committed region afterwards. */
  const lookAndReturn = async (label, committed) => {
    await h.look(label);
    await h.waitSource(POSITIONS[label]);
    await h.look('forward');
    await h.waitSource(POSITIONS.forward);
    await h.frames();
    assert.equal(await h.marker(), String(committed), `${label} then forward commits ${committed}`);
  };

  await h.enableCamera();
  await h.play();
  await h.press('d', 'd', 'd', 'd', 'd');
  await h.waitMarker('5');

  // Direct looks without returning to forward: each replaces the preview of
  // committed region 5 (up is blocked at the top row), never chaining.
  const direct = [];
  for (const [label, previewed] of [['right', '6'], ['left', '4'], ['up', '5'], ['down', '13']]) {
    await h.look(label);
    await h.waitSource(POSITIONS[label]);
    await h.waitMarker(previewed);
    const reading = await measure();
    assert.deepEqual(reading.position, POSITIONS[label]);
    assert.equal(reading.route, 'panner-only');
    direct.push({ direction: label, previewed, position: reading.position, nox: reading.nox, rate: reading.rate });
  }
  assert.ok(new Set(direct.map(entry => entry.nox)).size > 1, 'previewed regions drive the estimated palette controls');
  // A keyboard region change cancels the pending look and recentres the source.
  await h.press('Home');
  await h.waitMarker('0');
  await h.waitSource(POSITIONS.forward);
  await h.look('forward');
  await h.frames();
  assert.equal(await h.marker(), '0', 'returning after a keyboard change does not apply the cancelled look');

  const start = await measure();
  assert.equal(start.marker, '0');
  assert.deepEqual(start.position, POSITIONS.forward);
  assert.equal(start.route, 'bypass-only');

  await h.look('right');
  await h.waitSource(POSITIONS.right);
  const right = await measure();
  assert.equal(right.marker, '1', 'the marker previews the look');
  assert.equal(right.route, 'panner-only');
  assert.ok(right.native.x > 1.5, 'right preview stays right even when head orientation follows');
  // A deeper turn in the same direction is the same held look, not a second step.
  await h.setPose({ yaw: 40, pitch: 0 });
  await h.frames();
  assert.equal(await h.marker(), '1');
  await h.look('forward');
  await h.waitSource(POSITIONS.forward);
  await h.waitMarker('1');
  await lookAndReturn('right', 2);

  await h.look('up');
  assert.equal((await measure()).position.y, 2);
  assert.equal(await h.marker(), '2', 'up at the top edge previews nothing new');
  await h.look('forward');
  await h.frames();
  assert.equal(await h.marker(), '2', 'up at the top edge is blocked, not north travel');

  await h.press('s');
  await h.waitMarker('10');
  await h.look('up');
  await h.waitMarker('2');
  await h.look('forward');
  await h.frames();
  assert.equal(await h.marker(), '2', 'up from row 1 returns to row 0');

  // A return after the 1500 ms window only cancels.
  await h.look('right');
  await h.waitMarker('3');
  await page.waitForTimeout(RETURN_WINDOW_MS + 100);
  await h.look('forward');
  await h.frames();
  assert.equal(await h.marker(), '2', 'late return only cancels');

  // Stop camera during a look cancels it and recentres the source; a fresh camera
  // session starts from forward without applying the old look.
  await h.look('right');
  await h.waitMarker('3');
  await h.stopCamera();
  await h.waitSource(POSITIONS.forward);
  await h.waitMarker('2');
  await h.setPose(POSES.forward);
  await h.enableCamera();
  await h.frames();
  assert.equal(await h.marker(), '2');

  await h.press('d');
  await h.waitMarker('3');
  await h.look('left');
  await h.waitMarker('2');
  await h.press('s', 's', 's', 's', 's', 'd', 'd', 'd', 'd');
  await h.waitMarker('47');
  assert.deepEqual((await measure()).position, POSITIONS.forward, 'keyboard change recentres the source');
  await h.look('forward');
  await h.frames();
  assert.equal(await h.marker(), '47');
  await h.look('down');
  assert.equal((await measure()).position.y, -2);
  assert.equal(await h.marker(), '47', 'down at the bottom edge is blocked');
  await page.waitForTimeout(RETURN_WINDOW_MS + 100);
  await h.look('forward');
  await h.frames();
  assert.equal(await h.marker(), '47');

  // Jerry's report: a quick swing past front on the way back is part of the return,
  // never a look the other way, and an overshoot after the return does not undo the move.
  // Each swing is held 18 degrees left for about 120 ms, under the 300 ms a look the
  // other way needs right after a look.
  await h.press('Home', 's', 'd');
  await h.waitMarker('9');
  await h.look('right');
  await h.waitMarker('10');
  await h.setPose({ yaw: -18, pitch: 0 });
  await page.waitForTimeout(120);
  await h.look('forward');
  await h.setPose({ yaw: -18, pitch: 0 });
  await page.waitForTimeout(120);
  await h.setPose(POSES.forward);
  await h.waitSource(POSITIONS.forward);
  await h.frames(12);
  assert.equal(await h.marker(), '10', 'a swing past front moves east, never west, and an overshoot after it does not undo the move');

  // The head log a tester saves replays to the same decisions (scripts/replay_head_log.mjs).
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save head log', exact: true }).click(),
  ]);
  const saved = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(saved.format, 'immearth-head-log');
  assert.ok(saved.entries.some(entry => entry.kind === 'frame' && Number.isFinite(entry.yaw)), 'frames carry head angles');
  const replay = replayHeadLog(saved);
  console.log('LOG_TRAVEL_ARGS',JSON.stringify(replay.logged));
  console.log('REPLAY_READ',JSON.stringify(replay.summary));
  assert.ok(replay.logged.filter(decision => decision.action === 'move').length >= 3, 'the log has the head moves');
  assert.equal(replay.firstDifference, -1, 'the saved log replays to the same travel decisions');
  const headLog = { entries: saved.entries.length, moves: replay.summary.logged.move, frames: replay.summary.frames };
  if (!replay.logged.some(d=>d.action==='move') || replay.firstDifference!==-1) console.log('HEAD_REQUESTED_REPLAY_DIFF',JSON.stringify({travelLog: replay.logged, readResult: replay.summary, firstDifference: replay.firstDifference, rows: replay.rows.slice(0,40), session: saved.entries.filter(e=>e.kind==='session'), sourceSet: saved.config },null,2));

  const audio = (await measure()).audio;
  assert.deepEqual(audio, { contexts: 1, sources: 1, decodes: 1, oscillators: 0 });
  const camera = await h.spy();
  assert.equal(camera.gum, 2);
  assert.equal(camera.stops, 1);
  assert.equal(camera.closes, 1);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'passed', origin, synthetic: true, start, right, direct, headLog, audio }, null, 2));
} finally {
  await browser.close();
}
