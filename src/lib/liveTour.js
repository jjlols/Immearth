export const TOUR_DONE_KEY = "immearth-live-tour";
export const TOUR_STEP_KEY = "immearth-live-tour-step";

export const TOUR_STEPS = [
  { target: "#music-player", title: "Play", body: "Press Play remix. Nothing plays until you do." },
  { target: ".head-direction", title: "Camera", body: "Enable camera is optional. Turn or tilt your head to look around. The picture stays on this computer and is not shown." },
  { target: ".head-direction", title: "Spatial sound", body: "After Play remix and Enable camera, turning your head moves the sound. Calibrate front sets the way you are facing as forward." },
  { target: ".map-move", title: "Move", body: "Use North, West, South, and East. The arrow keys and a click on the map do the same thing." },
  { target: ".source-controllers", title: "Maps", body: "Included adds a map. Press its name to choose it. Chosen is written on that map." },
  { target: ".interaction-modes", title: "One or all", body: "All maps plays every included map. One map plays only the chosen map." },
  { target: ".master-volume", title: "Volume", body: "Loudest is 50%. Start over takes the song back to the beginning." },
];

/** Place the tour card beside the control it explains, staying on screen and below the site header. */
export function placeTourCard(target, card, viewport, gap = 14) {
  const margin = 12;
  const topLimit = viewport.topLimit ?? margin;
  const width = card.width;
  const height = card.height;
  const maxLeft = Math.max(margin, viewport.width - width - margin);
  const maxTop = Math.max(topLimit, viewport.height - height - margin);
  const clampLeft = value => Math.max(margin, Math.min(value, maxLeft));
  const clampTop = value => Math.max(topLimit, Math.min(value, maxTop));
  const options = [
    { side: "right", left: target.right + gap, top: target.top + (target.height - height) / 2 },
    { side: "left", left: target.left - gap - width, top: target.top + (target.height - height) / 2 },
    { side: "below", left: target.left + (target.width - width) / 2, top: target.bottom + gap },
    { side: "above", left: target.left + (target.width - width) / 2, top: target.top - gap - height },
  ].map(option => {
    const left = clampLeft(option.left);
    const top = clampTop(option.top);
    const box = { left, top, right: left + width, bottom: top + height };
    const overlapX = Math.max(0, Math.min(box.right, target.right) - Math.max(box.left, target.left));
    const overlapY = Math.max(0, Math.min(box.bottom, target.bottom) - Math.max(box.top, target.top));
    const beside = option.side === "right" ? box.left >= target.right - 1
      : option.side === "left" ? box.right <= target.left + 1
        : option.side === "below" ? box.top >= target.bottom - 1
          : box.bottom <= target.top + 1;
    return {
      side: option.side,
      left,
      top,
      beside,
      overlap: overlapX * overlapY,
      shifted: Math.abs(left - option.left) + Math.abs(top - option.top),
    };
  });
  const score = option => (option.beside && option.overlap === 0 && option.shifted < 1 ? 0 : 1 + option.overlap + option.shifted * 1000);
  const chosen = options.reduce((best, option) => (score(option) < score(best) ? option : best));
  const along = chosen.side === "left" || chosen.side === "right" ? height : width;
  const anchor = chosen.side === "left" || chosen.side === "right"
    ? target.top + target.height / 2 - chosen.top
    : target.left + Math.min(target.width, 180) / 2 - chosen.left;
  return { top: chosen.top, left: chosen.left, side: chosen.side, arrow: Math.max(18, Math.min(along - 18, anchor)) };
}

export function readTour(storage) {
  try {
    if (storage.getItem(TOUR_DONE_KEY) === "done") return { show: false, step: 0 };
    const saved = Number(storage.getItem(TOUR_STEP_KEY));
    const step = Number.isInteger(saved) && saved >= 0 && saved < TOUR_STEPS.length ? saved : 0;
    return { show: true, step };
  } catch {
    return { show: true, step: 0 };
  }
}

export function rememberTourStep(storage, step) {
  try { storage.setItem(TOUR_STEP_KEY, String(step)); } catch { /* the tour still runs this visit */ }
}

export function finishTour(storage) {
  try {
    storage.setItem(TOUR_DONE_KEY, "done");
    storage.removeItem(TOUR_STEP_KEY);
  } catch { /* a blocked store keeps the tour visible, which is the safe result */ }
}
