import { useEffect, useRef, useState } from "react";
import guideCss from "../../site/styles.css?inline";
import PageSwitch from "../PageSwitch.jsx";
import { createVoiceSession } from "./voice.js";

const asset = (file) => `${import.meta.env.BASE_URL}assets/${file}`;

const MAPS = [
  {
    id: "map-precipitation",
    command: "precipitation",
    label: "Precipitation",
    search: "precipitation rain snow imerg frozen",
    title: "Precipitation",
    text: "Rain and frozen precipitation from the Global Precipitation Measurement constellation.",
    planned: "Heavier rain becomes a faster pulse. Frozen precipitation is a softer, higher tone.",
    source: "Latest IMERG composite.",
    href: "https://svs.gsfc.nasa.gov/4285/",
    sourceLabel: "NASA precipitation page",
    src: asset("precipitation.png"),
    width: 3600,
    height: 1800,
    alt: "Global precipitation map from NASA IMERG. Green, yellow, and orange streaks show rain. Blue and white areas show frozen precipitation. The poles are white.",
  },
  {
    id: "map-fires",
    command: "fires",
    label: "Active fires",
    search: "active fires viirs fire radiative power",
    title: "Active fires",
    text: "Fire detections from the VIIRS instrument. Intensity is fire radiative power.",
    planned: "Each fire cluster is a beacon. Stronger fires pulse faster, placed left or right by longitude.",
    source: "Most recent VIIRS detections.",
    href: "https://svs.gsfc.nasa.gov/5113/",
    sourceLabel: "NASA active fires page",
    src: asset("active_fires.png"),
    width: 4096,
    height: 2048,
    alt: "Global map of VIIRS active fires. Oceans are dark blue and land is nearly black. A fire radiative power colorbar and a date are printed on the image.",
  },
  {
    id: "map-co",
    command: "carbon monoxide",
    label: "Carbon monoxide",
    search: "carbon monoxide co geos-cf",
    title: "Carbon monoxide",
    text: "Near-surface carbon monoxide estimated by NASA’s GEOS-CF model.",
    planned: "A low drone thickens where carbon monoxide is higher.",
    source: "First frame of the animation, not a verified latest observation.",
    href: "https://svs.gsfc.nasa.gov/5153/",
    sourceLabel: "NASA carbon monoxide page",
    src: asset("carbon_monoxide.png"),
    width: 2048,
    height: 1024,
    alt: "First frame of NASA's GEOS-CF visualization of near-surface carbon monoxide. This frame is not claimed to be the latest observation.",
  },
  {
    id: "map-nox",
    command: "nitrogen oxides",
    label: "Nitrogen oxides",
    search: "nitrogen oxides nox no2 geos-cf",
    title: "Nitrogen oxides",
    text: "Near-surface nitrogen oxides estimated from nitrogen oxide and nitrogen dioxide.",
    planned: "A sharper tone, separate from carbon monoxide, marks higher nitrogen oxides.",
    source: "First frame of the animation, not a verified latest observation.",
    href: "https://svs.gsfc.nasa.gov/5154/",
    sourceLabel: "NASA nitrogen oxides page",
    src: asset("nitrogen_oxides.png"),
    width: 2048,
    height: 1024,
    alt: "First frame of NASA's GEOS-CF visualization of near-surface nitrogen oxides. This frame is not claimed to be the latest observation.",
  },
  {
    id: "map-temperature",
    command: "temperature",
    label: "Temperature",
    search: "temperature near-surface air geos-fp heat cold",
    title: "Temperature",
    text: "Air temperature about 3 meters above the surface, from NASA’s GEOS-FP weather analysis.",
    planned: "Pitch follows the temperature. Colder air is lower. Hotter air is higher, on a musical scale.",
    source: "First frame of the animation, not a verified latest observation.",
    href: "https://svs.gsfc.nasa.gov/5147/",
    sourceLabel: "NASA temperature page",
    src: asset("near_surface_temperature.png"),
    width: 2048,
    height: 1024,
    alt: "First frame of NASA's GEOS-FP near-surface temperature map. Polar regions are blue, middle latitudes yellow, and the tropics orange to dark red. A date and the NASA GMAO name are printed on the image.",
  },
];

const SECTIONS = [
  ["overview", "Overview"],
  ["maps", "The maps"],
  ["immersive", "Immersive listening"],
  ["photo", "Space photo of the day"],
  ["move", "Moving around"],
  ["access", "Accessibility"],
];

const ALIASES = {
  "read the overview": "page overview",
  "read overview": "page overview",
  "play overview": "page overview",
  "next section": "next",
  "previous section": "previous",
  back: "previous",
  "the maps": "maps",
  "go to the maps": "maps",
  "moving around": "move",
  movement: "move",
  "photo of the day": "photo",
  "space photo": "photo",
  "image of the day": "photo",
  "go to the photo": "photo",
  photos: "photo",
  picture: "photo",
  pictures: "photo",
  rain: "precipitation",
  "active fires": "fires",
  fire: "fires",
  heat: "temperature",
  nox: "nitrogen oxides",
  "turn to the left": "turn left",
  "look left": "turn left",
  "face left": "turn left",
  "turn to the right": "turn right",
  "look right": "turn right",
  "face right": "turn right",
  "face forward": "recenter",
  "look forward": "recenter",
  center: "recenter",
  centre: "recenter",
  "play test tones": "test tones",
  "play the test tones": "test tones",
  "play tones": "test tones",
};

const OVERVIEW = [
  "Earth Information Jukebox. A NASA Space Apps project, not the official NASA website.",
  "This page presents five NASA Earth maps: precipitation, active fires, carbon monoxide, nitrogen oxides, and near-surface temperature. It also has a space photo of the day. Precipitation and fires are NASA’s latest published images. The other three are the first frame of an animation, not a verified latest observation.",
  "You can search the maps, read what each one shows, and move with Previous and Next. Start voice, then say next, previous, photo, a map name, or page overview. Say stop speaking to quiet the voice, or stop listening to turn the microphone off.",
  "Immersive listening can place sound around you. Headphones are recommended. Use the direction slider, or say turn left, turn right, recenter, or test tones. The camera stays off unless you turn it on, and that picture stays on this computer.",
];

const COMMAND_NAMES = [
  ...SECTIONS.map(([id]) => (id === "overview" ? "overview" : id === "immersive" ? "immersive listening" : id === "move" ? "move" : id === "access" ? "accessibility" : id === "photo" ? "photo" : id)),
  "precipitation",
  "fires",
  "carbon monoxide",
  "nitrogen oxides",
  "temperature",
  "next",
  "previous",
  "page overview",
  "turn left",
  "turn right",
  "recenter",
  "test tones",
];

function hasPhrase(heard, phrase) {
  return new RegExp(`(?:^|\\s)${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`).test(heard);
}

function probePhoto(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = url;
  });
}

export default function GuidePage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [voiceHint, setVoiceHint] = useState("Voice is off. Start voice, then say next, previous, photo, or page overview.");
  const [listening, setListening] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [lastSection, setLastSection] = useState("overview");
  const dialogRef = useRef(null);
  const dialogTitleRef = useRef(null);
  const openOverviewRef = useRef(null);
  const voiceRef = useRef(null);
  const runRef = useRef(() => false);

  const shownMaps = MAPS.filter((map) => query.trim() === "" || map.search.includes(query.trim().toLowerCase()));

  function announce(message) {
    setStatus("");
    window.setTimeout(() => setStatus(message), 30);
  }

  function focusHeading(id) {
    const section = document.getElementById(id);
    const heading = section?.querySelector("h1, h2, h3");
    heading?.focus();
    return section;
  }

  function goTo(id, quiet) {
    const map = MAPS.find((item) => item.command === id || item.id === id);
    const sectionId = map ? "maps" : id === "immersive listening" ? "immersive" : id === "accessibility" ? "access" : id;
    const section = focusHeading(sectionId) || focusHeading(map?.id);
    if (!section && map) document.getElementById(map.id)?.querySelector("h3")?.focus();
    if (section) setLastSection(section.id);
    const label = map?.label || SECTIONS.find(([sectionName]) => sectionName === sectionId)?.[1] || id;
    let message = `${label}.`;
    if (map) message = `${map.label}. Planned sound. ${map.planned}`;
    if (sectionId === "photo" && !photo) message = `${message} Today’s photo has not been posted yet. Please check back soon.`;
    if (!quiet) announce(message);
    if (map) document.getElementById(map.id)?.querySelector("h3")?.focus();
    return message;
  }

  function step(direction) {
    const index = Math.max(0, SECTIONS.findIndex(([id]) => id === lastSection));
    const next = index + direction;
    if (next < 0) {
      goTo(SECTIONS[0][0], true);
      announce("Already at the start of the page.");
      return "Already at the start of the page.";
    }
    if (next >= SECTIONS.length) {
      goTo(SECTIONS[SECTIONS.length - 1][0], true);
      announce("Already at the end of the page.");
      return "Already at the end of the page.";
    }
    return goTo(SECTIONS[next][0]);
  }

  function openOverview() {
    setOverviewOpen(true);
    window.setTimeout(() => dialogTitleRef.current?.focus(), 0);
  }

  function speak(text) {
    if (!text || !window.speechSynthesis) {
      setVoiceHint("This browser cannot speak. The written overview is still on the page.");
      announce("This browser cannot speak. The written overview is still on the page.");
      return false;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    window.speechSynthesis.speak(utterance);
    return true;
  }

  runRef.current = (phrase) => {
    const heard = phrase.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    if (hasPhrase(heard, "stop test tones") || hasPhrase(heard, "stop the test tones") || hasPhrase(heard, "stop tones")) {
      const message = window.earthAudio ? window.earthAudio.stopTestTones() : "Test tones are not available.";
      setVoiceHint(message);
      announce(message);
      return true;
    }
    if (hasPhrase(heard, "stop listening") || hasPhrase(heard, "voice off")) {
      voiceRef.current?.stop();
      setListening(false);
      return true;
    }
    if (hasPhrase(heard, "stop speaking") || hasPhrase(heard, "be quiet") || heard === "stop") {
      window.speechSynthesis?.cancel();
      setVoiceHint("Stopped speaking.");
      announce("Stopped speaking.");
      return true;
    }
    const entries = [
      ...["overview", "maps", "immersive listening", "photo", "move", "accessibility", "precipitation", "fires", "carbon monoxide", "nitrogen oxides", "temperature", "next", "previous", "page overview", "turn left", "turn right", "recenter", "test tones"].map((name) => [name, name]),
      ...Object.entries(ALIASES),
    ];
    let best = null;
    entries.forEach(([alias, name]) => {
      if (hasPhrase(heard, alias) && (!best || alias.length > best.alias.length)) best = { alias, name };
    });
    if (!best) return false;
    const audio = window.earthAudio;
    const actions = {
      next: () => step(1),
      previous: () => step(-1),
      "page overview": () => {
        openOverview();
        return OVERVIEW.join("\n");
      },
      "turn left": () => (audio ? audio.nudgeHeading(-15, { announce: "none" }) : "Immersive listening is not available."),
      "turn right": () => (audio ? audio.nudgeHeading(15, { announce: "none" }) : "Immersive listening is not available."),
      recenter: () => (audio ? audio.recenter({ announce: "none" }) : "Immersive listening is not available."),
      "test tones": () => (audio ? audio.startTestTones() : "Immersive listening is not available."),
    };
    const result = actions[best.name] ? actions[best.name]() : goTo(best.name);
    if (typeof result === "string") speak(result);
    return true;
  };

  useEffect(() => {
    const session = createVoiceSession({
      onHint: (message) => {
        setVoiceHint(message);
        announce(message);
      },
      runCommand: (phrase) => runRef.current(phrase),
    });
    voiceRef.current = session;
    return () => session.dispose();
  }, []);

  useEffect(() => {
    let stopIntro = () => {};
    let stopAudio = () => {};
    let cancel = false;
    Promise.all([import("../../site/intro.js"), import("../../site/spatial-audio.js")]).then(([intro, audio]) => {
      if (cancel) return;
      stopIntro = intro.startIntro() || (() => {});
      stopAudio = audio.installSpatialAudio();
    });
    return () => {
      cancel = true;
      stopIntro();
      stopAudio();
    };
  }, []);

  useEffect(() => {
    let cancel = false;
    const folders = [`${import.meta.env.BASE_URL}photo-of-the-day/`, "site/photo-of-the-day/"];
    const files = ["photo.jpg", "photo.jpeg", "photo.png", "photo.webp", "photo.gif"];
    (async () => {
      for (const folder of folders) {
        let text = "";
        try {
          const response = await fetch(`${folder}caption.txt`);
          if (response.ok) text = (await response.text()).trim();
        } catch { /* caption is optional */ }
        for (const file of files) {
          const url = `${folder}${file}`;
          if (await probePhoto(url)) {
            if (!cancel) setPhoto({ url, text });
            return;
          }
        }
      }
    })();
    return () => { cancel = true; };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    if (overviewOpen && !dialog.open) dialog.showModal();
    if (!overviewOpen && dialog.open) dialog.close();
    return undefined;
  }, [overviewOpen]);

  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape" && menuOpen) {
        setMenuOpen(false);
        document.getElementById("explore-button")?.focus();
      }
    }
    function onClick(event) {
      if (!menuOpen) return;
      const nav = document.getElementById("site-nav");
      const button = document.getElementById("explore-button");
      if (nav?.contains(event.target) || button?.contains(event.target)) return;
      setMenuOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, [menuOpen]);

  return (
    <>
      <style>{guideCss}</style>
      <div className="intro-overlay" id="intro">
        <canvas id="intro-canvas" aria-hidden="true" />
        <p className="visually-hidden" role="status">Opening animation. Press Space, Escape, or Skip, or click the animation, to enter the site.</p>
        <button type="button" className="intro-skip" id="intro-skip">Skip</button>
      </div>
      <a className="skip-link" href="#overview-title">Skip to content</a>
      <header className="site-header">
        <div className="notice"><p>A NASA Space Apps Challenge 2026 project. This is not an official NASA website.</p></div>
        <div className="bar">
          <a className="wordmark" href="#overview-title"><span className="mark" aria-hidden="true" /><span className="wordmark-text">Earth Jukebox</span></a>
          <button type="button" className="explore-button" id="explore-button" aria-expanded={menuOpen} aria-controls="site-nav" onClick={() => setMenuOpen((open) => !open)}>Menu</button>
          <div className={`menu${menuOpen ? " is-open" : ""}`} id="site-nav">
            <nav className="primary-nav" aria-label="Main">
              <ul>
                <li><a href="#maps" onClick={() => setMenuOpen(false)}>Maps</a></li>
                <li><a href="#immersive" onClick={() => setMenuOpen(false)}>3D listening</a></li>
                <li><a href="#photo" onClick={() => setMenuOpen(false)}>Photo</a></li>
                <li><a href="#move" onClick={() => setMenuOpen(false)}>Navigation</a></li>
                <li><a href="#access" onClick={() => setMenuOpen(false)}>Accessibility</a></li>
              </ul>
            </nav>
            <PageSwitch current="guide" />
            <form className="search" role="search" action="#maps" onSubmit={(event) => {
              event.preventDefault();
              const first = shownMaps[0];
              if (first) document.getElementById(first.id)?.querySelector("h3")?.focus();
              else document.getElementById("map-empty")?.focus();
            }}>
              <label className="visually-hidden" htmlFor="site-search">Search maps</label>
              <input id="site-search" type="search" name="q" placeholder="Search maps" enterKeyHint="search" autoComplete="off" value={query} onChange={(event) => {
                const value = event.target.value;
                setQuery(value);
                const count = MAPS.filter((map) => value.trim() === "" || map.search.includes(value.trim().toLowerCase())).length;
                announce(count === 0 ? `No maps match ${value.trim()}.` : `Showing ${count} of ${MAPS.length} maps.`);
              }} />
            </form>
          </div>
        </div>
      </header>
      <div id="status" className="visually-hidden" role="status">{status}</div>
      <main id="main">
        <section className="hero" id="overview" aria-labelledby="overview-title">
          <div className="hero-copy">
            <p className="eyebrow">Earth Information Center</p>
            <h1 id="overview-title" tabIndex={-1}><span className="highlight">Hear Earth,</span> not only see it</h1>
            <p className="lede">Five NASA views of our planet and a space photo of the day, each described in words and designed to be heard. Read, search, or move through the page by keyboard or by voice.</p>
            <div className="actions">
              <a className="button button-primary" href="#maps">Explore the maps</a>
              <button type="button" className="button button-secondary" ref={openOverviewRef} aria-haspopup="dialog" aria-controls="overview-dialog" onClick={openOverview}>Read page overview</button>
            </div>
          </div>
          <aside className="panel" aria-labelledby="listen-title">
            <h2 id="listen-title" className="panel-title">Listen and speak</h2>
            <p className="panel-text">Hear a spoken summary, or turn on voice and say where you want to go.</p>
            <div className="panel-row">
              <button type="button" className="button button-secondary" onClick={() => { openOverview(); speak(OVERVIEW.join(" ")); }}>Play overview</button>
              <button type="button" className="button button-quiet" onClick={() => { window.speechSynthesis?.cancel(); setVoiceHint("Stopped speaking."); announce("Stopped speaking."); }}>Stop speaking</button>
            </div>
            <div className="panel-row">
              <button type="button" className="button button-secondary" aria-pressed={listening} onClick={() => {
                if (listening) {
                  voiceRef.current?.stop();
                  setListening(false);
                } else {
                  voiceRef.current?.start().then((started) => setListening(Boolean(started)));
                }
              }}>{listening ? "Stop voice" : "Start voice"}</button>
            </div>
            <p id="voice-hint" className="voice-hint">{voiceHint}</p>
            <div className="panel-row mover" role="group" aria-label="Move between sections">
              <button type="button" className="button button-quiet" onClick={() => step(-1)}>Previous section</button>
              <button type="button" className="button button-quiet" onClick={() => step(1)}>Next section</button>
            </div>
          </aside>
        </section>

        <section className="band band-plain" id="maps" aria-labelledby="maps-title">
          <div className="section-head">
            <p className="eyebrow">Earth data</p>
            <h2 id="maps-title" tabIndex={-1}>The five maps</h2>
            <p>Each map comes from NASA’s Scientific Visualization Studio. The sound described on each card is planned and does not play yet.</p>
            <p>The musical remix and the stacked maps are React pages too. Use Music or Layer explorer in the page menu.</p>
          </div>
          <p id="map-empty" className="empty" hidden={shownMaps.length !== 0} tabIndex={-1}>No maps match that search. Clear the search box to see all five.</p>
          <div className="cards" id="map-list">
            {MAPS.map((map) => (
              <article className="card" id={map.id} key={map.id} hidden={!shownMaps.includes(map)} data-search={map.search}>
                <div className="card-body">
                  <h3 tabIndex={-1}>{map.title}</h3>
                  <p>{map.text}</p>
                  <p className="planned"><span className="tag">Planned sound</span> {map.planned}</p>
                  <p className="source">{map.source} <a href={map.href}>{map.sourceLabel}</a></p>
                </div>
                <figure>
                  <img src={map.src} width={map.width} height={map.height} alt={map.alt} />
                </figure>
              </article>
            ))}
          </div>
        </section>

        <section className="band" id="immersive" aria-labelledby="immersive-title">
          <div className="section-head">
            <p className="eyebrow">Spatial sound</p>
            <h2 id="immersive-title" tabIndex={-1}>Immersive listening</h2>
            <p>Sound can sit on a globe around your head. Longitude 0 starts straight ahead, east is to your right, and north is up.</p>
            <p className="headphones-note">Headphones recommended.</p>
          </div>
          <div className="listen-grid">
            <div className="tile tile-direction">
              <h3>Listening direction</h3>
              <p id="heading-readout">Facing the prime meridian, straight ahead.</p>
              <div className="range-field">
                <label className="field-label" htmlFor="heading-slider">Direction</label>
                <input id="heading-slider" type="range" min="-180" max="180" step="1" defaultValue="0" aria-describedby="heading-help" />
                <div className="direction-scale" aria-hidden="true"><span>180° west</span><span>Forward</span><span>180° east</span></div>
                <p id="heading-help" className="field-note">From 180 degrees west to 180 degrees east. Left and right arrow keys turn only while this slider is focused, not from the rest of the page.</p>
              </div>
              <div className="panel-row" role="group" aria-label="Listening direction buttons">
                <button type="button" className="button button-quiet" id="turn-left">Turn left</button>
                <button type="button" className="button button-quiet" id="turn-right">Turn right</button>
                <button type="button" className="button button-secondary" id="recenter-heading">Recenter</button>
              </div>
              <div className="range-field">
                <label className="field-label" htmlFor="master-volume">Overall volume</label>
                <input id="master-volume" type="range" min="0" max="100" step="1" defaultValue="70" aria-describedby="volume-help" />
                <p id="volume-help" className="field-note">Master volume for every spatial sound, from silent to full.</p>
              </div>
            </div>
            <div className="tile">
              <h3>Turn with your head</h3>
              <div className="panel-row">
                <button type="button" className="button button-secondary" id="head-tracking-toggle" aria-pressed="false" aria-describedby="camera-privacy">Use camera to turn with your head</button>
              </div>
              <p id="camera-privacy" className="field-note">Optional, and off until you turn it on. Head tracking stays on this computer. The camera picture is used only to see which way your head is turned. It is not recorded, stored, or sent anywhere. The tracking model is downloaded once when you turn this on. If your device is set to reduce motion, the preview is hidden and tracking can still run.</p>
              <p id="camera-status" className="voice-hint">Camera is off. Use the slider, arrow keys, or Turn left and Turn right.</p>
              <div className="camera-preview" id="camera-preview" hidden>
                <video id="head-camera" className="head-camera" width="320" height="240" autoPlay muted playsInline aria-hidden="true" />
              </div>
            </div>
            <div className="tile">
              <h3>Check your headphones</h3>
              <div className="panel-row">
                <button type="button" className="button button-secondary" id="play-test-tones" aria-pressed="false">Play test tones</button>
                <button type="button" className="button button-quiet" id="stop-test-tones">Stop test tones</button>
              </div>
              <p className="field-note">Four soft pentatonic notes: in front, on your right, behind you, and on your left. Nothing plays until you press Play test tones. Stop test tones or Escape ends them.</p>
            </div>
          </div>
        </section>

        <section className="band band-plain" id="photo" aria-labelledby="photo-title">
          <div className="section-head">
            <p className="eyebrow">Today</p>
            <h2 id="photo-title" tabIndex={-1}>Space photo of the day</h2>
            <p>A new view of Earth or space, with a written description of what it shows.</p>
          </div>
          <figure className="photo-frame" hidden={!photo}>
            {photo && <img src={photo.url} alt={photo.text || "Space photo of the day. Add caption.txt in the photo folder so this picture can be described."} />}
            <figcaption>{photo?.text || "Add caption.txt next to the photo so people who cannot see it know what it shows."}</figcaption>
          </figure>
          <div className="placeholder" hidden={Boolean(photo)}>
            <p>Today’s photo has not been posted yet. Please check back soon.</p>
            <p className="placeholder-note"><a href="?view=photo" onClick={(event) => { event.preventDefault(); import("../navigation.js").then((nav) => nav.goToView("photo")); }}>How the photo is added</a></p>
          </div>
        </section>

        <section className="band" id="move" aria-labelledby="move-title">
          <div className="section-head">
            <p className="eyebrow">Navigation</p>
            <h2 id="move-title" tabIndex={-1}>How to navigate</h2>
            <p>Buttons, keys, and voice commands all do the same things. Use whichever works best for you.</p>
          </div>
          <div className="split">
            <div className="tile">
              <h3>Keyboard</h3>
              <ul className="key-list">
                <li><kbd>Tab</kbd> <span>Move to the next link, button, or search box.</span></li>
                <li><kbd>Enter</kbd> <span>Follow a link or press a button.</span></li>
                <li><kbd>Esc</kbd> <span>Close the menu or the page overview, and stop test tones if they are playing.</span></li>
                <li><kbd>← →</kbd> <span>Turn while the Listening direction slider is focused. Arrow keys do not turn from the rest of the page.</span></li>
              </ul>
              <p>Previous section and Next section move to the next heading and announce where you landed.</p>
            </div>
            <div className="tile">
              <h3>Voice commands</h3>
              <p>Press Start voice, then say one of these. You can also say rain, fires, heat, photo of the day, read the overview, turn left, turn right, recenter, or test tones.</p>
              <ul className="command-list">
                {COMMAND_NAMES.map((name) => <li key={name}>{name}</li>)}
              </ul>
            </div>
          </div>
        </section>

        <section className="band band-plain" id="access" aria-labelledby="access-title">
          <div className="section-head">
            <p className="eyebrow">For everyone</p>
            <h2 id="access-title" tabIndex={-1}>Accessibility</h2>
            <p>This site is built to work for people who are blind or have low vision, people who cannot read color maps, and anyone using a keyboard or their voice instead of a mouse.</p>
          </div>
          <ul className="checks">
            <li>Text and buttons meet the enhanced contrast level, at least 7 to 1.</li>
            <li>Every control works from the keyboard and shows a clear focus outline.</li>
            <li>Links in text are underlined. Meaning is never shown by color alone.</li>
            <li>Each map has a written description of what the picture shows, plus its source.</li>
            <li>Text can be enlarged, and the layout reflows on narrow screens and at high zoom.</li>
            <li>Search results and section changes are announced to screen readers.</li>
            <li>The microphone turns on only after you press Start voice. Your speech is recognized on this computer by the speech engine built into Windows. It is not sent to an online service.</li>
            <li>Immersive listening stays quiet until you press Play test tones or another sound is started. A text line shows which way you are facing. Headphones are recommended. The camera stays off until you ask, and the picture is processed on this computer.</li>
            <li>An opening animation plays when you arrive. Press Space, Escape, or Skip, or click the animation, and it fades away. It stays off when your device is set to reduce motion.</li>
          </ul>
          <p className="feedback">Found a barrier? <a href="https://github.com/jjlols/NASA-SPACE-APP/issues">Report an accessibility problem</a>.</p>
        </section>
      </main>
      <footer className="site-footer">
        <div className="footer-inner">
          <div>
            <p className="footer-title">Earth Information Jukebox</p>
            <p>A NASA Space Apps Challenge project using imagery from NASA’s Scientific Visualization Studio. Not an official NASA website.</p>
          </div>
          <PageSwitch current="guide" />
        </div>
      </footer>
      <dialog id="overview-dialog" ref={dialogRef} aria-labelledby="overview-dialog-title" onClose={() => { setOverviewOpen(false); openOverviewRef.current?.focus(); }}>
        <h2 id="overview-dialog-title" ref={dialogTitleRef} tabIndex={-1}>Page overview</h2>
        <div id="page-overview">{OVERVIEW.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
        <button type="button" className="button button-primary" onClick={() => setOverviewOpen(false)}>Close</button>
      </dialog>
    </>
  );
}
