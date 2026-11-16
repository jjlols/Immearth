import test from 'node:test';
import assert from 'node:assert/strict';
import {
 DIRECTIONS, HEAD_DIRECTION_DEFAULTS, poseFromMatrix, calibrationFromMatrix,
 relativePoseFromMatrix, relativeCalibrationSession, createHeadDirectionState,
 classifyCalibrated, manualOrientation, sanitizeOrientation,
} from '../src/lib/headDirection.js';
import {PreviewTravelController} from '../src/lib/headPreviewController.js';

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
 ['forward', 0, 0], ['right', 30, 0], ['left', -30, 0],
 ['up', 0, 30], ['down', 0, -30],
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
  [{ yaw: 30, pitch: 0 }, null, 'right'],
  [{ yaw: -30, pitch: 0 }, null, 'left'],
  [{ yaw: 0, pitch: 30 }, null, 'up'],
  [{ yaw: 0, pitch: -30 }, null, 'down'],
  [{ yaw: 7, pitch: 0 }, 'right', 'right'],
  [{ yaw: 85, pitch: 0 }, null, 'uncertain'],
  [null, null, 'uncertain'],
 ]) assert.equal(classifyCalibrated(pose, previous), expected);
});
test('missing face uses short retained vector grace and then neutral without engine', () => {
 const state = createHeadDirectionState();
 state.poseAt({yaw:0,pitch:0},0);
 state.poseAt({yaw:0,pitch:0},HEAD_DIRECTION_DEFAULTS.centerDwellMs);
 state.poseAt({yaw:30,pitch:0},HEAD_DIRECTION_DEFAULTS.centerDwellMs+1);
 assert.equal(state.poseAt({yaw:30,pitch:0},HEAD_DIRECTION_DEFAULTS.centerDwellMs+HEAD_DIRECTION_DEFAULTS.directionDwellMs+1).direction,'right');
 assert.equal(state.poseAt(null, 500).direction, 'right', 'accepted sustained direction remains during face-loss grace');
 assert.equal(state.poseAt(null, 500).holding, true);
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
  session.frame({ facialTransformationMatrixes: [matrix(30)] }, 200);
  assert.equal(session.frame({ facialTransformationMatrixes: [matrix(30)] }, 600).direction, 'right');
  assert.equal(session.frame({ facialTransformationMatrixes: [] }, 700).direction, 'right');
  assert.equal(session.frame({ facialTransformationMatrixes: [] }, 1600).orientation.forward.y, 1);
  session.frame({ facialTransformationMatrixes: [matrix(30)] }, 1700);
  assert.ok(session.frame({ facialTransformationMatrixes: [matrix(30)] }, 2200).orientation.forward.x > .3);
  assert.equal(session.stop().direction,'uncertain');
});

test('sustained face after uncertain and pending dwell never overrides stable audio labels',()=>{
 const state=createHeadDirectionState();
 assert.equal(state.poseAt(null,0).direction,'uncertain');
 assert.equal(state.poseAt({yaw:30,pitch:0},200).direction,'uncertain');
 assert.equal(state.poseAt({yaw:30,pitch:0},600).direction,'right');
 assert.equal(state.poseAt({yaw:30,pitch:0},900).direction,'right');
});


test('horizontal direction changes bypass a center classification after the deliberate hold',()=>{
 const session=relativeCalibrationSession();
 session.frame({facialTransformationMatrixes:[matrix(0)]},0);
 session.frame({facialTransformationMatrixes:[matrix(30)]},100);
 assert.equal(session.frame({facialTransformationMatrixes:[matrix(30)]},500).direction,'right');
 session.frame({facialTransformationMatrixes:[matrix(-30)]},700);
 const changed=session.frame({facialTransformationMatrixes:[matrix(-30)]},1000);
 assert.equal(changed.direction,'left');
 assert.ok(changed.orientation.forward.x<0,'right-to-left does not require forward or a stale orientation');

});

test('direction is deliberate while centering remains deliberate', () => {
 const state=createHeadDirectionState();
 state.poseAt({yaw:30,pitch:0},0);
 assert.equal(state.poseAt({yaw:30,pitch:0},HEAD_DIRECTION_DEFAULTS.directionDwellMs).direction,'right');
 state.poseAt({yaw:-30,pitch:0},550);
 assert.equal(state.poseAt({yaw:-30,pitch:0},800).direction,'left');
 state.poseAt({yaw:0,pitch:0},1000);
 assert.equal(state.poseAt({yaw:0,pitch:0},1150).direction,'forward');
});

test('deliberate verification timing reflects required sustained looks',()=>{
 assert.equal(HEAD_DIRECTION_DEFAULTS.directionDwellMs,250);
 assert.ok(HEAD_DIRECTION_DEFAULTS.centerDwellMs<=160);
 assert.ok(HEAD_DIRECTION_DEFAULTS.sampleIntervalMs<=50);
 assert.ok(HEAD_DIRECTION_DEFAULTS.minimumPublishMs<=100);
 const state=createHeadDirectionState();
 assert.equal(state.poseAt({yaw:20,pitch:0},0).direction,'uncertain');
 state.poseAt({yaw:30,pitch:0},200); assert.equal(state.poseAt({yaw:30,pitch:0},450).direction,'right');
 assert.equal(state.poseAt({yaw:0,pitch:0},700).direction,'right');
 assert.equal(state.poseAt({yaw:0,pitch:0},700+HEAD_DIRECTION_DEFAULTS.centerDwellMs).direction,'forward');
});

test("lateral change preserves held direction until full new-direction and center holds",()=>{
 const state=createHeadDirectionState();
 state.poseAt({yaw:30,pitch:0},700);
 state.poseAt({yaw:30,pitch:0},950);
 assert.equal(state.poseAt({yaw:-30,pitch:0},1000).direction,'right');
 assert.equal(state.poseAt({yaw:-30,pitch:0},1250).direction,'left');
 assert.equal(state.poseAt({yaw:0,pitch:0},1400).direction,'left');
 assert.equal(state.poseAt({yaw:0,pitch:0},1550).direction,'forward');
});

test('short glances do not generate committed directional travel under the actual calibrated session',()=>{
 const session=relativeCalibrationSession(), commit=new PreviewTravelController(0), history=[];
 function process(yaw,time) {
   const matrix={rows:4,columns:4,data:[1,0,0,0,0,1,0,0,-Math.sin(yaw*Math.PI/180),0,Math.cos(yaw*Math.PI/180),0,0,0,0,1]};
   const direction=session.frame({facialTransformationMatrixes:[matrix]},time).direction;
   history.push(direction);
   if(direction==='uncertain')commit.cancel();
   else if(direction==='forward')commit.cancel();
   else if(commit.pendingPreview?.direction!==direction)commit.preview(direction,time);
   return direction;
 }
 process(0,0);
 for(const [yaw,t] of [[20,200],[0,350],[30,600],[30,900],[0,1150],[0,1300]])process(yaw,t);
 assert.equal(commit.committedIndex,0);
 assert.deepEqual(history,['forward','uncertain','uncertain','uncertain','right','right','forward']);
});
