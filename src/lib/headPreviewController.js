import { regionStep } from '../hooks/useExplorer.js';

export const PREVIEW_RETURN_WINDOW_MS = 1500;
export const HEAD_PREVIEW_RETURN_MS = PREVIEW_RETURN_WINDOW_MS;
export const CENTERED_SOURCE_POSITION = Object.freeze({ x: 0, y: 0, z: 0 });
const DIRECTIONS = Object.freeze({ left: 'a', right: 'd', up: 'w', down: 's' });
const LOOKS = Object.freeze(['left', 'right', 'up', 'down']);
const FRONT = Object.freeze(['forward', 'center', 'neutral']);
const RETURN_SOURCES = Object.freeze(['head']);

/** A fixed artistic offset for a preview, not a geographic coordinate. */
export function previewForDirection(index, direction) {
  if (!Object.hasOwn(DIRECTIONS, direction)) throw new RangeError('Invalid head direction.');
  const next = regionStep({ index }, DIRECTIONS[direction]).index;
  return Object.freeze({
    index: next, blocked: next === index, direction,
    position: Object.freeze({ x: direction === 'right' ? 2 : direction === 'left' ? -2 : 0,
      y: direction === 'up' ? 2 : direction === 'down' ? -2 : 0, z: 0 }),
  });
}

/** Transient looks never mutate the committed index without an adherent head return. */
export class PreviewTravelController {
  constructor(index = 0) {
    this.committedIndex = index;
    this.pendingPreview = null;
    this.onCommit = () => {};
  }
  preview(direction, now = performance.now()) {
    if (this.pendingPreview?.direction === direction) return this.pendingPreview;
    this.pendingPreview = Object.freeze({ ...previewForDirection(this.committedIndex, direction), since: now });
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
  setCommittedIndex(index) { this.committedIndex = index; this.pendingPreview = null; }
  cancel() { this.pendingPreview = null; }

  /** Report the shared state transition for optional travel recording/replay. */
  onDirection({ direction, now = performance.now(), source = 'head' } = {}) {
    const pending = this.pendingPreview;
    if (FRONT.includes(direction) && RETURN_SOURCES.includes(source)) {
      if (!pending) return { action: 'none' };
      const moved = this.recenter(now);
      return { action: moved !== null ? 'move' : pending.blocked ? 'edge' : 'late',
        direction: pending.direction, to: pending.index, elapsedMs: now - pending.since };
    }
    if (LOOKS.includes(direction)) {
      if (pending?.direction === direction) return { action: 'none' };
      const next = this.preview(direction, now);
      return { action: 'preview', direction, from: this.committedIndex, to: next.index, blocked: next.blocked };
    }
    this.cancel();
    return pending ? { action: 'cancel', direction: pending.direction, to: pending.index, reason: `${direction}/${source}` } : { action: 'none' };
  }
}
export default PreviewTravelController;
