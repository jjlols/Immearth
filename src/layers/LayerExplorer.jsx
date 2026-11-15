import { useEffect, useLayoutEffect, useRef, useState } from "react";
import "./LayerExplorer.css";
import overlayCss from "../../overlay/overlay.css?inline";
import SiteChrome from "../SiteChrome.jsx";
import { OverlayController } from "./OverlayController.js";

const LAYERS = [
  { id: "precipitation", label: "Precipitation", shortLabel: "Rain & snow", mark: "P", color: "#48c8f5", description: "Near real-time precipitation from NASA’s Global Precipitation Measurement constellation.", order: 0, opacity: 1, width: 3600, height: 1800 },
  { id: "active_fires", label: "Active fires", shortLabel: "Fire radiative power", mark: "F", color: "#ff875e", description: "Active fires observed by VIIRS. Fire intensity is shown in a moving five-day window.", order: 1, opacity: 1, width: 4096, height: 2048 },
  { id: "carbon_monoxide", label: "Carbon monoxide", shortLabel: "Near-surface CO", mark: "CO", color: "#d5a1ff", description: "Near-surface carbon monoxide estimated by NASA’s GEOS-CF model.", order: 2, opacity: 1, width: 2048, height: 1024 },
  { id: "nitrogen_oxides", label: "Nitrogen oxides", shortLabel: "Near-surface NOx", mark: "NOx", color: "#80e6aa", description: "Nitrogen oxide and nitrogen dioxide concentrations estimated by NASA’s GEOS-CF model.", order: 3, opacity: 1, width: 2048, height: 1024 },
  { id: "near_surface_temperature", label: "Temperature", shortLabel: "Near-surface air", mark: "T", color: "#ffdd73", description: "Near-surface temperature from NASA’s GEOS-FP weather analysis and forecast system.", order: 4, opacity: 1, width: 2048, height: 1024 },
].map((layer) => ({ ...layer, url: `${import.meta.env.BASE_URL}assets/${layer.id}.png`, visible: true }));

function paint(canvas, image) {
  if (!image?.complete || !image.naturalHeight) return;
  const context = canvas.getContext("2d", { alpha: true });
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);
  canvas.dataset.originalColor = "true";
}

export default function LayerExplorer() {
  const controllerRef = useRef(null);
  if (!controllerRef.current) controllerRef.current = new OverlayController({ layers: LAYERS });
  const controller = controllerRef.current;
  const [state, setState] = useState(() => controller.getState());
  const [images, setImages] = useState({});
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [rovingId, setRovingId] = useState(LAYERS[0].id);
  const canvasRefs = useRef({});

  useEffect(() => {
    const onChange = () => setState(controller.getState());
    controller.addEventListener("change", onChange);
    window.eicOverlay = Object.freeze({
      getState: () => controller.getState(),
      select: (id) => controller.select(id),
      setVisibility: (id, visible) => controller.setVisibility(id, visible),
      reset: () => controller.reset(),
    });
    let pending = LAYERS.length;
    LAYERS.forEach((layer) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => {
        setImages((current) => ({ ...current, [layer.id]: image }));
        const canvas = canvasRefs.current[layer.id];
        if (canvas) paint(canvas, image);
        pending -= 1;
        if (pending === 0) setReady(true);
      };
      image.onerror = () => setError(`Unable to decode the ${layer.label} source image.`);
      image.src = layer.url;
    });
    return () => {
      controller.removeEventListener("change", onChange);
      delete window.eicOverlay;
    };
  }, [controller]);

  useLayoutEffect(() => {
    Object.entries(images).forEach(([id, image]) => {
      const canvas = canvasRefs.current[id];
      if (canvas) paint(canvas, image);
    });
  });

  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape" && controller.focusedId) {
        controller.select(null);
        setRovingId(LAYERS[0].id);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [controller, state.focusedId]);

  function moveRoving(event) {
    if (!event.target.matches?.(".layer-select")) return;
    const keys = ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const layers = controller.sortedLayers;
    let next = rovingId;
    if (event.key === "Home") next = layers[0].id;
    else if (event.key === "End") next = layers.at(-1).id;
    else {
      const index = layers.findIndex((layer) => layer.id === rovingId);
      const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
      next = layers[(index + step + layers.length) % layers.length].id;
    }
    setRovingId(next);
    document.querySelector(`[data-layer-select="${next}"]`)?.focus();
  }

  const focused = state.focusedId ? controller.layers.get(state.focusedId) : null;
  const detail = focused
    ? { kicker: focused.label.toUpperCase(), text: focused.description, mode: `Focus / ${focused.label}` }
    : controller.visibleLayers.length
      ? { kicker: "THE SHARED CANVAS", text: "Every metric remains distinct. Choose a layer to bring it into focus, or use the visibility switches to explore your own composition.", mode: `${controller.visibleLayers.length} of ${controller.layers.size} layers in view` }
      : { kicker: "THE CANVAS IS CLEAR", text: "All visualization layers are hidden. Switch a metric back on or reset the composition to continue.", mode: "No visualization layers visible" };

  return (
    <>
      <style>{overlayCss}</style>
      <a className="skip-link" href="#layer-controls">Skip to layer controls</a>
      <SiteChrome current="layers" part="header" />
      <main className="layer-studio">
        <section className="intro" aria-labelledby="page-title">
          <div>
            <p className="eyebrow">Earth Information Center</p>
            <h1 id="page-title">Earth, layered</h1>
          </div>
          <p className="intro-description">Five NASA maps on one canvas. Choose a layer to bring it forward. This view is for exploration. The maps are not lined up as a scientific measurement.</p>
        </section>
        {error && <div className="error" role="alert">{error}</div>}
        <div className="studio-layout">
          <section className="canvas-panel" aria-labelledby="canvas-title">
            <div className="canvas-topline">
              <div><span className="small-label">COMPOSITE 001</span><h2 id="canvas-title">Global perspectives</h2></div>
              <button type="button" className="text-button" hidden={state.focusedId === null} onClick={() => controller.select(null)}>Show all layers <span aria-hidden="true">↗</span></button>
            </div>
            <div className="canvas-frame">
              <div id="map-canvas" className={`map-canvas${state.basemapVisible ? "" : " no-base"}`} role="img" aria-label="A composed view of NASA Earth visualization layers. Use the adjacent controls to select an individual metric.">
                <div className="map-blueprint" aria-hidden="true" />
                <div className="map-layers">
                  {state.layers.filter((layer) => layer.visible).map((layer) => (
                    <canvas
                      key={layer.id}
                      ref={(node) => { canvasRefs.current[layer.id] = node; }}
                      className={`map-layer${layer.id === state.focusedId ? " is-selected" : ""}${state.focusedId && layer.id !== state.focusedId ? " is-muted" : ""}`}
                      data-layer-id={layer.id}
                      aria-hidden="true"
                      width={layer.width}
                      height={layer.height}
                      style={{ "--layer-color": layer.color, "--layer-opacity": layer.opacity, zIndex: layer.id === state.focusedId ? 20 : layer.order }}
                    />
                  ))}
                </div>
                <div className="map-grid" aria-hidden="true" />
                <div className="coordinates coordinates-top" aria-hidden="true"><span>180° W</span><span>0°</span><span>180° E</span></div>
                <div className="coordinates coordinates-bottom" aria-hidden="true"><span>EXPLORATORY COMPOSITE</span><span>GEOREFERENCING NOT VERIFIED</span></div>
                <div className={`canvas-loading${ready ? " is-ready" : ""}`}><span className="loading-ring" aria-hidden="true" /><p>Composing planetary perspectives</p></div>
              </div>
              <div className="canvas-footer"><span><span className="square-color" aria-hidden="true" /><span>{detail.mode}</span></span><span>ORIGINAL SOURCE COLORS</span></div>
            </div>
            <div className="layer-detail" style={focused ? { "--layer-color": focused.color } : undefined} aria-live="polite" aria-atomic="true">
              <p className="detail-kicker">{detail.kicker}</p>
              <p className="detail-description">{detail.text}</p>
            </div>
            <p className="map-disclaimer"><span aria-hidden="true">ⓘ</span> Source maps vary in extent and annotation. Tints provide visual differentiation, not shared scientific units. For exploration, not quantitative comparison.</p>
          </section>
          <aside className="controls-panel" id="layer-controls" aria-labelledby="controls-heading" tabIndex={-1}>
            <div className="controls-heading"><div><p className="eyebrow">COMPOSITION</p><h2 id="controls-heading">The metrics</h2></div><span className="metric-count">05</span></div>
            <p className="controls-description">Select a metric to make it stand out.<br />Switch layers off to shape the composition.</p>
            <div className="layer-list" role="group" aria-label="Visualization layers" onKeyDown={moveRoving}>
              {state.layers.map((layer) => (
                <div className={`layer-item${layer.visible ? "" : " is-off"}`} key={layer.id} data-layer-id={layer.id} style={{ "--layer-color": layer.color }} aria-current={layer.id === state.focusedId}>
                  <button
                    type="button"
                    className="layer-select"
                    data-layer-select={layer.id}
                    aria-pressed={layer.id === state.focusedId}
                    aria-label={`Focus ${layer.label}`}
                    title={`Click to focus ${layer.label}; click again to return to the full composition`}
                    tabIndex={rovingId === layer.id ? 0 : -1}
                    onClick={() => {
                      controller.select(controller.focusedId === layer.id ? null : layer.id);
                      setRovingId(layer.id);
                    }}
                  >
                    <span className="layer-mark" aria-hidden="true">{layer.mark}</span>
                    <span className="layer-text"><span className="layer-label">{layer.label}</span><span className="layer-subtitle">{layer.shortLabel}</span></span>
                    <span className="layer-arrow" aria-hidden="true">↗</span>
                  </button>
                  <div className="layer-options">
                    <span className="layer-color-dot" aria-hidden="true" />
                    <label className="switch">
                      <input type="checkbox" checked={layer.visible} aria-label={`Show ${layer.label}`} onChange={(event) => controller.setVisibility(layer.id, event.target.checked)} />
                      <span className="switch-track" aria-hidden="true" />
                    </label>
                  </div>
                </div>
              ))}
            </div>
            <div className="controls-bottom">
              <div className="control-row"><span>Background visibility</span><label className="switch"><input type="checkbox" checked={state.basemapVisible} onChange={(event) => controller.setBasemapVisible(event.target.checked)} /><span className="switch-track" aria-hidden="true" /><span className="sr-only">Show subdued basemap</span></label></div>
              <button className="reset-button" type="button" onClick={() => { controller.reset(); setRovingId(LAYERS[0].id); }}><span aria-hidden="true">↻</span> Reset composition</button>
              <p className="keyboard-hint"><kbd>↑</kbd><kbd>↓</kbd> Navigate <span>·</span> <kbd>Enter</kbd> Focus <span>·</span> <kbd>Esc</kbd> Clear</p>
            </div>
          </aside>
        </div>
      </main>
      <SiteChrome current="layers" part="footer" />
    </>
  );
}
