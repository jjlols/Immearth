import { useEffect, useMemo, useState } from "react";
import LayerGlobe from "../components/LayerGlobe.jsx";
import { OPACITY_DEFAULTS } from "../layerOptions.js";
import { linkTo } from "../navigation.js";
import { MAPS } from "./maps.js";

const LAYERS = MAPS.map((map) => ({ id: map.fieldId, label: map.label }));

function mapById(fieldId) {
  return MAPS.find((map) => map.fieldId === fieldId) || MAPS[0];
}

export default function EarthDataGlobe({ focus, onFocus, detailsFor, onDetails }) {
  const [showGeography, setShowGeography] = useState(true);
  const selected = mapById(focus);
  const open = detailsFor === selected.fieldId;
  const panelId = `globe-about-${selected.fieldId}`;
  const buttonId = `globe-about-button-${selected.fieldId}`;
  const settings = useMemo(() => Object.fromEntries(MAPS.map((map) => [map.fieldId, {
    visible: map.fieldId === selected.fieldId,
    opacity: OPACITY_DEFAULTS[map.fieldId],
  }])), [selected.fieldId]);

  useEffect(() => {
    if (!detailsFor) return;
    document.getElementById(`globe-about-button-${detailsFor}`)?.focus();
  }, [detailsFor]);

  return (
    <section className="data-stage" id="data-globe" aria-labelledby="data-title">
      <div className="data-stage-head">
        <p className="eyebrow">Earth data</p>
        <h1 id="data-title" tabIndex={-1}>The five maps</h1>
      </div>
      <div className="data-stage-layout">
        <LayerGlobe layers={LAYERS} settings={settings} focus={selected.fieldId} onlySelected showGeography={showGeography} />
        <aside className="layer-panel" aria-label="Layers">
          <p className="layer-kicker">Layers</p>
          <label className="layer-field" htmlFor="layer-show">Show</label>
          <select id="layer-show" aria-describedby="layer-now" value={selected.fieldId} onChange={(event) => onFocus(event.target.value)}>
            {MAPS.map((map) => <option key={map.fieldId} value={map.fieldId}>{map.label}</option>)}
          </select>
          <p id="layer-now" className="layer-now" aria-live="polite">{selected.label}. {selected.text} {showGeography ? "Land and coasts are on." : "Land and coasts are off."}</p>
          <div className="layer-actions">
            <button
              id={buttonId}
              type="button"
              className="layer-about"
              aria-expanded={open}
              aria-controls={panelId}
              aria-label={`About ${selected.label}`}
              onClick={() => onDetails(open ? null : selected.fieldId)}
            >
              About
            </button>
            <label className="layer-land">
              <input type="checkbox" checked={showGeography} onChange={(event) => setShowGeography(event.target.checked)} />
              <span>Land and coasts</span>
            </label>
          </div>
          <details className="layer-help">
            <summary>Help</summary>
            <p>The sentence above is the same information as the picture. The picture is optional.</p>
            <p>Tab reaches Show, About, Land and coasts, Help, and Turn left and Turn right. On Show, Up and Down change the map. Enter opens About, which includes the NASA page and says when that link opens in a new tab. Dragging the globe is optional.</p>
            <p><a {...linkTo("access")}>Accessibility and help</a></p>
          </details>
          <div id={panelId} role="region" aria-labelledby={buttonId} hidden={!open} className="data-globe-about">
            <p>{selected.text}</p>
            <p>{selected.planned}</p>
            <p>{selected.source}</p>
            <p><a href={selected.href} target="_blank" rel="noreferrer">{selected.sourceLabel} <span className="visually-hidden">(opens in a new tab)</span></a></p>
          </div>
        </aside>
      </div>
    </section>
  );
}
