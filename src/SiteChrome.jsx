import { goToView, hrefFor } from "./navigation.js";
import ColorBlindToggle from "./ColorBlindToggle.jsx";
import EarthRecord from "./EarthRecord.jsx";

const NAV = [
  { view: "home", label: "Home" },
  { view: "music", label: "Live Map" },
  { view: "layers", label: "Layer explorer" },
  { view: "music", label: "How to use the map", hash: "map-navigation" },
  { view: "home", label: "Help", hash: "move" },
];

function linkProps({ view, hash }) {
  return {
    href: hash ? `${hrefFor(view)}#${hash}` : hrefFor(view),
    onClick: (event) => {
      event.preventDefault();
      goToView(view, hash);
    },
  };
}

export default function SiteChrome({ current, part = "both" }) {
  const header = part !== "footer";
  const footer = part !== "header";
  return (
    <>
      {header && (
        <header className="site-header has-spectrum">
          <div className="notice notice-with-tools">
            <p>A NASA Space Apps Challenge 2026 project. This is not an official NASA website.</p>
            <div className="site-tools">
              <ColorBlindToggle />
            </div>
          </div>
          <div className="bar">
            <a className="wordmark" {...linkProps({ view: "home" })}>
              <span className="mark" aria-hidden="true"><EarthRecord /></span>
              <span className="wordmark-text">Earth Jukebox</span>
            </a>
            <nav className="primary-nav" aria-label="Main">
              <ul>
                {NAV.map((item) => (
                  <li key={item.label}>
                    <a
                      {...linkProps(item)}
                      aria-current={!item.hash && item.view === current ? "page" : undefined}
                    >
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
        <footer className="site-footer">
          <div className="footer-inner">
            <div>
              <p className="footer-title">Earth Information Jukebox</p>
              <p>A NASA Space Apps Challenge project. Not an official NASA website.</p>
              <p>Music: “Deliberate Thought” by Kevin MacLeod, <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0 (opens in a new tab)</a>.</p>
            </div>
          </div>
        </footer>
      )}
    </>
  );
}
