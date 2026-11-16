import test from 'node:test';
import assert from 'node:assert/strict';
import {
 DIRECTIONS, HEAD_DIRECTION_DEFAULTS, poseFromMatrix, calibrationFromMatrix,
 relativePoseFromMatrix, relativeCalibrationSession, createHeadDirectionState,
 classifyCalibrated, manualOrientation, sanitizeOrientation,
} from '../src/lib/headDirection.js';

// Synthetic projection boundary only. No actual camera image or subject evidence.
function matrix(yawDegrees = 0, pitchDegrees = 0) {
 const yaw = yawDegrees * Math.PI / 180, pitch = pitchDegrees * Math.PI / 180;
 const forward = [
  -Math.sin(yaw) * Math.cos(pitch),
  Math.sin(pitch),
  Math.cos(yaw) * Math.cos(pitch),
 ];
 // These partial basis fields are sufficient for the documented *coarse forward*
 // projection; native task's data has the full calibrated four-by-four transform.
 return {
  rows: 4, columns: 4,
  data: [1, 0, 0, 0, 0, 1, 0, 0, ...forward, 0, 0, 0, 0, 1],
 };
}
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
for (const [label, yaw, pitch] of [
 ['forward', 0, 0], ['right', 20, 0], ['left', -20, 0],
 ['up', 0, 20], ['down', 0, -20],
]) {
 test(`${label} face-forward screen-space angle mapping`, () => {
  const actual = poseFromMatrix(matrix(yaw, pitch));
  near(actual.yaw, yaw);
  near(actual.pitch, pitch);
  if (label !== 'forward') assertDirectionInput(matrix(yaw, pitch), label);
 });
}
function assertDirectionInput(matrixValue, expected) {
 const session = relativeCalibrationSession();
 session.frame({ facialTransformationMatrixes: [matrix(0, 0)] }, 0);
 session.frame({ facialTransformationMatrixes: [matrixValue] }, 200);
 assert.equal(session.frame({ facialTransformationMatrixes: [matrixValue] }, 600).direction, expected);
}
test('neutral calibration subtracts reference, does not alter geography', () => {
 const reference = calibrationFromMatrix(matrix(8, 5));
 const forward = relativePoseFromMatrix(matrix(8, 5), reference);
 near(forward.yaw, 0); near(forward.pitch, 0);
 near(relativePoseFromMatrix(matrix(28, 5), reference).yaw, 20);
 near(relativePoseFromMatrix(matrix(8, -15), reference).pitch, -20);
});
test('finite shape/infinite/missing vectors rejected instead of invented head pose', () => {
 for (const value of [
  null, {}, { rows: 4, columns: 3, data: [] },
  { rows: 4, columns: 4, data: Array(16).fill(NaN) },
  { rows: 4, columns: 4, data: Array(16).fill(Infinity) },
  { rows: 4, columns: 4, data: Array(16).fill(0) },
 ]) assert.equal(poseFromMatrix(value), null);
 assert.equal(manualOrientation('uncertain'), null);
});
test('classification boundaries preserve uncertain and per-axis hysteresis', () => {
 for (const [pose, previous, expected] of [
  [{ yaw: 20, pitch: 0 }, null, 'right'],
  [{ yaw: -20, pitch: 0 }, null, 'left'],
  [{ yaw: 0, pitch: 20 }, null, 'up'],
  [{ yaw: 0, pitch: -20 }, null, 'down'],
  [{ yaw: 12, pitch: 0 }, 'right', 'right'],
    [{ yaw: 7, pitch: 0 }, 'right', 'forward'],
    [{ yaw: -12, pitch: 0 }, 'forward', 'forward'],
    [{ yaw: 12, pitch: 0 }, 'uncertain', 'uncertain'],
  [{ yaw: 85, pitch: 0 }, null, 'uncertain'],
  [null, null, 'uncertain'],
 ]) assert.equal(classifyCalibrated(pose, previous), expected);
});
test('missing face uses short retained vector grace and then neutral without engine', () => {
 const state = createHeadDirectionState();
 assert.equal(state.poseAt({ yaw: 20, pitch: 0 }, 0).direction, 'right');
 assert.equal(state.poseAt({ yaw: 20, pitch: 0 }, HEAD_DIRECTION_DEFAULTS.directionDwellMs).direction, 'right');
 assert.equal(state.poseAt(null, 500).direction, 'right');
 assert.equal(state.poseAt(null, 1400).orientation.forward.y, 1);
 assert.equal(state.stop().orientation.forward.y, 1);
});
for (const label of DIRECTIONS.filter(name => name !== 'uncertain')) {
 test(`manual ${label} is unit orthogonal normalized listener vector`, () => {
  const { forward, up } = manualOrientation(label), safe = sanitizeOrientation(forward, up);
  near(Math.hypot(...Object.values(safe.forward)), 1);
  near(Math.hypot(...Object.values(safe.up)), 1);
  near(safe.forward.x * safe.up.x + safe.forward.y * safe.up.y + safe.forward.z * safe.up.z, 0);
  assert.ok(label !== 'right' || forward.x > 0);
  assert.ok(label !== 'left' || forward.x < 0);
  assert.ok(label !== 'up' || forward.z > 0);
  assert.ok(label !== 'down' || forward.z < 0);
 });
}

test('lost face can reacquire directional pose and vector after same dwell', () => {
  const session = relativeCalibrationSession();
  session.frame({ facialTransformationMatrixes: [matrix(0)] }, 0);
  session.frame({ facialTransformationMatrixes: [matrix(25)] }, 200);
  assert.equal(session.frame({ facialTransformationMatrixes: [matrix(25)] }, 600).direction, 'right');
  assert.equal(session.frame({ facialTransformationMatrixes: [] }, 700).direction, 'right');
  assert.equal(session.frame({ facialTransformationMatrixes: [] }, 1600).orientation.forward.y, 1);
  session.frame({ facialTransformationMatrixes: [matrix(25)] }, 1700);
  assert.ok(session.frame({ facialTransformationMatrixes: [matrix(25)] }, 2200).orientation.forward.x > .3);
  assert.equal(session.stop().direction,'uncertain');
});

test('sustained face after uncertain and pending dwell never overrides stable audio labels',()=>{
 const state=createHeadDirectionState();
 assert.equal(state.poseAt(null,0).direction,'uncertain');
 assert.equal(state.poseAt({yaw:25,pitch:0},200).direction,'right');
 assert.equal(state.poseAt({yaw:25,pitch:0},600).direction,'right');
 assert.equal(state.poseAt({yaw:25,pitch:0},900).direction,'right');
});


test('horizontal direction changes bypass a center classification and update vector immediately',()=>{
 const session=relativeCalibrationSession();
 session.frame({facialTransformationMatrixes:[matrix(0)]},0);
 session.frame({facialTransformationMatrixes:[matrix(25)]},100);
 assert.equal(session.frame({facialTransformationMatrixes:[matrix(25)]},500).direction,'right');
 session.frame({facialTransformationMatrixes:[matrix(-25)]},700);
 const changed=session.frame({facialTransformationMatrixes:[matrix(-25)]},1100);
 assert.equal(changed.direction,'left');
 assert.ok(changed.orientation.forward.x<0,'right-to-left does not require forward or a stale orientation');

});

test('a look the other way right after a look must be held; other changes stay fast', () => {
 const {oppositeDwellMs,centerDwellMs}=HEAD_DIRECTION_DEFAULTS;
 const state=createHeadDirectionState();
 assert.equal(state.poseAt({yaw:25,pitch:0},0).direction,'right');
 assert.equal(state.poseAt({yaw:-25,pitch:0},50).direction,'right','a swing past front is not a look left yet');
 assert.equal(state.poseAt({yaw:-25,pitch:0},50+oppositeDwellMs).direction,'left','a held look left counts');
 assert.equal(state.poseAt({yaw:0,pitch:25},400).direction,'up','a look on the other axis is immediate');
 assert.equal(state.poseAt({yaw:0,pitch:0},410).direction,'up');
 assert.equal(state.poseAt({yaw:0,pitch:0},410+centerDwellMs).direction,'forward');
});

test('current low-latency budgets have no redundant direction hold',()=>{
 assert.equal(HEAD_DIRECTION_DEFAULTS.directionDwellMs,0);
 assert.ok(HEAD_DIRECTION_DEFAULTS.centerDwellMs<=120);
 assert.ok(HEAD_DIRECTION_DEFAULTS.sampleIntervalMs<=50);
 assert.ok(HEAD_DIRECTION_DEFAULTS.minimumPublishMs<=100);
 const state=createHeadDirectionState();
 assert.equal(state.poseAt({yaw:22,pitch:0},0).direction,'right');
 assert.equal(state.poseAt({yaw:0,pitch:0},1).direction,'right');
 assert.equal(state.poseAt({yaw:0,pitch:0},HEAD_DIRECTION_DEFAULTS.centerDwellMs+1).direction,'forward');
});

/** Feeds yaw samples 33 ms apart through the classifier and the travel controller, as the hooks do. */
async function travelFor(yaws, start = 19) {
  const { PreviewTravelController } = await import('../src/lib/headPreviewController.js');
  const state = createHeadDirectionState();
  const travel = new PreviewTravelController(start);
  const commits = [];
  travel.onCommit = (index) => commits.push(index);
  let published = null;
  yaws.forEach((yaw, i) => {
    const now = 1000 + i * 33;
    const { direction } = state.poseAt({ yaw, pitch: 0 }, now);
    if (direction === published) return;
    published = direction;
    travel.onDirection({ direction, now, source: 'head' });
  });
  return { commits, pending: travel.pendingPreview };
}
const ramp = (a, b, n) => Array.from({ length: n }, (_, i) => a + ((b - a) * (i + 1)) / n);
const hold = (v, n) => Array(n).fill(v);
const turnRight = [...hold(0, 5), ...ramp(0, 32, 8), ...hold(32, 10)];

test('turning right and back moves one step east however the head comes back', async () => {
  for (const [name, back] of [
    ['clean', [...ramp(32, 0, 8), ...hold(0, 10)]],
    ['rests 8 degrees right', [...ramp(32, 8, 8), ...hold(8, 10)]],
    ['swings 12 degrees past front', [...ramp(32, -12, 7), ...ramp(-12, 0, 4), ...hold(0, 10)]],
    ['swings 18 degrees past front, fast', [...ramp(32, -18, 4), ...ramp(-18, 0, 5), ...hold(0, 15)]],
    ['comes back, then overshoots 18 degrees', [...ramp(32, 0, 8), ...hold(0, 4), ...ramp(0, -18, 3), ...hold(-18, 3), ...ramp(-18, 0, 4), ...hold(0, 15)]],
  ]) {
    const { commits, pending } = await travelFor([...turnRight, ...back]);
    assert.deepEqual(commits, [20], name);
    assert.equal(pending, null, name);
  }
});

test('quick flicks move next, next, next; a held look the other way still moves back', async () => {
  const flick = [...ramp(0, 32, 6), ...hold(32, 4), ...ramp(32, 0, 6), ...hold(0, 4)];
  assert.deepEqual((await travelFor([...hold(0, 5), ...flick, ...flick, ...flick])).commits, [20, 21, 22]);
  const lookLeft = [...ramp(0, -32, 6), ...hold(-32, 20), ...ramp(-32, 0, 6), ...hold(0, 10)];
  assert.deepEqual((await travelFor([...hold(0, 5), ...flick, ...lookLeft])).commits, [20, 19]);
});
