import { useEffect, useRef, useState } from "react";
import SiteChrome from "../SiteChrome.jsx";
import { SPACE_PHOTOS } from "../SpaceWash.jsx";
import { goToView, linkTo } from "../navigation.js";
import { IconArrow, IconEye, IconGlobe, IconKeyboard, IconLayers, IconMic, IconNext, IconPlay, IconPrev, IconSpeaker, IconStop } from "../Icons.jsx";
import { MAPS, asset } from "./maps.js";
import { HOME_SECTIONS, SECTION_COMMAND, STOP_COMMANDS, hasPhrase, matchCommand, normalizeHeard } from "./voiceCommands.js";
import { createVoiceSession } from "./voice.js";

const OVERVIEW = [
  "Immearth. A NASA Space Apps project, not the official NASA website.",
  "This site turns five NASA Earth maps into one shared piece of music: precipitation, active fires, carbon monoxide, nitrogen oxides, and near-surface temperature. Precipitation and fires are NASA’s latest published images. The other three are the first frame of an animation, not a verified latest observation.",
  "The home page introduces the maps and links to every other page. The Live Map is where the music is made: choose a map, move between 48 regions, and press Play remix. Nothing plays until you do. The Layer explorer stacks the five maps on one silent world map. Earth data describes each map in detail. Accessibility and help lists every key and voice command.",
  "On this page you can say next or previous to move between sections, say a map name, say photo, or say page overview. Say stop speaking to quiet the voice, or stop listening to turn the microphone off.",
];

const DESTINATIONS = [
  {
    view: "music",
    title: "Live Map",
    text: "Choose a map, move between 48 regions, and hear the recording respond. All sound settings live here.",
    note: "Silent until you press Play remix.",
    photo: SPACE_PHOTOS.night,
    Icon: IconPlay,
  },
  {
    view: "layers",
    title: "Layer explorer",
    text: "Stack the five NASA maps on one world map. Show, hide, or focus on any layer.",
    note: "No sound on this page.",
    photo: SPACE_PHOTOS.marble,
    Icon: IconLayers,
  },
  {
    view: "data",
    title: "Earth data",
    text: "What each map shows, where it comes from, and exactly how it changes the music.",
    note: "Includes every NASA source link.",
    photo: asset("precipitation.png"),
    Icon: IconGlobe,
  },
  {
    view: "access",
    title: "Accessibility & help",
    text: "Keyboard keys, voice commands, display options, and how the site works with a screen reader.",
    note: "Report a barrier from here.",
    photo: SPACE_PHOTOS.limb,
    Icon: IconKeyboard,
  },
];

function probePhoto(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = url;
  });
}

export default function GuidePage() {
  const [status, setStatus] = useState("");
  const [voiceHint, setVoiceHint] = useState("Voice is off. Start voice, then say next, previous, a map name, photo, or page overview.");
  const [listening, setListening] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [lastSection, setLastSection] = useState("overview");
  const dialogRef = useRef(null);
  const dialogTitleRef = useRef(null);
  const openOverviewRef = useRef(null);
  const voiceRef = useRef(null);
  const runRef = useRef(() => false);

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
    const section = focusHeading(sectionId);
    if (section) setLastSection(section.id);
    if (map) document.getElementById(map.id)?.querySelector("h3")?.focus();
    const label = map?.label || HOME_SECTIONS.find(([sectionName]) => sectionName === sectionId)?.[1] || id;
    let message = `${label}.`;
    if (map) message = `${map.label}. In the musical remix: ${map.planned}`;
    if (sectionId === "photo" && !photo) message = `${message} Today’s photo has not been posted yet. Please check back soon.`;
    if (!quiet) announce(message);
    return message;
  }

  function step(direction) {
    const index = Math.max(0, HOME_SECTIONS.findIndex(([id]) => id === lastSection));
    const next = index + direction;
    if (next < 0) {
      goTo(HOME_SECTIONS[0][0], true);
      announce("Already at the start of the page.");
      return "Already at the start of the page.";
    }
    if (next >= HOME_SECTIONS.length) {
      goTo(HOME_SECTIONS[HOME_SECTIONS.length - 1][0], true);
      announce("Already at the end of the page.");
      return "Already at the end of the page.";
    }
    return goTo(HOME_SECTIONS[next][0]);
  }

  function openOverview() {
    setOverviewOpen(true);
    window.setTimeout(() => dialogTitleRef.current?.focus(), 0);
  }

  function stopSpeaking() {
    window.speechSynthesis?.cancel();
    setVoiceHint("Stopped speaking.");
    announce("Stopped speaking.");
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
    const heard = normalizeHeard(phrase);
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
      stopSpeaking();
      return true;
    }
    const name = matchCommand(heard);
    if (!name) return false;
    const actions = {
      next: () => step(1),
      previous: () => step(-1),
      "page overview": () => {
        openOverview();
        return OVERVIEW.join("\n");
      },
      "immersive listening": () => goToView("music"),
      move: () => goToView("access", "keys"),
      "turn left": () => goToView("music", "map-navigation"),
      "turn right": () => goToView("music", "map-navigation"),
      recenter: () => goToView("music", "map-navigation"),
      "test tones": () => goToView("music", "map-navigation"),
    };
    const result = actions[name] ? actions[name]() : goTo(name);
    if (typeof result === "string") speak(result);
    return true;
  };

  useEffect(() => {
    let cancel = false;
    const folder = `${import.meta.env.BASE_URL}photo-of-the-day/`;
    const files = ["photo.jpg", "photo.jpeg", "photo.png", "photo.webp", "photo.gif"];
    (async () => {
      let text = "";
      try {
        const response = await fetch(`${folder}caption.txt`);
        if (response.ok) text = (await response.text()).trim();
      } catch {
        text = "";
      }
      for (const file of files) {
        const url = `${folder}${file}`;
        if (await probePhoto(url)) {
          if (!cancel) setPhoto({ url, text });
          return;
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

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

  function toggleVoice() {
    if (listening) {
      voiceRef.current?.stop();
      setListening(false);
    } else {
      voiceRef.current?.start().then((started) => setListening(Boolean(started)));
    }
  }

  return (
    <div className="site-page">
      <a className="skip-link" href="#overview-title">Skip to content</a>
      <SiteChrome current="home" part="header" />
      <div id="status" className="visually-hidden" role="status">{status}</div>
      <main id="main">
        <section className="home-hero" id="overview" aria-labelledby="overview-title">
          <div className="hero-copy">
            <p className="eyebrow">Earth Information Center · NASA Space Apps 2026</p>
            <h1 id="overview-title" tabIndex={-1}>Hear Earth, not only see it</h1>
            <p className="lede">Five NASA views of our planet, each described in words and turned into one shared piece of music. Explore by mouse, keyboard, screen reader, or voice.</p>
            <div className="actions">
              <a className="button button-light" {...linkTo("music")}>Open the Live Map</a>
              <a className="button button-outline-light" {...linkTo("layers")}>Explore the layers</a>
              <button type="button" className="button button-outline-light" ref={openOverviewRef} aria-haspopup="dialog" aria-controls="overview-dialog" onClick={openOverview}>Read page overview</button>
            </div>
            <ul className="hero-assist" aria-label="Ways to use this site">
              <li><IconKeyboard /> Keyboard and screen reader</li>
              <li><IconMic /> Voice control</li>
              <li><IconEye /> Color-blind colors and dark mode</li>
              <li><a {...linkTo("access")}>Accessibility &amp; help</a></li>
            </ul>
          </div>
          <figure className="hero-globe">
            <img src={SPACE_PHOTOS.marble} width="640" height="640" alt="" />
            <figcaption>NASA photograph of Earth, for atmosphere only. Not a data map.</figcaption>
          </figure>
        </section>

        <section className="assist-strip" aria-labelledby="assist-title">
          <div className="assist-inner">
            <div className="assist-label">
              <IconSpeaker />
              <div>
                <h2 id="assist-title">Listen and speak</h2>
                <p>Hear this page read aloud, or turn on voice and say where you want to go.</p>
              </div>
            </div>
            <div className="assist-actions" role="group" aria-label="Listening and voice controls">
              <button type="button" className="button button-secondary" onClick={() => { openOverview(); speak(OVERVIEW.join(" ")); }}><IconPlay /> Play overview</button>
              <button type="button" className="button button-quiet" onClick={stopSpeaking}><IconStop /> Stop speaking</button>
              <button type="button" className="button button-secondary" aria-pressed={listening} aria-describedby="voice-hint" onClick={toggleVoice}><IconMic /> {listening ? "Stop voice" : "Start voice"}</button>
              <span className="button-group" role="group" aria-label="Move between sections">
                <button type="button" className="button button-quiet" onClick={() => step(-1)}><IconPrev /> Previous section</button>
                <button type="button" className="button button-quiet" onClick={() => step(1)}>Next section <IconNext /></button>
              </span>
            </div>
          </div>
          <p id="voice-hint" className="assist-hint">{voiceHint}</p>
        </section>

        <section className="band" id="maps" aria-labelledby="maps-title">
          <div className="section-head-row">
            <div className="section-head">
              <p className="eyebrow">Earth data</p>
              <h2 id="maps-title" tabIndex={-1}>Five maps, one piece of music</h2>
              <p>Each map comes from NASA’s Scientific Visualization Studio. On the Live Map, the estimated values under each region shape one shared recording.</p>
            </div>
            <a className="section-link" {...linkTo("data")}>About every map <IconArrow /></a>
          </div>
          <div className="map-grid five" id="map-list">
            {MAPS.map((map) => (
              <article className="map-card" id={map.id} key={map.id}>
                <figure>
                  <img src={map.src} width={map.width} height={map.height} alt={map.alt} loading="lazy" />
                </figure>
                <div className="card-body">
                  <h3 tabIndex={-1}>{map.title}</h3>
                  <p className="card-text">{map.text}</p>
                  <p className="remix"><span className="tag">In the music</span>{map.short}</p>
                  <p className="card-links">
                    <a {...linkTo("data", map.id)}>Details and source<span className="visually-hidden"> for {map.label.toLowerCase()}</span></a>
                    <a {...linkTo("music")}>Hear<span className="visually-hidden"> {map.label.toLowerCase()}</span><span aria-hidden="true"> it</span> on the Live Map</a>
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="band band-tint" id="explore" aria-labelledby="explore-title">
          <div className="section-head">
            <p className="eyebrow">Explore</p>
            <h2 id="explore-title" tabIndex={-1}>Where to go next</h2>
            <p>The music and all of its settings live on the Live Map. The other pages are silent reading and viewing.</p>
          </div>
          <ul className="tile-grid four">
            {DESTINATIONS.map(({ view, title, text, note, photo: picture, Icon }) => (
              <li key={view}>
                <a className="dest" {...linkTo(view)}>
                  <span className="dest-photo" aria-hidden="true"><img src={picture} alt="" loading="lazy" /><span className="dest-icon"><Icon /></span></span>
                  <span className="dest-body">
                    <strong>{title}</strong>
                    <span>{text}</span>
                    <span className="dest-note">{note}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className="band" id="photo" aria-labelledby="photo-title">
          <div className="section-head">
            <p className="eyebrow">Today</p>
            <h2 id="photo-title" tabIndex={-1}>Space photo of the day</h2>
            <p>A new view of Earth or space, with a written description of what it shows.</p>
          </div>
          {photo ? (
            <figure className="photo-feature">
              <img src={photo.url} alt={photo.text || "Space photo of the day. Add caption.txt in the photo folder so this picture can be described."} />
              <figcaption>{photo.text || "Add caption.txt next to the photo so people who cannot see it know what it shows."}</figcaption>
            </figure>
          ) : (
            <div className="placeholder">
              <p>Today’s photo has not been posted yet. Please check back soon.</p>
              <p className="placeholder-note">Save the picture as photo.jpg in the photo-of-the-day folder, and describe it in caption.txt.</p>
            </div>
          )}
        </section>

        <section className="band band-dark" id="everyone" aria-labelledby="everyone-title">
          <div className="section-head-row">
            <div className="section-head">
              <p className="eyebrow">For everyone</p>
              <h2 id="everyone-title" tabIndex={-1}>Built for everyone</h2>
              <p>Blind and low-vision visitors, people who cannot read color maps, and anyone using a keyboard or their voice can use every page.</p>
            </div>
            <a className="section-link" {...linkTo("access")}>Accessibility &amp; help <IconArrow /></a>
          </div>
          <ul className="everyone-grid">
            <li><IconKeyboard /><div><strong>Keyboard and screen reader</strong><p>Every control works from the keyboard, with a visible focus outline. Changes are announced.</p></div></li>
            <li><IconMic /><div><strong>Voice control</strong><p>Press Start voice, then say where to go. Speech is recognized on this computer and never sent online.</p></div></li>
            <li><IconEye /><div><strong>Color-blind colors and dark mode</strong><p>At the top of every page. NASA map pictures keep their published colors.</p></div></li>
            <li><IconSpeaker /><div><strong>Silent until you press Play</strong><p>The Live Map makes no sound until you choose Play remix. What you hear is also written out.</p></div></li>
          </ul>
        </section>
      </main>
      <SiteChrome current="home" part="footer" />
      <dialog id="overview-dialog" ref={dialogRef} aria-labelledby="overview-dialog-title" onClose={() => { setOverviewOpen(false); openOverviewRef.current?.focus(); }}>
        <h2 id="overview-dialog-title" ref={dialogTitleRef} tabIndex={-1}>Page overview</h2>
        <div id="page-overview">{OVERVIEW.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
        <button type="button" className="button button-primary" onClick={() => setOverviewOpen(false)}>Close</button>
      </dialog>
    </div>
  );
}
