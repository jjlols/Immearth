import { useState } from "react";
import SiteChrome from "../SiteChrome.jsx";
import SpaceWash, { SPACE_PHOTOS } from "../SpaceWash.jsx";
import { linkTo } from "../navigation.js";
import { IconArrow } from "../Icons.jsx";
import { MAPS, filterMaps } from "./maps.js";

export default function DataPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const shownMaps = filterMaps(query);

  function announce(message) {
    setStatus("");
    window.setTimeout(() => setStatus(message), 30);
  }

  return (
    <div className="site-page">
      <a className="skip-link" href="#data-title">Skip to content</a>
      <SiteChrome current="data" part="header" />
      <div className="visually-hidden" role="status">{status}</div>
      <main id="main">
        <section className="page-banner" aria-labelledby="data-title">
          <SpaceWash photo={SPACE_PHOTOS.night} />
          <div className="page-banner-inner">
            <p className="eyebrow">Earth data</p>
            <h1 id="data-title" tabIndex={-1}>The five maps</h1>
            <p className="lede">What each NASA map shows, where it comes from, and how its estimated values change the music on the Live Map.</p>
          </div>
        </section>

        <section className="band" id="maps" aria-labelledby="maps-title">
          <div className="section-head-row">
            <div className="section-head">
              <h2 id="maps-title" tabIndex={-1}>Map by map</h2>
              <p>Values are estimated from NASA’s published color bars, not read from calibrated data. Pixels that do not match a palette color stay silent rather than being given an invented value.</p>
              <form className="search" role="search" onSubmit={(event) => {
                event.preventDefault();
                const first = shownMaps[0];
                if (first) document.getElementById(first.id)?.querySelector("h3")?.focus();
                else document.getElementById("map-empty")?.focus();
              }}>
                <label htmlFor="map-search">Search the maps</label>
                <input id="map-search" type="search" name="q" placeholder="For example: rain, fires, heat" enterKeyHint="search" autoComplete="off" value={query} onChange={(event) => {
                  const value = event.target.value;
                  setQuery(value);
                  const count = filterMaps(value).length;
                  announce(count === 0 ? `No maps match ${value.trim()}.` : `Showing ${count} of ${MAPS.length} maps.`);
                }} />
              </form>
            </div>
            <a className="section-link" {...linkTo("music")}>Open the Live Map <IconArrow /></a>
          </div>
          <p id="map-empty" className="empty" hidden={shownMaps.length !== 0} tabIndex={-1}>No maps match that search. Clear the search box to see all five.</p>
          <div className="map-grid five" id="map-list">
            {MAPS.map((map) => (
              <article className="map-card" id={map.id} key={map.id} hidden={!shownMaps.includes(map)}>
                <figure>
                  <img src={map.src} width={map.width} height={map.height} alt={map.alt} loading="lazy" />
                </figure>
                <div className="card-body">
                  <h3 tabIndex={-1}>{map.title}</h3>
                  <p className="card-text">{map.text}</p>
                  <p className="remix"><span className="tag">In the music</span>{map.planned}</p>
                  <p className="source">{map.source} <a href={map.href} target="_blank" rel="noreferrer">{map.sourceLabel} <span className="visually-hidden">(opens in a new tab)</span></a></p>
                  <p className="card-links"><a {...linkTo("music")}>Hear {map.label.toLowerCase()} on the Live Map</a></p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="band band-tint" id="method" aria-labelledby="method-title">
          <div className="section-head">
            <p className="eyebrow">How the numbers are made</p>
            <h2 id="method-title" tabIndex={-1}>Estimates, not measurements</h2>
            <p>The music is an educational listening aid. It is not a weather service, a health warning, or a calibrated reading of the data.</p>
          </div>
          <div className="split">
            <div className="tile">
              <h3>From picture to value</h3>
              <p>Each map is a published NASA image. The site compares the colors in each of 48 regions to the map’s own legend and keeps only confident matches. Brightness, latitude, and longitude are never used as a quantity.</p>
              <p>Precipitation keeps liquid and frozen palettes separate. Fires use estimated fire radiative power in megawatts, not a count of fires. Carbon monoxide uses uneven steps in parts per billion. Nitrogen oxides are ranked on a logarithmic scale. Temperature runs from −40 to +40 °C.</p>
            </div>
            <div className="tile">
              <h3>From value to sound</h3>
              <p>There is one recording, “Deliberate Thought” by Kevin MacLeod, and one shared clock. Temperature changes its playback speed. Carbon monoxide raises a low-frequency layer. Nitrogen oxides open a filter. Rain, snow, and fires add gentle filtered swells and accents.</p>
              <p>No notes are generated and no extra copies of the recording are started. Regions with no confident palette match stay silent.</p>
            </div>
          </div>
          <div className="note-box" style={{ marginTop: "1.5rem" }}>
            <p><strong>Carbon monoxide is not carbon dioxide.</strong> The carbon monoxide map is NASA SVS 5153. Carbon dioxide is a different visualization and is not part of this site.</p>
          </div>
        </section>
      </main>
      <SiteChrome current="data" part="footer" />
    </div>
  );
}
