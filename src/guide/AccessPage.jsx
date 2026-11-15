import SiteChrome from "../SiteChrome.jsx";
import SpaceWash, { SPACE_PHOTOS } from "../SpaceWash.jsx";
import { linkTo } from "../navigation.js";
import { IconEye, IconKeyboard, IconMic, IconPlay, IconSpeaker } from "../Icons.jsx";
import { COMMAND_NAMES } from "./voiceCommands.js";
import ListenSpeak from "./ListenSpeak.jsx";

export default function AccessPage() {
  return (
    <div className="site-page">
      <a className="skip-link" href="#access-title">Skip to content</a>
      <SiteChrome current="access" part="header" />
      <ListenSpeak />
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
                <li><kbd>L</kbd> <span>On the home page, play the recorded overview, or stop it if it is already playing. This key does nothing while you are on a button, link, or text field.</span></li>
                <li><kbd>N</kbd> <span>Open the next page. The order is Home, Live Map, Earth data, then Accessibility and help. A recorded voice names the page. This key does nothing on the last page, or while you are on a button, link, or text field.</span></li>
                <li><kbd>Esc</kbd> <span>Close the page overview.</span></li>
              </ul>
              <p>The menu at the top of every page has Home, Live Map, Earth data, and Accessibility &amp; help.</p>
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
              <h3><IconSpeaker /> Listen and speak</h3>
              <p>On the home page, Listen and speak sits under the title. Play overview plays a recorded reading, and L plays or stops it when you are not on a button or text field. N opens the next page and a recorded voice names it. On the Live Map, Earth data, and this page, Listen and speak keeps Stop speaking and Start voice.</p>
              <p>Read page overview on the home page opens the same summary as text. Press Escape or Close to return to where you were. Saying next or previous still moves through the home page sections.</p>
            </div>
          </div>
        </section>

        <section className="band band-tint" id="voice" aria-labelledby="voice-title">
          <div className="section-head">
            <p className="eyebrow">Voice</p>
            <h2 id="voice-title" tabIndex={-1}>Voice commands</h2>
            <p>On every page, press Start voice, then say one of these. The microphone turns on only after you press Start voice, and Stop voice turns it off.</p>
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
              <p>Start voice uses the speech recognition built into this browser, and it asks for the microphone in that same click. When the browser can recognize speech on this computer, the audio stays here. If it cannot, the page says it is using the browser’s speech service instead.</p>
              <p>Every command is also a button or a link, so the site still works if the microphone is unavailable.</p>
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

        <section className="band band-tint" id="head-travel" aria-labelledby="head-title">
          <div className="section-head">
            <p className="eyebrow">Camera</p>
            <h2 id="head-title" tabIndex={-1}>Spatial sound with your head</h2>
            <p>On the Live Map, after you press Play remix, Enable camera lets you preview the next region by turning or tilting your head. The camera stays off until you press that button. The picture is used on this computer and is not shown on the page.</p>
          </div>
          <div className="split">
            <div className="tile">
              <h3>How to look</h3>
              <ul className="key-list">
                <li><span>Face the camera. That first look is forward, and the sound stays centered.</span></li>
                <li><span>Turn left to preview west, right to preview east, up to preview north, and down to preview south.</span></li>
                <li><span>Come back to center within 1.5 seconds to take exactly one step. The marker stays on the current region while you look.</span></li>
                <li><span>Looking the same way again does not keep walking. A blocked edge does not invent a move.</span></li>
              </ul>
            </div>
            <div className="tile">
              <h3>What you hear</h3>
              <p>Headphones make the preview easier to place. A look shifts the same recording about two meters to that side. It does not use your location, and it does not turn latitude or longitude into pitch.</p>
              <p>Stop camera, look away, or press a region or a movement key, and the preview ends. Keyboard movement still works if the camera is off.</p>
            </div>
          </div>
        </section>

        <section className="band" id="assistive-apis" aria-labelledby="apis-title">
          <div className="section-head">
            <p className="eyebrow">How the page cooperates</p>
            <h2 id="apis-title" tabIndex={-1}>Assistive technology this site uses</h2>
            <p>The page is built so a screen reader, a keyboard, and the browser’s own speech tools can run the same controls a mouse can.</p>
          </div>
          <div className="split">
            <div className="tile">
              <h3>What a screen reader reads</h3>
              <p>Controls use the Accessible Rich Internet Applications names already built into the browser: buttons say when they are pressed, the current page is marked in the menu, and short updates go out through a live status region. Skip links are the first Tab stop. Meaning is written in text, not only in color.</p>
              <p>Display follows the visitor’s own settings for reduced motion, higher contrast, enlarged text, and a narrow screen. Dark mode and Color blind colors are stored in this browser only.</p>
            </div>
            <div className="tile">
              <h3>Speech, sound, and the camera</h3>
              <p>Start voice uses the browser speech-recognition interface. When that browser can recognize speech on this computer, the audio stays here. Otherwise the page says it is using the browser’s speech service. The recorded overview is an ordinary audio file, not a generated voice.</p>
              <p>The Live Map music uses the Web Audio interface: one shared recording, filters, and a panner for the head preview. Enable camera loads a face model that is stored with this site and reads head direction on this computer. No camera or microphone starts by itself.</p>
            </div>
          </div>
        </section>

        <section className="band band-tint" id="spoken-lines" aria-labelledby="spoken-title">
          <div className="section-head">
            <p className="eyebrow">Recorded voice</p>
            <h2 id="spoken-title" tabIndex={-1}>What the recorded voice says</h2>
            <p>Changing page and the overview play a recorded human voice. The generated computer voice stays silent. The other lines are written on the page for a screen reader.</p>
          </div>
          <div className="tile">
            <h3>Recorded voice</h3>
            <ul className="command-list">
              <li>Switching to home.</li>
              <li>Switching to live map.</li>
              <li>Switching to Earth data.</li>
              <li>Switching to accessibility and help.</li>
            </ul>
            <h3>Written, not spoken</h3>
            <ul className="command-list">
              <li>Overview.</li>
              <li>Live Map preview.</li>
              <li>Explore the site.</li>
              <li>The five maps.</li>
              <li>Built for everyone.</li>
              <li>Already at the start of the page.</li>
              <li>Already at the end of the page.</li>
              <li>Precipitation. In the musical remix: Rain and frozen precipitation each get their own gentle filtered swell on the recording. More matching pixels make the swells more frequent.</li>
              <li>Active fires. In the musical remix: Estimated fire radiative power, from 0 to 8 megawatts, opens a soft filtered accent with long rests between accents. It is not a count of fires.</li>
              <li>Carbon monoxide. In the musical remix: Higher estimated carbon monoxide, on steps of 40, 100, 130, 200, and 500 parts per billion, raises a low-frequency layer of the recording.</li>
              <li>Nitrogen oxides. In the musical remix: Higher estimated nitrogen oxides, ranked on a logarithmic scale from 0.001 to 10 parts per billion, open a filter so the recording sounds brighter.</li>
              <li>Temperature. In the musical remix: Estimated temperature, from −40 to +40 °C, sets the playback speed. Colder air plays the recording slower and lower. Warmer air plays it faster and higher.</li>
            </ul>
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
            <li>The microphone turns on only after you press Start voice. Speech stays on this computer when the browser can recognize it there.</li>
            <li>The Live Map stays silent until you press Play remix. What you hear is also written out.</li>
            <li>Color blind colors and Dark mode are at the top of every page and are remembered.</li>
            <li>The camera turns on only after Enable camera on the Live Map. The microphone turns on only after Start voice. Exploring the maps does not ask for your location.</li>
          </ul>
          <p className="feedback">Found a barrier? <a href="https://github.com/jjlols/NASA-SPACE-APP/issues" target="_blank" rel="noreferrer">Report an accessibility problem <span className="visually-hidden">(opens in a new tab)</span></a>.</p>
        </section>
      </main>
      <SiteChrome current="access" part="footer" />
    </div>
  );
}
