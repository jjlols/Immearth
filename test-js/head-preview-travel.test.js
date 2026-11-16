import test from 'node:test';
import assert from 'node:assert/strict';
import {
  previewForDirection,
  PREVIEW_RETURN_WINDOW_MS,
  PreviewTravelController,
} from '../src/lib/headPreviewController.js';

for (const [direction, start, neighbor] of [
  ['right', 0, 1], ['left', 5, 4], ['up', 17, 9], ['down', 1, 9],
]) {
  test(`${direction}: preview does not move; prompt recenter commits exactly once`, () => {
    const commits = [];
    const controller = new PreviewTravelController(start);
    controller.onCommit = index => commits.push(index);
    assert.equal(controller.preview(direction, 100).index, neighbor);
    assert.equal(controller.committedIndex, start);
    controller.preview(direction, 1000);
    controller.preview(direction, 9000);
    assert.equal(controller.pendingPreview.index, neighbor);
    assert.equal(controller.recenter(200), neighbor);
    assert.equal(controller.recenter(300), null);
    assert.deepEqual(commits, [neighbor]);
    assert.equal(controller.committedIndex, neighbor);
    assert.equal(controller.pendingPreview, null);
  });
}

test('a direct direction change replaces both preview and source without a forward commit', () => {
  const commits = [];
  const controller = new PreviewTravelController(17);
  controller.onCommit = index => commits.push(index);
  const east = controller.preview('right', 100);
  assert.equal(east.index, 18);
  assert.deepEqual(east.position, { x: 2, y: 0, z: 0 });
  const west = controller.preview('left', 150);
  assert.equal(west.index, 16);
  assert.equal(west.since, 150, 'a fresh look gets its own prompt-return window');
  assert.deepEqual(west.position, { x: -2, y: 0, z: 0 });
  const north = controller.preview('up', 200);
  assert.equal(north.index, 9);
  assert.deepEqual(north.position, { x: 0, y: 2, z: 0 });
  assert.equal(controller.recenter(500), 9);
  assert.deepEqual(commits, [9], 'only recenter changes committed travel');

  for (const [direction, expected] of [['right', 10], ['left', 8], ['up', 1], ['down', 17]]) {
    controller.preview(direction, 1000);
    assert.equal(controller.pendingPreview.index, expected);
    assert.equal(controller.committedIndex, 9);
  }
});

test('two east moves use the new committed region for each preview', () => {
  const controller = new PreviewTravelController(0);
  for (let i = 0; i < 2; i++) {
    controller.preview('right', i * 100);
    assert.equal(controller.recenter(i * 100 + 30), i + 1);
  }
  controller.setCommittedIndex(10);
  controller.preview('up', 2000);
  assert.equal(controller.pendingPreview.index, 2);
  assert.equal(controller.recenter(2098), 2);
});

test('all clamped edges cancel without movement or fabricated neighboring maps', () => {
  for (const [index, direction] of [[0, 'left'], [0, 'up'], [47, 'right'], [47, 'down']]) {
    const controller = new PreviewTravelController(index);
    assert.equal(previewForDirection(index, direction).index, index);
    assert.equal(controller.preview(direction, 0).blocked, true);
    assert.equal(controller.recenter(1), null);
    assert.equal(controller.committedIndex, index);
  }
});

test('late recenter, stop, unknown face and manual selection cancel without travel', () => {
  const controller = new PreviewTravelController(0);
  controller.preview('right', 0);
  assert.equal(controller.recenter(PREVIEW_RETURN_WINDOW_MS + 1), null);
  assert.equal(controller.committedIndex, 0);
  controller.preview('right', 2000);
  controller.cancel();
  assert.equal(controller.pendingPreview, null);
  assert.equal(controller.recenter(2010), null);
  controller.preview('right', 3000);
  controller.setCommittedIndex(47);
  assert.equal(controller.pendingPreview, null);
  assert.equal(controller.preview('down', 4000).blocked, true);
  assert.equal(controller.committedIndex, 47);
});

test('invalid timing and direction cannot silently create a commit', () => {
  assert.throws(() => previewForDirection(0, 'northeast'), RangeError);
  const controller = new PreviewTravelController(0);
  controller.preview('right', 2000);
  assert.equal(controller.recenter(1999), null);
});

test('onDirection reports each step and moves only on a prompt head return', () => {
  const controller = new PreviewTravelController(19);
  const commits = [];
  controller.onCommit = index => commits.push(index);
  assert.deepEqual(controller.onDirection({ direction: 'right', now: 100, source: 'head' }),
    { action: 'preview', direction: 'right', from: 19, to: 20, blocked: false });
  assert.deepEqual(controller.onDirection({ direction: 'right', now: 150, source: 'head' }), { action: 'none' });
  assert.deepEqual(controller.onDirection({ direction: 'forward', now: 600, source: 'head' }),
    { action: 'move', direction: 'right', to: 20, elapsedMs: 500 });
  controller.onDirection({ direction: 'left', now: 1000, source: 'head' });
  assert.deepEqual(controller.onDirection({ direction: 'forward', now: 1001 + PREVIEW_RETURN_WINDOW_MS, source: 'head' }),
    { action: 'late', direction: 'left', to: 19, elapsedMs: PREVIEW_RETURN_WINDOW_MS + 1 });
  controller.onDirection({ direction: 'up', now: 5000, source: 'head' });
  assert.equal(controller.onDirection({ direction: 'uncertain', now: 5100, source: 'head' }).action, 'cancel');
  assert.deepEqual(commits, [20]);
});

test('Calibrate front, a camera reset or a state sync ends a look without moving', () => {
  for (const source of ['calibrate', 'reset', 'sync', 'modal']) {
    const controller = new PreviewTravelController(19);
    const commits = [];
    controller.onCommit = index => commits.push(index);
    controller.onDirection({ direction: 'right', now: 0, source: 'head' });
    assert.deepEqual(controller.onDirection({ direction: 'forward', now: 100, source }),
      { action: 'cancel', direction: 'right', to: 20, reason: `forward/${source}` }, source);
    assert.deepEqual(commits, [], source);
    assert.equal(controller.committedIndex, 19, source);
    assert.equal(controller.pendingPreview, null, source);
  }
});
