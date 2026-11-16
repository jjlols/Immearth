import test from 'node:test';
import assert from 'node:assert/strict';
import { createHeadLog, frameEntry, HEAD_LOG_FORMAT } from '../src/lib/headLog.js';
import { relativeCalibrationSession } from '../src/lib/headDirection.js';
import { PreviewTravelController } from '../src/lib/headPreviewController.js';
import { replayHeadLog } from '../src/lib/headReplay.js';

test('the head log keeps the newest entries up to its capacity', () => {
  let clock = 0;
  const log = createHeadLog({ capacity: 3, clock: () => clock++ });
  for (const n of [1, 2, 3, 4, 5]) log.record('event', { n });
  assert.deepEqual(log.entries().map(entry => entry.n), [3, 4, 5]);
  assert.deepEqual(log.entries().map(entry => entry.t), [2, 3, 4]);
  assert.equal(log.size, 3);
  assert.equal(log.dropped, 2);
  const saved = log.snapshot({ userAgent: 'test' });
  assert.equal(saved.format, HEAD_LOG_FORMAT);
  assert.equal(saved.dropped, 2);
  assert.equal(saved.userAgent, 'test');
  assert.deepEqual(saved.entries.map(entry => entry.kind), ['event', 'event', 'event']);
  log.clear();
  assert.equal(log.size, 0);
  assert.throws(() => createHeadLog({ capacity: 0 }), RangeError);
});

// A synthetic face transformation matrix, as in head-direction.test.js. No camera image.
function matrix(yawDegrees) {
  const yaw = yawDegrees * Math.PI / 180;
  return { rows: 4, columns: 4, data: [1, 0, 0, 0, 0, 1, 0, 0, -Math.sin(yaw), 0, Math.cos(yaw), 0, 0, 0, 0, 1] };
}
const ramp = (a, b, n) => Array.from({ length: n }, (_, i) => a + ((b - a) * (i + 1)) / n);
const hold = (v, n) => Array(n).fill(v);

/** Records a session as useHeadDirection and useHeadPreviewTravel do; null is a lost face. */
function record(yaws, start = 19, capacity = 30000) {
  let now = 0;
  const log = createHeadLog({ capacity, clock: () => now });
  const travel = new PreviewTravelController(start);
  log.record('region', { index: start, cause: 'other' });
  log.record('session', { action: 'travel', enabled: true });
  log.record('session', { action: 'camera-on' });
  const session = relativeCalibrationSession();
  let published;
  yaws.forEach((yaw, i) => {
    now = 1000 + i * 33.3;
    const result = { facialTransformationMatrixes: yaw === null ? [] : [matrix(yaw)] };
    const output = session.frame(result, now);
    log.record('frame', frameEntry(now, result, output));
    if (output.direction === published) return;
    published = output.direction;
    log.record('event', { t: now, direction: output.direction, source: 'head' });
    const decision = travel.onDirection({ direction: output.direction, now, source: 'head' });
    if (decision.action !== 'none') log.record('travel', { t: now, source: 'head', ...decision });
  });
  return JSON.parse(JSON.stringify(log.snapshot({ userAgent: 'test' })));
}

const swingPastFront = [...hold(0, 5), ...ramp(0, 32, 8), ...hold(32, 10), ...ramp(32, -18, 4), ...ramp(-18, 0, 5), ...hold(0, 15), null, null, ...hold(0, 5)];

test('a saved head log replays to the same travel decisions', () => {
  const saved = record(swingPastFront);
  assert.ok(saved.entries.some(entry => entry.kind === 'frame' && entry.cal), 'the first face is the calibration frame');
  assert.ok(saved.entries.every(entry => entry.kind !== 'frame' || entry.yaw === null || Number.isFinite(entry.yaw)));
  const { replayed, logged, firstDifference, summary } = replayHeadLog(saved);
  assert.deepEqual(logged.map(d => [d.action, d.to]), [['preview', 20], ['move', 20]]);
  assert.deepEqual(replayed.map(d => [d.action, d.to]), [['preview', 20], ['move', 20]]);
  assert.equal(firstDifference, -1);
  assert.equal(summary.frames, swingPastFront.length);
  assert.equal(summary.faceLost, 2);
});

test('a full log carries the dropped region, travel switch and camera state, so a long session still replays', () => {
  const total = record(swingPastFront).entries.length;
  // Drop the region, travel and camera-on entries and the calibration frame.
  const saved = record(swingPastFront, 19, total - 4);
  assert.equal(saved.dropped, 4);
  assert.deepEqual(saved.entries.filter(entry => entry.carried).map(entry => [entry.kind, entry.index ?? entry.action]),
    [['region', 19], ['session', 'travel'], ['session', 'camera-on']]);
  assert.equal(saved.entries.length, total - 1);
  const { replayed, rows, comparedFrom, firstDifference } = replayHeadLog(saved);
  assert.deepEqual(replayed.map(d => [d.action, d.to]), [['preview', 20], ['move', 20]]);
  assert.equal(rows.length, 2);
  assert.equal(comparedFrom, 0);
  assert.equal(firstDifference, -1);
});

test('a replay pairs decisions by time, so one extra decision does not shift the rest', () => {
  const saved = record(swingPastFront);
  const first = saved.entries.findIndex(entry => entry.kind === 'travel');
  saved.entries.splice(first, 0, { ...saved.entries[first], t: saved.entries[first].t - 1, action: 'cancel' });
  const { rows, firstDifference } = replayHeadLog(saved);
  assert.deepEqual(rows.map(row => [row.logged?.action ?? null, row.replayed?.action ?? null]), [['cancel', null], ['preview', 'preview'], ['move', 'move']]);
  assert.equal(firstDifference, 0);
});

test('a replay shows where the current code decides differently from the saved run', () => {
  const saved = record(swingPastFront);
  // As if saved by a build that read the swing past front as a look west.
  saved.entries = saved.entries.map(entry => (entry.kind === 'travel' && entry.action === 'move' ? { ...entry, direction: 'left', to: 18 } : entry));
  assert.equal(replayHeadLog(saved).firstDifference, 1);
  // The old rule, with no hold for a look the other way, makes the same mistake again.
  const old = replayHeadLog(record(swingPastFront), { config: { oppositeDwellMs: 0 } });
  assert.deepEqual(old.replayed.map(d => [d.action, d.to]), [['preview', 20], ['preview', 18], ['move', 18]]);
  assert.throws(() => replayHeadLog({ entries: [] }), TypeError);
});
