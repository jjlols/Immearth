import { useEffect, useRef } from "react";
import SiteChrome from "../SiteChrome.jsx";
import { SPACE_PHOTOS } from "../SpaceWash.jsx";
import { linkTo } from "../navigation.js";
import { IconArrow, IconEye, IconGlobe, IconKeyboard, IconMic, IconPlay, IconSpeaker } from "../Icons.jsx";
import { MAPS, asset } from "./maps.js";
import HomeLivePreview from "../HomeLivePreview.jsx";
import ListenSpeak from "./ListenSpeak.jsx";

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

export default function GuidePage() {
  const openOverviewRef = useRef(null);

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

  function openOverview() {
    window.dispatchEvent(new Event("immearth-open-overview"));
  }

  return (
    <div className="site-page">
      <a className="skip-link" href="#overview-title">Skip to content</a>
      <SiteChrome current="home" part="header" />
      <ListenSpeak />
      <main id="main">
        <section className="home-hero" id="overview" aria-labelledby="overview-title">
          <div className="hero-copy">
            <p className="eyebrow">Earth Information Center · NASA Space Apps 2026</p>
            <h1 id="overview-title" tabIndex={-1}>Hear Earth, not only see it</h1>
            <p className="lede">Five NASA views of our planet, each described in words and turned into one shared piece of music. Explore by mouse, keyboard, screen reader, or voice.</p>
            <div className="actions">
              <a className="button button-light" {...linkTo("music")}>Open the Live Map</a>
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
          </figure>
        </section>

        <section className="band" id="live-preview" aria-labelledby="live-preview-title">
          <HomeLivePreview />
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
            <li><IconMic /><div><strong>Voice control</strong><p>Press Start voice, then say where to go. The microphone stays off until you do. Speech stays on this computer when the browser can recognize it there.</p></div></li>
            <li><IconEye /><div><strong>Color-blind colors and dark mode</strong><p>At the top of every page. NASA map pictures keep their published colors.</p></div></li>
            <li><IconSpeaker /><div><strong>Sound you can turn off</strong><p>The home page preview plays the Live Map music when you arrive. Pause stops it. The full Live Map stays silent until you press Play remix, and what you hear is also written out.</p></div></li>
          </ul>
        </section>
      </main>
      <SiteChrome current="home" part="footer" />
    </div>
  );
}
