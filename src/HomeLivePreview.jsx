import { useEffect, useRef, useState } from "react";
import { LAYER_OPTIONS, OPACITY_DEFAULTS } from "./layerOptions.js";
import { RemixEngine } from "./audio/RemixEngine.js";
import { featureModel, TRACK } from "./audio/musicMappings.js";
import { regionAtPoint, EXPLORER_SIZE } from "./hooks/useExplorer.js";
import { VANCOUVER_DISPLAY } from "./lib/spatialOrigin.js";
import { linkTo } from "./navigation.js";
import { IconSpeaker } from "./Icons.jsx";
import SpatialOriginMarker from "./components/SpatialOriginMarker.jsx";
import "./styles-origin.css";

/* The home preview keeps the listener at Vancouver. The basemap is drawn equirectangular
 * (build_geographic_overlays.py), so the pin uses Vancouver's longitude and latitude, and the
 * music reads the grid cell that holds it. It does not follow keys or clicks. */
const PLACE = { left: `${VANCOUVER_DISPLAY.leftPercent}%`, top: `${VANCOUVER_DISPLAY.topPercent}%` };
const FIXED_REGION = regionAtPoint(VANCOUVER_DISPLAY.xProportion, VANCOUVER_DISPLAY.yProportion, 1, 1);
const PLACE_WORDS = `Vancouver, region ${FIXED_REGION + 1} of ${EXPLORER_SIZE}`;

function MapField({ layer }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d").drawImage(img, 0, 0);
      canvas.dataset.loaded = "true";
    };
    img.onerror = () => {
      canvas.dataset.error = "true";
    };
    img.src = `${import.meta.env.BASE_URL}assets/${layer.id}.png`;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [layer.id]);
  return (
    <canvas
      ref={ref}
      className="map-raster"
      data-map-field={layer.id}
      aria-hidden="true"
      style={{ opacity: OPACITY_DEFAULTS[layer.id] ?? 0.66, zIndex: layer.order ?? 1 }}
    />
  );
}

function modelsFor(features) {
  return Object.fromEntries(LAYER_OPTIONS.map((layer) => {
    const cell = features?.[layer.id]?.[FIXED_REGION];
    return [layer.id, featureModel(layer.id, cell)];
  }));
}

export default function HomeLivePreview() {
  const engine = useRef(null);
  const wantPlay = useRef(true);
  const [playState, setPlayState] = useState("waiting");
  const [audioError, setAudioError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const player = new RemixEngine({ sourceUrl: `${import.meta.env.BASE_URL}${TRACK.file}` });
    engine.current = player;
    player.setVolume(0.32);
    player.setModel(modelsFor(null), {
      visibility: Object.fromEntries(LAYER_OPTIONS.map((layer) => [layer.id, true])),
      selection: "nitrogen_oxides",
      mode: "composition",
    });

    async function start() {
      if (cancelled || !wantPlay.current) return;
      setPlayState((current) => (current === "playing" ? current : "loading"));
      try {
        await player.play();
        if (cancelled || !wantPlay.current) {
          if (!cancelled) await player.pause();
          return;
        }
        if (player.ctx?.state === "running") {
          setPlayState("playing");
          window.removeEventListener("pointerdown", unlock, true);
          window.removeEventListener("keydown", unlock, true);
        } else {
          setPlayState("paused");
        }
      } catch (error) {
        if (!cancelled) {
          setAudioError(error.message);
          setPlayState("unavailable");
        }
      }
    }

    function unlock(event) {
      if (!introFinished) {
        player.prime().catch(() => {});
        return;
      }
      if (event.target?.closest?.(".home-live-actions .main-action")) return;
      if (wantPlay.current && player.ctx?.state !== "running") start();
    }

    let introFinished = !document.getElementById("intro");
    let observer;
    function beginAfterIntro() {
      if (introFinished || cancelled) return;
      introFinished = true;
      observer?.disconnect();
      start();
    }
    if (introFinished) start();
    else {
      observer = new MutationObserver(() => {
        if (!document.getElementById("intro")) beginAfterIntro();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    function pauseForOverview() {
      wantPlay.current = false;
      player.pause().then(() => {
        if (!cancelled) setPlayState("paused");
      }).catch(() => {});
    }

    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);
    window.addEventListener("immearth-pause-preview", pauseForOverview);

    let ignoreFeatures = false;
    fetch(`${import.meta.env.BASE_URL}scales/features.json`)
      .then((response) => (response.ok ? response.json() : null))
      .then((scales) => {
        if (ignoreFeatures || !scales?.categories || !engine.current) return;
        engine.current.setModel(modelsFor(scales.categories), {
          visibility: Object.fromEntries(LAYER_OPTIONS.map((layer) => [layer.id, true])),
          selection: "nitrogen_oxides",
          mode: "composition",
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      ignoreFeatures = true;
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
      window.removeEventListener("immearth-pause-preview", pauseForOverview);
      observer?.disconnect();
      player.dispose();
      if (engine.current === player) engine.current = null;
    };
  }, []);

  async function togglePlayback() {
    const player = engine.current;
    if (!player) return;
    setAudioError(null);
    const hearing = player.isRunning && player.ctx?.state === "running";
    if (hearing) {
      wantPlay.current = false;
      try {
        await player.pause();
        setPlayState("paused");
      } catch (error) {
        setAudioError(error.message);
        setPlayState("unavailable");
      }
      return;
    }
    wantPlay.current = true;
    setPlayState("loading");
    try {
      await player.play();
      setPlayState(player.ctx?.state === "running" ? "playing" : "paused");
    } catch (error) {
      setAudioError(error.message);
      setPlayState("unavailable");
    }
  }

  const playLabel = playState === "playing" ? "Pause music" : playState === "loading" ? "Loading music…" : playState === "unavailable" ? "Retry music" : "Play music";
  const playStatus = playState === "playing"
    ? "Live Map music is playing."
    : playState === "paused"
      ? "Live Map music is paused."
      : playState === "unavailable"
        ? "Live Map music is unavailable."
        : playState === "waiting"
          ? "Music starts after the opening animation."
          : "Live Map music is starting.";

  return (
    <div className="home-live">
      <div className="section-head">
        <p className="eyebrow">Live Map</p>
        <h2 id="live-preview-title" tabIndex={-1}>Hear where you are</h2>
        <p>The same map and music as the Live Map. The music starts when the opening animation finishes. Your place stays fixed on this page.</p>
      </div>
      <div className="home-live-card">
        <div className="map-frame">
          <div className="geographic-canvas" role="img" aria-label={`World map with your place fixed at ${PLACE_WORDS}. Location cannot be changed here.`}>
            <img src={`${import.meta.env.BASE_URL}assets/basemap.png`} className="geoplanes" alt="" />
            {LAYER_OPTIONS.map((layer, order) => <MapField key={layer.id} layer={{ ...layer, order }} />)}
            <div className="home-place-pin" style={PLACE} aria-hidden="true">
              <span className="home-place-dot" />
              <span className="home-place-line" />
              <span className="home-place-label">You are here: Vancouver</span>
            </div>
            <SpatialOriginMarker />
            <span className="map-longitude west">180° W</span>
            <span className="map-longitude east">180° E</span>
          </div>
        </div>
        <p className="home-place">You are here: {PLACE_WORDS}. This page does not move your place.</p>
        <div className="home-live-actions">
          <button type="button" className="main-action" aria-pressed={playState === "playing"} onClick={togglePlayback}>
            {playLabel}<span aria-hidden="true">{playState === "playing" ? "❚❚" : "▶"}</span>
          </button>
          <a className="button button-secondary" {...linkTo("music")}><IconSpeaker /> Open the Live Map</a>
        </div>
        <p className="visually-hidden" role="status">{playStatus}</p>
        {audioError && <p role="alert" className="home-audio-error">{audioError}</p>}
      </div>
    </div>
  );
}
