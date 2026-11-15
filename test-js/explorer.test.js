import test from 'node:test';
import assert from 'node:assert/strict';
import {
  regionCell, regionStep, explorerPosition, targetIsForm,
  EXPLORER_COLUMNS, EXPLORER_ROWS, EXPLORER_SIZE,
} from '../src/hooks/useExplorer.js';

test('WASD and arrows navigate a shared clamped eight-by-six grid', () => {
  assert.equal(EXPLORER_COLUMNS, 8);
  assert.equal(EXPLORER_ROWS, 6);
  assert.equal(EXPLORER_SIZE, 48);
  assert.deepEqual(regionStep(regionCell(0), 'w'), regionCell(0));
  assert.deepEqual(regionStep(regionCell(0), 'a'), regionCell(0));
  assert.deepEqual(regionStep(regionCell(0), 'd'), regionCell(1));
  assert.deepEqual(regionStep(regionCell(0), 's'), regionCell(8));
  assert.deepEqual(regionStep(regionCell(8), 'ArrowUp'), regionCell(0));
  assert.deepEqual(regionStep(regionCell(1), 'ArrowLeft'), regionCell(0));
  assert.deepEqual(regionStep(regionCell(7), 'ArrowRight'), regionCell(7));
  assert.deepEqual(regionStep(regionCell(47), 'ArrowDown'), regionCell(47));
  assert.deepEqual(regionCell(47), { index: 47, row: 5, column: 7 });
  assert.equal(explorerPosition(0).left, '6.25%');
  assert.equal(explorerPosition(47).top, '91.66666666666666%');
  assert.throws(() => regionCell(48), RangeError);
});

test('movement does not steal keys from native controls or modifiers', () => {
  const input = { closest: selector => selector.includes('input') ? {} : null, isContentEditable: false };
  const editable = { closest: () => null, isContentEditable: true };
  assert.equal(targetIsForm(input), true);
  assert.equal(targetIsForm(editable), true);
  assert.equal(targetIsForm({ closest: () => null, isContentEditable: false }), false);
  assert.equal(targetIsForm(null), false);
});
