import { regionStep } from '../hooks/useExplorer.js';

export const PREVIEW_RETURN_WINDOW_MS = 1500;
export const HEAD_PREVIEW_RETURN_MS = PREVIEW_RETURN_WINDOW_MS;
export const CENTERED_SOURCE_POSITION = Object.freeze({ x: 0, y: 0, z: 0 });
const DIRECTIONS = Object.freeze({ left: 'a', right: 'd', up: 'w', down: 's' });

/** A fixed artistic offset for a preview, not a geographic coordinate. */
export function previewForDirection(index, direction) {
  if (!Object.hasOwn(DIRECTIONS, direction)) throw new RangeError('Invalid head direction.');
  const next = regionStep({ index }, DIRECTIONS[direction]).index;
  return Object.freeze({
    index: next,
    blocked: next === index,
    direction,
    position: Object.freeze({
      x: direction === 'right' ? 2 : direction === 'left' ? -2 : 0,
      y: direction === 'up' ? 2 : direction === 'down' ? -2 : 0,
      z: 0,
    }),
  });
}

/** Transient looks never mutate the committed index. Only prompt recenter can. */
export class PreviewTravelController {
  constructor(index = 0) {
    this.committedIndex = index;
    this.pendingPreview = null;
    this.onCommit = () => {};
  }

  preview(direction, now = performance.now()) {
    // Distinct settled directions are a new preview of the committed region.
    // Repeated events from one held direction never recursively advance it.
    if (this.pendingPreview?.direction === direction) return this.pendingPreview;
    this.pendingPreview = Object.freeze({
      ...previewForDirection(this.committedIndex, direction),
      since: now,
    });
    return this.pendingPreview;
  }

  recenter(now = performance.now()) {
    const target = this.pendingPreview;
    if (!target) return null;
    this.pendingPreview = null;
    if (target.blocked || now < target.since || now - target.since > PREVIEW_RETURN_WINDOW_MS) return null;
    this.committedIndex = target.index;
    this.onCommit(target.index);
    return target.index;
  }

  setCommittedIndex(index) {
    this.committedIndex = index;
    this.pendingPreview = null;
  }

  cancel() {
    this.pendingPreview = null;
  }
}

export default PreviewTravelController;
