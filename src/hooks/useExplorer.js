import { useEffect, useReducer } from 'react';

export const EXPLORER_COLUMNS = 4;
export const EXPLORER_ROWS = 3;
export const EXPLORER_SIZE = EXPLORER_COLUMNS * EXPLORER_ROWS;

export function regionCell(index) {
  if (!Number.isInteger(index) || index < 0 || index >= EXPLORER_SIZE) {
    throw new RangeError('Palette exploration supports regions 0 through 11.');
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
    reset: () => dispatch({ type: 'select', index: 0 }),
    rowCount: EXPLORER_ROWS,
    columnCount: EXPLORER_COLUMNS,
  };
}
