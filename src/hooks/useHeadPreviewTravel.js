import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CENTERED_SOURCE_POSITION,
  PreviewTravelController,
} from '../lib/headPreviewController.js';
import { headLog } from '../lib/headLog.js';

/**
 * Head looks select only temporary musical features. useExplorer remains the
 * sole owner of the map marker and has the final say on its committed index.
 * Every travel decision and committed region goes to the head log.
 */
export default function useHeadPreviewTravel({ index, choose, enabled = false, travelOnRecenter = false, engineRef }) {
  const controllerRef = useRef(null);
  const chooseRef = useRef(choose);
  chooseRef.current = choose;
  // The region a head return just chose, so the log can tell it from a keyboard or map move.
  const headMoveRef = useRef(null);
  if (!controllerRef.current) {
    controllerRef.current = new PreviewTravelController(index);
    controllerRef.current.onCommit = next => {
      headMoveRef.current = next;
      chooseRef.current(next);
    };
  }
  const controller = controllerRef.current;
  const [preview, setPreview] = useState(null);

  // A keyboard/grid commit cancels an old look; it must not be reinterpreted
  // relative to the region that the user just selected.
  const clear = useCallback(() => {
    controller.cancel();
    engineRef?.current?.spatial?.setSourcePosition(CENTERED_SOURCE_POSITION);
    setPreview(null);
  }, [controller, engineRef]);

  useEffect(() => {
    headLog.record('region', { index, cause: headMoveRef.current === index ? 'head' : 'other' });
    headMoveRef.current = null;
    if (controller.pendingPreview) clear();
    controller.setCommittedIndex(index);
    setPreview(null);
  }, [controller, index, clear]);

  useEffect(() => {
    headLog.record('session', { action: 'travel', enabled });
    clear();
  }, [enabled, travelOnRecenter, clear]);

  const onDirectionChange = useCallback(event => {
    if (!enabled) return;
    const now = event?.now ?? performance.now();
    const source = event?.source ?? 'head';
    if (!source) return;
    let decision = { action: 'none' };
    if (['forward', 'center', 'neutral'].includes(event.direction) && !travelOnRecenter) {
      controller.cancel();
    } else {
      decision = controller.onDirection({ direction: event.direction, now, source });
    }
    if (decision.action !== 'none') headLog.record('travel', { t: now, source, ...decision });
    const pending = controller.pendingPreview;
    engineRef?.current?.spatial?.setSourcePosition(pending?.position ?? CENTERED_SOURCE_POSITION);
    // Only an accepted directional pose moves audio; returning to a centered pose does not imply a commit.
    setPreview(pending ? { ...pending } : null);
  }, [controller, enabled, travelOnRecenter, engineRef]);

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
