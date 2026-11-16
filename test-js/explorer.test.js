import test from 'node:test';
import assert from 'node:assert/strict';
import {
  regionCell, regionStep, regionAtPoint, regionWords, explorerPosition, targetIsForm,
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

test('a click on the map lands in the same 48-cell grid', () => {
  assert.equal(regionAtPoint(0, 0, 800, 600), 0);
  assert.equal(regionAtPoint(799, 599, 800, 600), 47);
  assert.equal(regionAtPoint(-5, 10, 800, 600), 0);
  assert.equal(regionAtPoint(10, 10, 0, 600), null);
  assert.equal(regionWords(0), 'Region 1 of 48, row 1 of 6, column 1 of 8');
  assert.equal(regionWords(47), 'Region 48 of 48, row 6 of 6, column 8 of 8');
});

test('movement does not steal keys from native controls or modifiers', () => {
  const input = { closest: selector => selector.includes('input') ? {} : null, isContentEditable: false };
  const editable = { closest: () => null, isContentEditable: true };
  assert.equal(targetIsForm(input), true);
  assert.equal(targetIsForm(editable), true);
  assert.equal(targetIsForm({ closest: () => null, isContentEditable: false }), false);
  assert.equal(targetIsForm(null), false);
});

test('a point on the map picks the cell under it, clamped to the 6 x 8 grid', async () => {
  const { regionAtPoint, regionWords } = await import('../src/hooks/useExplorer.js');
  assert.equal(regionAtPoint(0, 0, 800, 400), 0);
  assert.equal(regionAtPoint(799.9, 399.9, 800, 400), 47);
  // column = floor(x/width*8), row = floor(y/height*6): (350, 150) on 800x400 is row 2, column 3.
  assert.equal(regionAtPoint(350, 150, 800, 400), 2 * 8 + 3);
  assert.equal(regionAtPoint(800, 400, 800, 400), 47, 'the far edge stays in the last cell');
  assert.equal(regionAtPoint(-5, -5, 800, 400), 0);
  assert.equal(regionAtPoint(10, 10, 0, 400), null);
  assert.equal(regionWords(0), 'Region 1 of 48, row 1 of 6, column 1 of 8');
  assert.equal(regionWords(19), 'Region 20 of 48, row 3 of 6, column 4 of 8');
});
