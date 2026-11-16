import { useEffect, useReducer } from 'react';

export const EXPLORER_COLUMNS = 8;
export const EXPLORER_ROWS = 6;
export const EXPLORER_SIZE = EXPLORER_COLUMNS * EXPLORER_ROWS;

export function regionCell(index) {
  if (!Number.isInteger(index) || index < 0 || index >= EXPLORER_SIZE) {
    throw new RangeError('Palette exploration supports regions 0 through 47.');
  }
  return Object.freeze({ index, row: Math.floor(index / EXPLORER_COLUMNS), column: index % EXPLORER_COLUMNS });
}

export function regionStep(current, key) {
  const start = regionCell(current.index);
  const directions = {
    w: [0, -1], ArrowUp: [0, -1],
    a: [-1, 0], ArrowLeft: [-1, 0],
    s: [0, 1], ArrowDown: [0, 1],
    d: [1, 0], ArrowRight: [1, 0],
  };
  const delta = directions[key];
  if (!delta) return start;
  return regionCell(
    Math.max(0, Math.min(EXPLORER_ROWS - 1, start.row + delta[1])) * EXPLORER_COLUMNS +
    Math.max(0, Math.min(EXPLORER_COLUMNS - 1, start.column + delta[0])),
  );
}

/** The grid cell under a point on the map: column = floor(x/width*8), row = floor(y/height*6), clamped. */
export function regionAtPoint(x, y, width, height) {
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  const column = Math.max(0, Math.min(EXPLORER_COLUMNS - 1, Math.floor((x / width) * EXPLORER_COLUMNS)));
  const row = Math.max(0, Math.min(EXPLORER_ROWS - 1, Math.floor((y / height) * EXPLORER_ROWS)));
  return row * EXPLORER_COLUMNS + column;
}

/** Plain words for screen readers and the hover label: 1-based region, row and column. */
export function regionWords(index) {
  const { row, column } = regionCell(index);
  return `Region ${index + 1} of ${EXPLORER_SIZE}, row ${row + 1} of ${EXPLORER_ROWS}, column ${column + 1} of ${EXPLORER_COLUMNS}`;
}

export function explorerPosition(index) {
  const { row, column } = regionCell(index);
  return { left: `${((column + 0.5) / EXPLORER_COLUMNS) * 100}%`, top: `${((row + 0.5) / EXPLORER_ROWS) * 100}%` };
}

/** Native interactive controls keep their own arrow/Home/Space/Enter behavior. */
export function targetIsForm(target) {
  return Boolean(target && (target.isContentEditable ||
    (typeof target.closest === 'function' && target.closest('input,textarea,select,button,a,[contenteditable="true"],[role="slider"]'))));
}

export function explorerReducer(cell, action) {
  if (action.type === 'move') return regionStep(cell, action.key);
  if (action.type === 'select') return regionCell(action.index);
  return cell;
}

export function useExplorer({ onRegionChange } = {}) {
  const [cell, dispatch] = useReducer(explorerReducer, undefined, () => regionCell(0));
  useEffect(() => { onRegionChange?.(cell.index); }, [cell, onRegionChange]);
  useEffect(() => {
    const onKeyDown = event => {
      if (event.defaultPrevented || event.repeat || event.ctrlKey || event.altKey || event.metaKey || targetIsForm(event.target)) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (key === 'Home') dispatch({ type: 'select', index: 0 });
      else if (['w', 'a', 's', 'd', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(key)) dispatch({ type: 'move', key });
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  return {
    ...cell,
    choose: index => dispatch({ type: 'select', index }),
    /* The same step W A S D and the arrow keys take, for the on-screen arrow buttons. */
    move: key => dispatch({ type: 'move', key }),
    reset: () => dispatch({ type: 'select', index: 0 }),
    rowCount: EXPLORER_ROWS,
    columnCount: EXPLORER_COLUMNS,
  };
}
