export class OverlayController extends EventTarget {
  constructor(manifest) {
    super();
    this.layers = new Map(manifest.layers.map((layer) => [layer.id, { ...layer, visible: layer.visible !== false }]));
    this.focusedId = null;
    this.basemapVisible = true;
  }

  notify(type) {
    this.dispatchEvent(new CustomEvent("change", { detail: { type, state: this.getState() } }));
  }

  get sortedLayers() {
    return [...this.layers.values()].sort((a, b) => a.order - b.order);
  }

  get visibleLayers() {
    return this.sortedLayers.filter((layer) => layer.visible);
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
    this.notify("focus");
    return this.getState();
  }

  setVisibility(id, visible) {
    const layer = this.layers.get(id);
    if (!layer) throw new Error(`Unknown layer: ${id}`);
    layer.visible = Boolean(visible);
    if (!layer.visible && this.focusedId === id) this.focusedId = null;
    this.notify("visibility");
    return this.getState();
  }

  setBasemapVisible(visible) {
    this.basemapVisible = Boolean(visible);
    this.notify("basemap");
  }

  reset() {
    for (const layer of this.layers.values()) layer.visible = true;
    this.focusedId = null;
    this.basemapVisible = true;
    this.notify("reset");
  }
}
