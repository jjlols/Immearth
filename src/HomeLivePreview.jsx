import { useEffect, useRef, useState } from "react";
import { LAYER_OPTIONS, OPACITY_DEFAULTS } from "./layerOptions.js";
import { RemixEngine } from "./audio/RemixEngine.js";
import { featureModel } from "./audio/musicMappings.js";
import { explorerPosition } from "./hooks/useExplorer.js";
import { linkTo } from "./navigation.js";
import "./styles-origin.css";

/* The home preview keeps the listener on the first region. It does not follow keys or clicks. */
const FIXED_REGION = 0;

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

function listenerForward(degrees) {
  const radians = (Number(degrees) || 0) * Math.PI / 180;
  return { x: Math.sin(radians), y: Math.cos(radians), z: 0 };
}

export default function HomeLivePreview() {
  const engine = useRef(null);
  const wantPlay = useRef(true);
  const [playState, setPlayState] = useState("loading");
  const [audioError, setAudioError] = useState(null);
  const place = explorerPosition(FIXED_REGION);

  useEffect(() => {
    let cancelled = false;
    const player = new RemixEngine();
    engine.current = player;
    player.setVolume(0.48);
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
        if (cancelled) return;
        if (player.ctx?.state === "running") {
          setPlayState("playing");
          window.removeEventListener("pointerdown", unlock);
          window.removeEventListener("keydown", unlock);
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
      if (event.target?.closest?.(".home-live-actions .main-action")) return;
      if (wantPlay.current && player.ctx?.state !== "running") start();
    }

    start();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);

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
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      player.dispose();
      if (engine.current === player) engine.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let stopHeading = () => {};
    let button = null;
    let onCameraClick = null;

    function aim(degrees) {
      const current = engine.current;
      if (!current) return;
      current.setSpatialListenerOrientation(listenerForward(degrees), { x: 0, y: 0, z: 1 });
    }

    function attach() {
      const audio = window.earthAudio;
      button = document.querySelector("#head-tracking-toggle");
      if (!audio || !button) return false;
      stopHeading = audio.on("headingchange", (detail) => aim(detail.heading));
      onCameraClick = () => {
        const turningOn = button.getAttribute("aria-pressed") !== "true";
        const current = engine.current;
        if (!current) return;
        current.setSpatialEnabled(turningOn);
        if (turningOn) aim(audio.getHeading());
      };
      button.addEventListener("click", onCameraClick);
      return true;
    }

    let timer = 0;
    if (!attach()) {
      timer = window.setInterval(() => {
        if (cancelled || attach()) window.clearInterval(timer);
      }, 200);
    }

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      stopHeading();
      if (button && onCameraClick) button.removeEventListener("click", onCameraClick);
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

  const playLabel = playState === "playing" ? "Pause" : playState === "loading" ? "Loading…" : playState === "unavailable" ? "Retry" : "Play";
  const playStatus = playState === "playing"
    ? "Live Map music is playing."
    : playState === "paused"
      ? "Live Map music is paused."
      : playState === "unavailable"
        ? "Live Map music is unavailable."
        : "Live Map music is starting.";

  return (
    <div className="home-live">
      <div className="section-head">
        <p className="eyebrow">Live Map</p>
        <h2 id="live-preview-title" tabIndex={-1}>Hear where you are</h2>
        <p>The same map and music as the Live Map, already playing. Your place stays fixed on this page.</p>
      </div>
      <div className="home-live-card">
        <div className="map-frame">
          <div className="geographic-canvas" role="img" aria-label="World map with your place fixed on region 1 of 12. Location cannot be changed here.">
            <img src={`${import.meta.env.BASE_URL}assets/basemap.png`} className="geoplanes" alt="" />
            {LAYER_OPTIONS.map((layer, order) => <MapField key={layer.id} layer={{ ...layer, order }} />)}
            <div className="exploration-marker" style={place} aria-hidden="true"><span>↗</span><small>You are here</small></div>
            <span className="map-longitude west">180° W</span>
            <span className="map-longitude east">180° E</span>
          </div>
        </div>
        <p className="home-place">You are here, region 1 of 12. This page does not move your place.</p>
        <div className="home-live-actions">
          <button type="button" className="main-action" aria-pressed={playState === "playing"} onClick={togglePlayback}>
            {playLabel}<span aria-hidden="true">{playState === "playing" ? "Ⅱ" : "↗"}</span>
          </button>
          <a className="button button-outline-light" {...linkTo("music")}>Open the Live Map</a>
        </div>
        <div className="home-camera">
          <h3>Spatial sound</h3>
          <button type="button" className="button button-secondary" id="head-tracking-toggle" aria-pressed="false" aria-describedby="camera-privacy">Use camera to turn with your head</button>
          <p id="camera-privacy" className="field-note">Optional, and off until you turn it on. The camera picture is used only to see which way your head is turned. It stays on this computer. It is not recorded, stored, or sent anywhere.</p>
          <p id="camera-status" className="voice-hint">Camera is off. Turn it on to aim the sound with your head. Your place on the map stays fixed.</p>
          <div className="camera-preview" id="camera-preview" hidden>
            <video id="head-camera" className="head-camera" width="320" height="240" autoPlay muted playsInline aria-hidden="true" />
          </div>
        </div>
        <p className="visually-hidden" role="status">{playStatus}</p>
        {audioError && <p role="alert" className="home-audio-error">{audioError}</p>}
      </div>
    </div>
  );
}
