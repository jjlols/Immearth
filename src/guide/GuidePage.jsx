import { useEffect, useRef, useState } from "react";
import guideCss from "../../site/styles.css?inline";
import SiteChrome from "../SiteChrome.jsx";
import SpaceWash, { SPACE_PHOTOS } from "../SpaceWash.jsx";
import { goToView, hrefFor } from "../navigation.js";
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
    planned: "Rain and frozen precipitation each get their own gentle filtered swell on the recording. More matching pixels make the swells more frequent.",
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
    planned: "Estimated fire radiative power, from 0 to 8 megawatts, opens a soft filtered accent with long rests between accents. It is not a count of fires.",
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
    planned: "Higher estimated carbon monoxide, on steps of 40, 100, 130, 200, and 500 parts per billion, raises a low-frequency layer of the recording.",
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
    planned: "Higher estimated nitrogen oxides, ranked on a logarithmic scale from 0.001 to 10 parts per billion, open a filter so the recording sounds brighter.",
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
    planned: "Estimated temperature, from −40 to +40 °C, sets the playback speed. Colder air plays the recording slower and lower. Warmer air plays it faster and higher.",
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
  ["photo", "Space photo of the day"],
  ["pages", "Open a page"],
  ["immersive", "Immersive listening"],
  ["move", "Moving around"],
  ["access", "Accessibility"],
];

const SECTION_COMMAND = {
  overview: "overview",
  maps: "maps",
  photo: "photo",
  pages: "open a page",
  immersive: "immersive listening",
  move: "move",
  access: "accessibility",
};

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
  pages: "open a page",
  "open page": "open a page",
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
  "Four pages make up the site: this home page, the Live Map, the layer explorer, and the photo of the day. Open them from the menu at the top or from Open a page. The Live Map stays silent until you press Play remix.",
  "You can search the maps, read what each one shows, and move with Previous and Next. From the top, the page continues through the maps, the photo, Open a page, 3D listening, keyboard help, and accessibility. Start voice, then say next, previous, photo, open a page, a map name, or page overview. Say stop speaking to quiet the voice, or stop listening to turn the microphone off.",
  "3D listening opens the live map. Explore its regions with W, A, S, D or arrow keys, choose one field or all of them, and select Play remix when you are ready. Headphones are recommended. Nothing plays until you press Play remix.",
];

const COMMAND_NAMES = [
  ...SECTIONS.map(([id]) => SECTION_COMMAND[id]),
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
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [voiceHint, setVoiceHint] = useState("Voice is off. Start voice, then say next, previous, or page overview.");
  const [listening, setListening] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [setPhoto] = useState(null);
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
    const commandToId = Object.fromEntries(Object.entries(SECTION_COMMAND).map(([sectionId, command]) => [command, sectionId]));
    const sectionId = map ? "maps" : commandToId[id] || id;
    const section = focusHeading(sectionId) || focusHeading(map?.id);
    if (!section && map) document.getElementById(map.id)?.querySelector("h3")?.focus();
    if (section) setLastSection(section.id);
    const label = map?.label || SECTIONS.find(([sectionName]) => sectionName === sectionId)?.[1] || id;
    let message = `${label}.`;
    if (map) message = `${map.label}. In the musical remix: ${map.planned}`;
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
      ...[...COMMAND_NAMES, "precipitation", "fires", "carbon monoxide", "nitrogen oxides", "temperature", "next", "previous", "page overview", "turn left", "turn right", "recenter", "test tones"].map((name) => [name, name]),
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
      "turn left": () => goToView("music", "map-navigation"),
      "turn right": () => goToView("music", "map-navigation"),
      recenter: () => goToView("music", "map-navigation"),
      "test tones": () => goToView("music", "map-navigation"),
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
    let stopAudio = () => {};
    let cancel = false;
    import("../../site/spatial-audio.js").then((audio) => {
      if (cancel) return;
      stopAudio = audio.installSpatialAudio();
    });
    return () => {
      cancel = true;
      stopAudio();
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    if (overviewOpen && !dialog.open) dialog.showModal();
    if (!overviewOpen && dialog.open) dialog.close();
    return undefined;
  }, [overviewOpen]);

  return (
    <>
      <style>{guideCss}</style>
      <a className="skip-link" href="#overview-title">Skip to content</a>
      <SiteChrome current="home" part="header" />
      <div id="status" className="visually-hidden" role="status">{status}</div>
      <main id="main">
        <section className="hero" id="overview" aria-labelledby="overview-title">
          <div className="hero-water" aria-hidden="true"><SpaceWash photo={SPACE_PHOTOS.marble} /><div className="water-rings"><i /><i /><i /></div></div>
          <div className="hero-copy">
            <p className="eyebrow">Earth Information Center</p>
            <h1 id="overview-title" tabIndex={-1}><span className="highlight">Hear Earth,</span> not only see it</h1>
            <p className="lede">Five NASA views of our planet, each described in words and turned into music. Read, search, or move through the site by keyboard or by voice.</p>
            <div className="actions">
              <a className="button button-primary" href={hrefFor("music")} onClick={(event) => { event.preventDefault(); goToView("music"); }}>Open Live Map</a>
              <a className="button button-secondary" href="#maps">Explore the maps</a>
              <button type="button" className="button button-secondary" ref={openOverviewRef} aria-haspopup="dialog" aria-controls="overview-dialog" onClick={openOverview}>Read page overview</button>
            </div>
          </div>
          <aside className="panel" aria-labelledby="listen-title">
            <h2 id="listen-title" className="panel-title">Listen and speak</h2>
            <p className="panel-text">Hear a spoken summary, or turn on voice and say where you want to go.</p>
            <div className="panel-row">
              <button type="button" className="button button-secondary" onClick={() => { openOverview(); speak(OVERVIEW.join(" ")); }}>Play overview</button>
              <button type="button" className="button button-quiet" onClick={() => { window.speechSynthesis?.cancel(); setVoiceHint("Stopped speaking."); announce("Stopped speaking."); }}>Stop speaking</button>
              <button type="button" className="button button-secondary" aria-pressed={listening} aria-describedby="voice-hint" onClick={() => {
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
            <p>Each map comes from NASA’s Scientific Visualization Studio. Each card says what that map changes in the musical remix. Values are estimated from NASA’s published color bars.</p>
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
          <p id="map-empty" className="empty" hidden={shownMaps.length !== 0} tabIndex={-1}>No maps match that search. Clear the search box to see all five.</p>
          <div className="cards" id="map-list">
            {MAPS.map((map) => (
              <article className="card" id={map.id} key={map.id} hidden={!shownMaps.includes(map)} data-search={map.search}>
                <div className="card-body">
                  <h3 tabIndex={-1}>{map.title}</h3>
                  <p>{map.text}</p>
                  <p className="planned"><span className="tag">In the remix</span> {map.planned}</p>
                  <p className="source">{map.source} <a href={map.href}>{map.sourceLabel}</a></p>
                  <p className="in-remix"><a href={hrefFor("music")} onClick={(event) => { event.preventDefault(); goToView("music"); }}>Hear {map.label.toLowerCase()} in the musical remix</a></p>
                </div>
                <figure>
                  <img src={map.src} width={map.width} height={map.height} alt={map.alt} />
                </figure>
              </article>
            ))}
          </div>
        </section>

        <section className="band" id="photo" aria-labelledby="photo-title">
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
            <p className="placeholder-note"><a href={hrefFor("photo")} onClick={(event) => { event.preventDefault(); goToView("photo"); }}>How the photo is added</a></p>
          </div>
        </section>

        <section className="band band-plain" id="pages" aria-labelledby="destinations-title">
          <div className="section-head">
            <p className="eyebrow">Explore</p>
            <h2 id="destinations-title" tabIndex={-1}>Open a page</h2>
            <p>The first three open their own page. The rest move through this page, in the same order as Previous section, Next section, and the voice commands.</p>
          </div>
          <h3 className="destinations-group">Other pages</h3>
          <ul className="destinations" role="list">
            <li><a className="destination" href={hrefFor("music")} onClick={(event) => { event.preventDefault(); goToView("music"); }}><strong>Live Map</strong><span>Choose a metric and hear its estimated palette guide the music. What you hear is also written out.</span><span className="destination-keys">Nothing plays until you press Play remix. W A S D or arrow keys move between 12 regions.</span></a></li>
            <li><a className="destination" href={hrefFor("layers")} onClick={(event) => { event.preventDefault(); goToView("layers"); }}><strong>Layer explorer</strong><span>Stack the five maps on one world map. Show, hide, or focus on any layer.</span><span className="destination-keys">No sound on this page.</span></a></li>
            <li><a className="destination" href={hrefFor("photo")} onClick={(event) => { event.preventDefault(); goToView("photo"); }}><strong>Photo of the day</strong><span>How to add today’s space picture and its written description.</span><span className="destination-keys">For the team that updates the site.</span></a></li>
          </ul>
          <h3 className="destinations-group">On this page</h3>
          <ul className="destinations" role="list">
            <li><a className="destination" href="#maps"><strong>The five maps</strong><span>Each NASA Earth view, described in words, with what it does in the remix.</span></a></li>
            <li><a className="destination" href="#photo"><strong>Space photo of the day</strong><span>Today’s picture, with a written description.</span></a></li>
            <li><a className="destination" href={hrefFor("music") + "#map-navigation"} onClick={(event) => { event.preventDefault(); goToView("music", "map-navigation"); }}><strong>3D listening</strong><span>Open the live map. Move between regions and let your selected field shape the music.</span></a></li>
            <li><a className="destination" href="#move"><strong>Keyboard and voice help</strong><span>Every key and voice command for each page, in one list.</span></a></li>
            <li><a className="destination" href="#access"><strong>Accessibility</strong><span>How the page works with a keyboard, a screen reader, voice, and color-blind colors.</span></a></li>
          </ul>
        </section>

        <section className="band" id="immersive" aria-labelledby="immersive-title">
          <div className="section-head"><p className="eyebrow">Spatial sound</p><h2 id="immersive-title" tabIndex={-1}>3D listening</h2>
            <p>Move through twelve musical map regions and hear one shared recording respond to your chosen field.</p>
            <a className="button button-primary" href={hrefFor('music') + '#map-navigation'} onClick={(event) => { event.preventDefault(); goToView('music', 'map-navigation'); }}>Open the listening map</a>
            <p className="field-note">A live map shows you how to use W, A, S, D, arrow keys, and region buttons. Nothing plays until you choose Play remix. Headphones are recommended. GPS or camera access is not requested for map exploration.</p>
          </div>
        </section>

        <section className="band band-plain" id="move" aria-labelledby="move-title">
          <div className="section-head">
            <p className="eyebrow">Navigation</p>
            <h2 id="move-title" tabIndex={-1}>How to navigate</h2>
            <p>Every page works with a mouse, a keyboard, or a screen reader. Buttons and keys do the same things, so use whichever works best for you.</p>
          </div>
          <div className="split">
            <div className="tile">
              <h3>On every page</h3>
              <ul className="key-list">
                <li><kbd>Tab</kbd> <span>The first stop is a Skip link that jumps past the menu.</span></li>
              </ul>
              <p>The menu at the top of every page has Home, Live Map, Layer explorer, How to use the map, and Help.</p>
              <p>Color blind colors, at the top right, switches the interface to blue, orange, and patterns. NASA map pictures keep their published colors. Your choice is remembered.</p>
            </div>
            <div className="tile">
              <h3>Live Map keys</h3>
              <p>Nothing plays until you press Play remix. Pause, Reset, Mute, and Master volume are next to it.</p>
              <ul className="key-list">
                <li><kbd>W ↑</kbd> <span>Move one region north.</span></li>
                <li><kbd>A ←</kbd> <span>Move one region west.</span></li>
                <li><kbd>S ↓</kbd> <span>Move one region south.</span></li>
                <li><kbd>D →</kbd> <span>Move one region east.</span></li>
                <li><kbd>Home</kbd> <span>Go back to region 1.</span></li>
              </ul>
              <p>The 12 regions are a grid of 3 rows and 4 columns. These keys do nothing while you are on a button, link, slider, or search box. Each move is described in words. Moving changes the music only while it is already playing.</p>
            </div>
            <div className="tile">
              <h3>Layer explorer keys</h3>
              <ul className="key-list">
                <li><kbd>↑ ↓</kbd> <span>In the layer list, move between the five layers.</span></li>
                <li><kbd>Home End</kbd> <span>Jump to the first or last layer.</span></li>
                <li><kbd>Esc</kbd> <span>Stop focusing on one layer and show all of them again.</span></li>
              </ul>
            </div>
            <div className="tile">
              <h3>This home page</h3>
              <ul className="key-list">
                <li><kbd>Tab</kbd> <span>Move to the next link, button, or search box.</span></li>
                <li><kbd>Enter</kbd> <span>Follow a link or press a button.</span></li>
                <li><kbd>Esc</kbd> <span>Close the menu or the page overview.</span></li>
              </ul>
              <p>Previous section and Next section follow the page from top to bottom: the maps, the photo, Open a page, 3D listening, this help, then accessibility. The same order is what the voice commands call next and previous.</p>
            </div>
            <div className="tile">
              <h3>Voice commands</h3>
              <p>Press Start voice, then say one of these. You can also say rain, fires, heat, read the overview, turn left, turn right, recenter, or test tones.</p>
              <ul className="command-list">
                {COMMAND_NAMES.map((name) => <li key={name}>{name}</li>)}
              </ul>
            </div>
          </div>
        </section>

        <section className="band" id="access" aria-labelledby="access-title">
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
            <li>The microphone turns on only after you press Start voice. Your speech is recognized on this computer by sherpa-onnx, an open-source keyword spotter that listens only for this site’s commands. It is not sent to an online service.</li>
      <li>3D listening opens the live map in the same page. The guide to the 12 regions is nearby and explains the twelve-region keyboard controls. Nothing plays until you press Play remix.</li>
            <li>An opening animation plays when you arrive. Press Space, Escape, or Skip, or click the animation, and it fades away. It stays off when your device is set to reduce motion.</li>
            <li>Color blind colors, at the top of every page, switches the interface to blue, orange, and patterns.</li>
            <li>The Live Map stays silent until you press Play remix. What you hear is also written out in words, so the music can be followed without sound.</li>
          </ul>
          <p className="feedback">Found a barrier? <a href="https://github.com/jjlols/NASA-SPACE-APP/issues">Report an accessibility problem</a>.</p>
        </section>
      </main>
      <SiteChrome current="home" part="footer" />
      <dialog id="overview-dialog" ref={dialogRef} aria-labelledby="overview-dialog-title" onClose={() => { setOverviewOpen(false); openOverviewRef.current?.focus(); }}>
        <h2 id="overview-dialog-title" ref={dialogTitleRef} tabIndex={-1}>Page overview</h2>
        <div id="page-overview">{OVERVIEW.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
        <button type="button" className="button button-primary" onClick={() => setOverviewOpen(false)}>Close</button>
      </dialog>
    </>
  );
}
