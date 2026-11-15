import test from 'node:test';
import assert from 'node:assert/strict';
import { regionCell, regionStep, explorerPosition, targetIsForm, EXPLORER_COLUMNS, EXPLORER_ROWS } from '../src/app/hooks/useExplorer.js';

test('WASD and arrows navigate a shared clamped three-by-four grid', () => {
 assert.equal(EXPLORER_COLUMNS, 4);
 assert.equal(EXPLORER_ROWS, 3);
 assert.deepEqual(regionStep(regionCell(0), 'w'), regionCell(0));
 assert.deepEqual(regionStep(regionCell(0), 'a'), regionCell(0));
 assert.deepEqual(regionStep(regionCell(0), 'd'), regionCell(1));
 assert.deepEqual(regionStep(regionCell(0), 's'), regionCell(4));
 assert.deepEqual(regionStep(regionCell(4), 'ArrowUp'), regionCell(0));
 assert.deepEqual(regionStep(regionCell(1), 'ArrowLeft'), regionCell(0));
 assert.deepEqual(regionStep(regionCell(3), 'ArrowRight'), regionCell(3));
 assert.deepEqual(regionStep(regionCell(11), 'ArrowDown'), regionCell(11));
 assert.deepEqual(regionCell(11), { index: 11, row: 2, column: 3 });
 assert.equal(explorerPosition(0).left, '12.5%');
 assert.equal(explorerPosition(12 - 1).top, '83.33333333333334%');
 assert.throws(() => regionCell(12), RangeError);
});

test('movement does not steal keys from native controls or modifiers', () => {
 const input = { closest: selector => selector.includes('input') ? {} : null, isContentEditable: false };
 const editable = { closest: () => null, isContentEditable: true };
 assert.equal(targetIsForm(input), true);
 assert.equal(targetIsForm(editable), true);
 assert.equal(targetIsForm({ closest: () => null, isContentEditable: false }), false);
 assert.equal(targetIsForm(null), false);
});
