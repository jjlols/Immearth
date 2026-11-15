import { linkTo } from "./navigation.js";
import ColorBlindToggle from "./ColorBlindToggle.jsx";
import DarkModeToggle from "./DarkModeToggle.jsx";
import EarthRecord from "./EarthRecord.jsx";
import { MAPS } from "./guide/maps.js";

/* The Layer explorer stays reachable from the home page and footer, not the top-level menu. */
const NAV = [
  { view: "home", label: "Home" },
  { view: "music", label: "Live Map" },
  { view: "data", label: "Earth data" },
  { view: "access", label: "Accessibility & help" },
];

const FOOTER_PAGES = [
  { view: "home", label: "Home" },
  { view: "music", label: "Live Map" },
  { view: "layers", label: "Layer explorer" },
  { view: "data", label: "Earth data" },
  { view: "access", label: "Accessibility & help" },
  { view: "access", label: "Keyboard and voice commands", hash: "keys" },
];

export default function SiteChrome({ current, part = "both" }) {
  const header = part !== "footer";
  const footer = part !== "header";
  return (
    <>
      {header && (
        <header className="nasa-header">
          <div className="nasa-notice">
            <p>A NASA Space Apps Challenge 2026 project. This is not an official NASA website.</p>
            <div className="site-tools" role="group" aria-label="Display options">
              <DarkModeToggle />
              <ColorBlindToggle />
            </div>
          </div>
          <div className="nasa-bar">
            <a className="wordmark" {...linkTo("home")}>
              <span className="mark" aria-hidden="true"><EarthRecord /></span>
              <span className="wordmark-text">
                <span className="wordmark-name">Immearth</span>
                <span className="wordmark-sub">Earth Information Jukebox</span>
              </span>
            </a>
            <nav className="primary-nav" aria-label="Main">
              <ul>
                {NAV.map((item) => (
                  <li key={item.label}>
                    <a {...linkTo(item.view, item.hash)} aria-current={!item.hash && item.view === current ? "page" : undefined}>
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </header>
      )}
      {footer && (
        <footer className="nasa-footer">
          <div className="footer-inner">
            <div className="footer-brand">
              <p className="footer-title"><span className="mark" aria-hidden="true"><EarthRecord /></span> Immearth</p>
              <p>Five NASA Earth maps, described in words and turned into one shared piece of music. Built for the NASA Space Apps Challenge. Not an official NASA website.</p>
              <p className="footer-credit">Music: “Deliberate Thought” by Kevin MacLeod (incompetech.com), <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0 (opens in a new tab)</a>. Maps: NASA Scientific Visualization Studio. Coastlines: Natural Earth.</p>
            </div>
            <nav className="footer-col" aria-labelledby="footer-pages">
              <p className="footer-heading" id="footer-pages">Explore</p>
              <ul>
                {FOOTER_PAGES.map((item) => (
                  <li key={item.label}><a {...linkTo(item.view, item.hash)}>{item.label}</a></li>
                ))}
              </ul>
            </nav>
            <nav className="footer-col" aria-labelledby="footer-sources">
              <p className="footer-heading" id="footer-sources">NASA sources</p>
              <ul>
                {MAPS.map((map) => (
                  <li key={map.id}><a href={map.href} target="_blank" rel="noreferrer">{map.title} <span className="visually-hidden">(opens in a new tab)</span></a></li>
                ))}
              </ul>
            </nav>
            <div className="footer-col">
              <p className="footer-heading">Access</p>
              <ul>
                <li><a {...linkTo("access")}>How this site works for everyone</a></li>
                <li><a href="https://github.com/jjlols/NASA-SPACE-APP/issues" target="_blank" rel="noreferrer">Report an accessibility problem <span className="visually-hidden">(opens in a new tab)</span></a></li>
              </ul>
              <p className="footer-note">The microphone and camera turn on only when you ask. Nothing plays on the Live Map until you press Play remix.</p>
            </div>
          </div>
        </footer>
      )}
    </>
  );
}
