import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CENTERED_SOURCE_POSITION,
  PreviewTravelController,
} from '../lib/headPreviewController.js';

/**
 * Head looks select only temporary musical features. useExplorer remains the
 * sole owner of the map marker and has the final say on its committed index.
 */
export default function useHeadPreviewTravel({ index, choose, enabled = false }) {
  const controllerRef = useRef(null);
  const chooseRef = useRef(choose);
  chooseRef.current = choose;
  if (!controllerRef.current) {
    controllerRef.current = new PreviewTravelController(index);
    controllerRef.current.onCommit = next => chooseRef.current(next);
  }
  const controller = controllerRef.current;
  const [preview, setPreview] = useState(null);

  // A keyboard/grid commit cancels an old look; it must not be reinterpreted
  // relative to the region that the user just selected.
  useEffect(() => {
    controller.setCommittedIndex(index);
    setPreview(null);
  }, [controller, index]);

  const clear = useCallback(() => {
    controller.cancel();
    setPreview(null);
  }, [controller]);

  useEffect(() => {
    if (!enabled) clear();
  }, [enabled, clear]);

  const onDirectionChange = useCallback(event => {
    if (!enabled) return;
    const direction = event?.direction;
    if (direction === 'forward' || direction === 'center' || direction === 'neutral') {
      controller.recenter(event.now ?? performance.now());
    } else if (['left', 'right', 'up', 'down'].includes(direction)) {
      controller.preview(direction, event.now ?? performance.now());
    } else {
      // stop, uncertain, calibration loss, and disabled opt-in are cancellation,
      // not a commit and never another input direction.
      controller.cancel();
    }
    setPreview(controller.pendingPreview ? { ...controller.pendingPreview } : null);
  }, [controller, enabled]);

  return {
    regionIndex: preview ? preview.index : index,
    position: preview ? preview.position : CENTERED_SOURCE_POSITION,
    previewing: enabled && preview !== null,
    previewBlocked: preview?.blocked ?? false,
    direction: preview?.direction ?? null,
    onDirectionChange,
    cancel: clear,
  };
}

export { PREVIEW_RETURN_WINDOW_MS, PreviewTravelController, previewForDirection } from '../lib/headPreviewController.js';
