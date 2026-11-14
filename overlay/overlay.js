/**
 * Dependency-free presentation for independently addressable NASA layers.
 * @typedef {{ id:string, label:string, source:string, url:string, color:string, opacity:number, visible:boolean, order:number }} Layer
 */
export class OverlayController extends EventTarget {
  /** @param {{layers: Layer[]}} manifest */
  constructor(manifest) {
    super();
    this.layers = new Map(manifest.layers.map(layer => [layer.id, { ...layer }]));
    this.focusedId = null;
    this.basemapVisible = true;
  }

  notify(type) {
    this.dispatchEvent(new CustomEvent('change', { detail: { type, state: this.getState() } }));
  }

  get sortedLayers() {
    return [...this.layers.values()].sort((a, b) => a.order - b.order);
  }

  get visibleLayers() {
    return this.sortedLayers.filter(layer => layer.visible);
  }

  getState() {
    return { focusedId: this.focusedId, basemapVisible: this.basemapVisible, layers: this.sortedLayers };
  }

  select(id) {
    if (id !== null) {
      const layer = this.layers.get(id);
      if (!layer) throw new Error(`Unknown layer: ${id}`);
      layer.visible = true;
    }
    this.focusedId = id;
    this.notify('focus');
    return this.getState();
  }

  setVisibility(id, visible) {
    const layer = this.layers.get(id);
    if (!layer) throw new Error(`Unknown layer: ${id}`);
    layer.visible = Boolean(visible);
    if (!layer.visible && this.focusedId === id) this.focusedId = null;
    this.notify('visibility');
    return this.getState();
  }

  setBasemapVisible(visible) {
    this.basemapVisible = Boolean(visible);
    this.notify('basemap');
  }

  reset() {
    for (const layer of this.layers.values()) layer.visible = true;
    this.focusedId = null;
    this.basemapVisible = true;
    this.notify('reset');
  }
}

const $ = selector => document.querySelector(selector);
let controller;
const elements = new Map();
let activeId = null;
let rovingId = null;

function textElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function drawTint(layer) {
  const item = elements.get(layer.id);
  const ctx = item.ctx;
  if (!item.image?.complete || !item.image.naturalHeight) return;
  const { width, height } = item.image;
  item.canvas.width = width;
  item.canvas.height = height;
  const tint = layer.color.match(/[a-f\d]{2}/gi).map(value => Number.parseInt(value, 16));
  ctx.drawImage(item.image, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const red = pixels.data[i], green = pixels.data[i + 1], blue = pixels.data[i + 2];
    const max = Math.max(red, green, blue), min = Math.min(red, green, blue);
    const saturation = max - min;
    const luminance = .2126 * red + .7152 * green + .0722 * blue;
    // Luminance-preserving tint with alpha from source energy. Avoid bleaching
    // colors through multiply-then-screen or full-canvas screen blending.
    const tone = Math.min(205, 14 + max * .53 + saturation * .25) / 255;
    pixels.data[i] = Math.round(tint[0] * tone);
    pixels.data[i + 1] = Math.round(tint[1] * tone);
    pixels.data[i + 2] = Math.round(tint[2] * tone);
    const alpha = luminance < 8 ? 0 : 20 + Math.min(185, saturation * 1.45 + max * .3);
    pixels.data[i + 3] = Math.round(alpha * (pixels.data[i + 3] / 255));
  }
  ctx.putImageData(pixels, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  item.canvas.dataset.tint = layer.color;
}

function renderModel() {
  const state = controller.getState();
  for (const layer of state.layers) {
    const item = elements.get(layer.id);
    item.canvas.classList.toggle('is-hidden', !layer.visible);
    item.canvas.classList.toggle('is-selected', layer.id === state.focusedId);
    item.canvas.classList.toggle('is-muted', Boolean(state.focusedId) && layer.id !== state.focusedId);
    item.row.setAttribute('aria-current', String(layer.id === state.focusedId));
    item.row.classList.toggle('is-off', !layer.visible);
    item.button.setAttribute('aria-pressed', String(layer.id === state.focusedId));
    item.canvas.style.zIndex = String(state.focusedId ? 30 + layer.order : layer.order);
    item.visibility.checked = layer.visible;
  }
  $('#map-canvas').classList.toggle('no-base', !state.basemapVisible);
  $('#base-toggle').checked = state.basemapVisible;
  $('#reset-focus').hidden = state.focusedId === null;
  if (state.focusedId) {
    const selected = controller.layers.get(state.focusedId);
    $('#mode-label').textContent = `Focus / ${selected.label}`;
    $('#layer-detail').style.setProperty('--layer-color', selected.color);
    $('#layer-detail .detail-kicker').textContent = selected.label.toUpperCase();
    $('#layer-detail .detail-description').textContent = selected.description;
  } else if (!controller.visibleLayers.length) {
    $('#mode-label').textContent = 'No visualization layers visible';
    $('#layer-detail .detail-kicker').textContent = 'THE CANVAS IS CLEAR';
    $('#layer-detail .detail-description').textContent = 'All visualization layers are hidden. Switch a metric back on or reset the composition to continue.';
  } else {
    $('#mode-label').textContent = `${controller.visibleLayers.length} of ${controller.layers.size} layers in view`;
    $('#layer-detail').style.removeProperty('--layer-color');
    $('#layer-detail .detail-kicker').textContent = 'THE SHARED CANVAS';
    $('#layer-detail .detail-description').textContent = 'Every metric remains distinct. Choose a layer to bring it into focus, or use the visibility switches to explore your own composition.';
  }
}

function createLayerUI(layer) {
  const row = document.createElement('div');
  row.className = 'layer-item';
  row.style.setProperty('--layer-color', layer.color);
  row.setAttribute('aria-current', 'false');

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'layer-select';
  button.setAttribute('aria-pressed', 'false');
  button.setAttribute('aria-label', `Focus ${layer.label}`);
  button.title = `Click to focus ${layer.label}; click again to return to the full composition`;
  button.tabIndex = -1;
  const mark = textElement('span', 'layer-mark', layer.mark);
  mark.setAttribute('aria-hidden', 'true');
  const labelGroup = document.createElement('span');
  labelGroup.className = 'layer-text';
  labelGroup.append(textElement('span', 'layer-label', layer.label), textElement('span', 'layer-subtitle', layer.shortLabel));
  const arrow = textElement('span', 'layer-arrow', '↗');
  arrow.setAttribute('aria-hidden', 'true');
  button.append(mark, labelGroup, arrow);
  button.addEventListener('click', () => {
    controller.select(controller.focusedId === layer.id ? null : layer.id);
    rovingId = layer.id;
    updateRovingFocus();
  });
  row.append(button);

  const options = document.createElement('div');
  options.className = 'layer-options';
  const swatch = document.createElement('span');
  swatch.className = 'layer-color-dot';
  swatch.setAttribute('aria-hidden', 'true');
  const switchLabel = document.createElement('label');
  switchLabel.className = 'switch';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = layer.visible;
  checkbox.setAttribute('aria-label', `Show ${layer.label}`);
  const track = document.createElement('span');
  track.className = 'switch-track';
  track.setAttribute('aria-hidden', 'true');
  switchLabel.append(checkbox, track);
  options.append(swatch, switchLabel);
  row.append(options);
  $('#layer-list').append(row);
  elements.set(layer.id, { row, button, visibility: checkbox, canvas: null, image: null, ctx: null });

  // A native canvas per metric enables tints and separate visibility/focus states.
  const canvas = document.createElement('canvas');
  canvas.className = 'map-layer';
  canvas.style.setProperty('--layer-color', layer.color);
  canvas.style.setProperty('--layer-opacity', String(layer.opacity));
  canvas.style.zIndex = String(layer.order);
  canvas.setAttribute('aria-hidden', 'true');
  canvas.width = layer.width;
  canvas.height = layer.height;
  $('#map-layers').append(canvas);
  const item = elements.get(layer.id);
  item.canvas = canvas;
  item.ctx = canvas.getContext('2d', { alpha: true });
}

function loadLayer(layer) {
  const item = elements.get(layer.id);
  const image = new Image();
  const source = layer.url;
  image.decoding = 'async';
  item.ready = new Promise((resolve, reject) => {
  image.onload = () => { item.image = image; drawTint(layer); resolve(image); };
  image.onerror = () => {
    $('#loading').hidden = true;
    $('#error').hidden = false;
    $('#error').textContent = `Unable to decode the ${layer.label} source image. Rebuild the overlay assets and retry.`;
    reject(new Error(`Unable to decode ${layer.label}. Verify the generated image is available and retry.`));
  };
  });
  item.image = image;
  image.src = source;
}

function renderSite(manifest) {
  elements.clear();
  $('#map-layers').replaceChildren();
  $('#layer-list').replaceChildren();
  controller = new OverlayController(manifest);
  for (const layer of controller.sortedLayers) { createLayerUI(layer); loadLayer(layer); }
  activeId = controller.sortedLayers[0].id;
  rovingId = activeId;
  updateRovingFocus();
  controller.addEventListener('change', renderModel);
  renderModel();
  Promise.all(controller.sortedLayers.map(layer => elements.get(layer.id).ready)).then(() => {
    $('#loading').classList.add('is-ready');
    document.body.dataset.ready = 'true';
    $('#error').hidden = true;
  });
  // Debugging/integration entrypoint is intentionally public and read-only by convention.
  window.eicOverlay = Object.freeze({ getState: () => controller.getState(), select: id => controller.select(id), setVisibility: (id, visible) => controller.setVisibility(id, visible), reset: () => controller.reset() });
}

function updateRovingFocus() {
  for (const [id, item] of elements) item.button.tabIndex = id === rovingId ? 0 : -1;
}

function focusRelative(step) {
  const layers = controller.sortedLayers;
  const index = layers.findIndex(layer => layer.id === rovingId);
  rovingId = layers[(index + step + layers.length) % layers.length].id;
  updateRovingFocus();
  elements.get(rovingId).button.focus();
}

$('#layer-list').addEventListener('keydown', event => {
  // Handle roving focus without intercepting Space, Enter, typing, or input controls.
  if (event.target.matches('.layer-select') && ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    if (event.key === 'Home' || event.key === 'End') {
      rovingId = event.key === 'Home' ? controller.sortedLayers[0].id : controller.sortedLayers.at(-1).id;
      updateRovingFocus();
      elements.get(rovingId).button.focus();
    } else focusRelative(['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1);
  }
});
$('#reset-focus').addEventListener('click', () => { controller.select(null); rovingId = activeId; updateRovingFocus(); });
$('#reset-all').addEventListener('click', () => { controller.reset(); rovingId = activeId; updateRovingFocus(); });
$('#base-toggle').addEventListener('change', event => controller.setBasemapVisible(event.target.checked));
$('#layer-list').addEventListener('change', event => {
  if (event.target.type === 'checkbox') {
    const layer = [...elements.values()].find(item => item.visibility === event.target);
    if (layer) {
      const id = [...elements.entries()].find(([, item]) => item === layer)[0];
      controller.setVisibility(id, event.target.checked);
    }
  }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && controller?.focusedId) { controller.select(null); rovingId = activeId; updateRovingFocus(); }
});

/** Pull the exact URL announced by the HTML rather than copying repository paths. */
async function loadManifest() {
  const response = await fetch('layers.json');
  if (!response.ok) throw new Error(`Unable to load layer catalog (${response.status}). Serve the generated overlay-site directory through HTTP.`);
  const manifest = await response.json();
  const ids = new Set();
  for (const layer of manifest.layers) {
    if (!layer.id || ids.has(layer.id)) throw new Error('Layer IDs must be unique.');
    if (!layer.url) throw new Error(`Missing layer image URL: ${layer.id}`);
    const imageUrl = new URL(layer.url, document.baseURI);
    if (imageUrl.origin !== window.location.origin) throw new Error(`Cross-origin layer asset rejected: ${layer.id}`);
    ids.add(layer.id);
  }
  renderSite(manifest);
  // Reject if one image is missing; loading then falls back to a clear error.
  return Promise.all(controller.sortedLayers.map(layer => elements.get(layer.id).ready)).then(() => manifest);
}
loadManifest().catch(error => {
  $('#loading').hidden = true;
  $('#error').hidden = false;
  $('#error').textContent = `The overlay could not be loaded. ${error.message}`;
});
