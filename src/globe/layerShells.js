/** Display-only shell layout for the Earth data globe. Pixel edits stay on a canvas copy. */

export const FULL_FIELD_IDS = new Set([
  "carbon_monoxide",
  "nitrogen_oxides",
  "near_surface_temperature",
]);

export const SPARSE_FIELD_IDS = new Set(["precipitation", "active_fires"]);

/** Fractions of width and height. These cover baked-in logos, dates, and legends. */
export const CAPTION_RECTS = {
  active_fires: [{ x: 0, y: 0.83, w: 0.22, h: 0.17 }],
  carbon_monoxide: [
    { x: 0, y: 0, w: 0.19, h: 0.09 },
    { x: 0, y: 0.9, w: 0.28, h: 0.1 },
  ],
  nitrogen_oxides: [
    { x: 0, y: 0, w: 0.19, h: 0.09 },
    { x: 0, y: 0.9, w: 0.28, h: 0.1 },
  ],
  near_surface_temperature: [
    { x: 0, y: 0, w: 0.19, h: 0.09 },
    { x: 0, y: 0.9, w: 0.32, h: 0.1 },
  ],
};

const NO_PEEL = Object.freeze({ start: -10, end: -9 });

export function prepareLayerPixels(pixels, width, height, layerId) {
  const rects = CAPTION_RECTS[layerId] || [];
  for (const rect of rects) {
    const x0 = Math.max(0, Math.floor(rect.x * width));
    const y0 = Math.max(0, Math.floor(rect.y * height));
    const x1 = Math.min(width, Math.ceil((rect.x + rect.w) * width));
    const y1 = Math.min(height, Math.ceil((rect.y + rect.h) * height));
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        pixels[(y * width + x) * 4 + 3] = 0;
      }
    }
  }
  if (SPARSE_FIELD_IDS.has(layerId)) {
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] < 16 && pixels[i + 1] < 16 && pixels[i + 2] < 16) pixels[i + 3] = 0;
    }
  }
  return pixels;
}

function configuredOpacity(settings, layerId, fallback) {
  const value = settings?.[layerId]?.opacity;
  return typeof value === "number" ? value : fallback;
}

/**
 * The selected map hugs the Earth. Other full-color maps open as bands on the
 * right so they stay readable. Rain and fires stay as see-through outer shells.
 */
export function assignShells(layers, { settings = {}, focus = null, onlySelected = false } = {}) {
  const visible = layers.filter((layer) => settings[layer.id]?.visible !== false);
  const shown = onlySelected && focus ? visible.filter((layer) => layer.id === focus) : visible;
  const face = shown.find((layer) => layer.id === focus) || shown[shown.length - 1] || null;
  const others = shown.filter((layer) => layer !== face);
  const fullOthers = others.filter((layer) => FULL_FIELD_IDS.has(layer.id));
  const sparseOthers = others.filter((layer) => !FULL_FIELD_IDS.has(layer.id));
  const shells = [];

  if (face) {
    const sparse = SPARSE_FIELD_IDS.has(face.id);
    const opacity = configuredOpacity(settings, face.id, sparse ? 0.9 : 0.66);
    shells.push({
      id: face.id,
      radius: 1.012,
      opacity: sparse ? opacity : Math.min(0.8, Math.max(opacity, 0.62)),
      peel: NO_PEEL,
      role: "face",
    });
  }

  fullOthers.forEach((layer, index) => {
    const edge = 0.02 + (index / fullOthers.length) * 0.55;
    shells.push({
      id: layer.id,
      radius: 1.04 + index * 0.028,
      opacity: Math.max(configuredOpacity(settings, layer.id, 0.9), 0.82),
      peel: { start: edge, end: edge + 0.46 },
      role: "band",
    });
  });

  const outerBase = 1.05 + fullOthers.length * 0.028;
  sparseOthers.forEach((layer, index) => {
    shells.push({
      id: layer.id,
      radius: outerBase + index * 0.016,
      opacity: configuredOpacity(settings, layer.id, 0.92),
      peel: NO_PEEL,
      role: "sparse",
    });
  });

  return shells;
}
