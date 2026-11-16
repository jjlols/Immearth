import test from 'node:test';
import assert from 'node:assert/strict';
import { readTour, rememberTourStep, finishTour, placeTourCard, TOUR_DONE_KEY, TOUR_STEP_KEY, TOUR_STEPS } from '../src/lib/liveTour.js';

function memory() {
  const bag = new Map();
  return {
    getItem: key => (bag.has(key) ? bag.get(key) : null),
    setItem: (key, value) => bag.set(key, String(value)),
    removeItem: key => bag.delete(key),
  };
}

test('the live tour stays until every step is finished', () => {
  const storage = memory();
  assert.equal(readTour(storage).show, true);
  assert.equal(readTour(storage).step, 0);
  rememberTourStep(storage, 2);
  assert.deepEqual(readTour(storage), { show: true, step: 2 });
  assert.equal(storage.getItem(TOUR_DONE_KEY), null);
  finishTour(storage);
  assert.equal(storage.getItem(TOUR_DONE_KEY), 'done');
  assert.equal(storage.getItem(TOUR_STEP_KEY), null);
  assert.deepEqual(readTour(storage), { show: false, step: 0 });
  assert.equal(TOUR_STEPS.length, 7);
  assert.equal(TOUR_STEPS[1].title, 'Camera');
  assert.equal(TOUR_STEPS[2].title, 'Spatial sound');
  assert.equal(TOUR_STEPS[3].title, 'Move');
});

test('the tour card sits beside the control when there is room', () => {
  const card = { width: 280, height: 160 };
  const viewport = { width: 1200, height: 800 };
  const besideKeys = placeTourCard({ left: 40, top: 420, right: 220, bottom: 520, width: 180, height: 100 }, card, viewport);
  assert.equal(besideKeys.side, 'right');
  assert.ok(besideKeys.left >= 220);
  const widePlayer = placeTourCard({ left: 16, top: 80, right: 1180, bottom: 260, width: 1164, height: 180 }, card, viewport);
  assert.equal(widePlayer.side, 'below');
  const rightEdge = placeTourCard({ left: 980, top: 200, right: 1160, bottom: 280, width: 180, height: 80 }, card, viewport);
  assert.equal(rightEdge.side, 'left');
  const player = placeTourCard(
    { left: 20, top: 221, right: 800, bottom: 495, width: 780, height: 274 },
    { width: 320, height: 217 },
    { width: 835, height: 700, topLimit: 96 },
  );
  assert.ok(player.top >= 96);
  assert.notEqual(player.side, 'above');
});
