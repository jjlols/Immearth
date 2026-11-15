import SiteChrome from "../SiteChrome.jsx";
import SpaceWash, { SPACE_PHOTOS } from "../SpaceWash.jsx";
import { linkTo } from "../navigation.js";
import { IconEye, IconKeyboard, IconLayers, IconMic, IconPlay, IconSpeaker } from "../Icons.jsx";
import { COMMAND_NAMES } from "./voiceCommands.js";

export default function AccessPage() {
  return (
    <div className="site-page">
      <a className="skip-link" href="#access-title">Skip to content</a>
      <SiteChrome current="access" part="header" />
      <main id="main">
        <section className="page-banner" aria-labelledby="access-title">
          <SpaceWash photo={SPACE_PHOTOS.limb} />
          <div className="page-banner-inner">
            <p className="eyebrow">For everyone</p>
            <h1 id="access-title" tabIndex={-1}>Accessibility &amp; help</h1>
            <p className="lede">This site is built to work for people who are blind or have low vision, people who cannot read color maps, and anyone using a keyboard or their voice instead of a mouse. Every page works with a mouse, a keyboard, a screen reader, or voice.</p>
          </div>
        </section>

        <section className="band" id="keys" aria-labelledby="keys-title">
          <div className="section-head">
            <p className="eyebrow">Keyboard</p>
            <h2 id="keys-title" tabIndex={-1}>Keys on every page</h2>
            <p>Buttons and keys do the same things, so use whichever works best for you. The first Tab stop on every page is a Skip link that jumps past the menu.</p>
          </div>
          <div className="split">
            <div className="tile">
              <h3><IconKeyboard /> Everywhere</h3>
              <ul className="key-list">
                <li><kbd>Tab</kbd> <span>Move to the next link, button, slider, or search box. The first stop is the Skip link.</span></li>
                <li><kbd>Enter</kbd> <span>Follow a link or press a button.</span></li>
                <li><kbd>Esc</kbd> <span>Close the page overview, or stop focusing on one layer.</span></li>
              </ul>
              <p>The menu at the top of every page has Home, Live Map, Earth data, and Accessibility &amp; help. The Layer explorer is linked from the home page and the footer.</p>
              <p>Dark mode and Color blind colors are at the top of every page. Your choices are remembered on this browser. NASA map pictures keep their published colors either way.</p>
            </div>
            <div className="tile">
              <h3><IconPlay /> Live Map</h3>
              <p>Nothing plays until you press Play remix. Pause, Reset, Mute, and Master volume are next to it. Headphones are recommended.</p>
              <ul className="key-list">
                <li><kbd>W ↑</kbd> <span>Move one region north.</span></li>
                <li><kbd>A ←</kbd> <span>Move one region west.</span></li>
                <li><kbd>S ↓</kbd> <span>Move one region south.</span></li>
                <li><kbd>D →</kbd> <span>Move one region east.</span></li>
                <li><kbd>Home</kbd> <span>Go back to region 1.</span></li>
              </ul>
              <p>The 48 regions are a grid of 6 rows and 8 columns. These keys do nothing while you are on a button, link, slider, or search box. Each move is described in words. Moving changes the music only while it is already playing.</p>
            </div>
            <div className="tile">
              <h3><IconLayers /> Layer explorer</h3>
              <ul className="key-list">
                <li><kbd>↑ ↓</kbd> <span>In the layer list, move between the five layers.</span></li>
                <li><kbd>Home End</kbd> <span>Jump to the first or last layer.</span></li>
                <li><kbd>Enter</kbd> <span>Focus on the selected layer; press again to show all of them.</span></li>
                <li><kbd>Esc</kbd> <span>Stop focusing on one layer and show all of them again.</span></li>
              </ul>
              <p>This page makes no sound.</p>
            </div>
            <div className="tile">
              <h3><IconSpeaker /> Home page</h3>
              <p>Play overview reads a spoken summary of the site. Previous section and Next section move through the home page from top to bottom: the Live Map preview, the five maps, where to go next, then Built for everyone.</p>
              <p>Read page overview opens the same summary as text in a dialog. Press Escape or Close to return to where you were.</p>
            </div>
          </div>
        </section>

        <section className="band band-tint" id="voice" aria-labelledby="voice-title">
          <div className="section-head">
            <p className="eyebrow">Voice</p>
            <h2 id="voice-title" tabIndex={-1}>Voice commands</h2>
            <p>On the <a {...linkTo("home")}>home page</a>, press Start voice, then say one of these. The microphone turns on only after you press Start voice, and Stop voice turns it off.</p>
          </div>
          <div className="split">
            <div className="tile">
              <h3><IconMic /> What you can say</h3>
              <ul className="command-list">
                {COMMAND_NAMES.map((name) => <li key={name}>{name}</li>)}
              </ul>
              <p style={{ marginTop: "1rem" }}>You can also say rain, fires, heat, read the overview, live map, keyboard, or stop speaking. Say stop listening to turn the microphone off.</p>
            </div>
            <div className="tile">
              <h3>How recognition works</h3>
              <p>Your speech is recognized on this computer by sherpa-onnx, an open-source keyword spotter that listens only for this site’s commands. It is not sent to an online service.</p>
              <p>Voice needs the project server running alongside the site. If it is not running, the page says so and every command remains available as a button or link.</p>
            </div>
          </div>
        </section>

        <section className="band" id="display" aria-labelledby="display-title">
          <div className="section-head">
            <p className="eyebrow">Display and sound</p>
            <h2 id="display-title" tabIndex={-1}>Display options and sound</h2>
          </div>
          <div className="split">
            <div className="tile">
              <h3><IconEye /> Color blind colors and dark mode</h3>
              <p>Color blind colors switches the interface to blue, orange, and patterns so that layers are never told apart by hue alone. Dark mode darkens the page chrome. Both are at the top of every page and are remembered on this browser. NASA map pictures stay in their published colors.</p>
              <p>Text can be enlarged and the layout reflows on narrow screens and at high zoom. Links in text are underlined, and meaning is never shown by color alone.</p>
            </div>
            <div className="tile">
              <h3><IconSpeaker /> Sound</h3>
              <p>The Live Map stays silent until you press Play remix. What you hear is also written out in words, so the music can be followed without sound. Pause suspends the music, and Reset stops it.</p>
              <p>An opening animation plays when you arrive. Press Space, Escape, or Skip, or click the animation, and it fades away. It stays off when your device is set to reduce motion.</p>
            </div>
          </div>
        </section>

        <section className="band band-tint" id="checklist" aria-labelledby="checklist-title">
          <div className="section-head">
            <p className="eyebrow">Commitments</p>
            <h2 id="checklist-title" tabIndex={-1}>What this site promises</h2>
          </div>
          <ul className="checks">
            <li>Text and buttons meet the enhanced contrast level, at least 7 to 1.</li>
            <li>Every control works from the keyboard and shows a clear focus outline.</li>
            <li>Links in text are underlined. Meaning is never shown by color alone.</li>
            <li>Each map has a written description of what the picture shows, plus its source.</li>
            <li>Text can be enlarged, and the layout reflows on narrow screens and at high zoom.</li>
            <li>Search results, section changes, and music changes are announced to screen readers.</li>
            <li>The microphone turns on only after you press Start voice. Speech is recognized on this computer.</li>
            <li>The Live Map stays silent until you press Play remix. What you hear is also written out.</li>
            <li>Color blind colors and Dark mode are at the top of every page and are remembered.</li>
            <li>No location, camera, or microphone permission is requested for exploring the maps.</li>
          </ul>
          <p className="feedback">Found a barrier? <a href="https://github.com/jjlols/NASA-SPACE-APP/issues" target="_blank" rel="noreferrer">Report an accessibility problem <span className="visually-hidden">(opens in a new tab)</span></a>.</p>
        </section>
      </main>
      <SiteChrome current="access" part="footer" />
    </div>
  );
}
