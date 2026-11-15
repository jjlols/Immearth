import { useEffect } from "react";
import "./intro-overlay.css";

const FOCUS_AFTER = {
  home: "#overview-title",
  music: "#music-title",
  layers: "#page-title",
  photo: "#photo-folder-title",
};

// The music page must stay silent until Play remix, so only Home keeps the drop sound.
export default function IntroOverlay({ view }) {
  useEffect(() => {
    let stop = () => {};
    let cancel = false;
    import("../site/intro.js").then((intro) => {
      if (cancel) return;
      stop = intro.startIntro({ sound: view === "home", focusAfter: FOCUS_AFTER[view] }) || (() => {});
    });
    return () => {
      cancel = true;
      stop();
    };
  }, [view]);

  return (
    <div className="intro-overlay" id="intro">
      <canvas id="intro-canvas" aria-hidden="true" />
      <p className="intro-status" role="status">Opening animation. Press Space, Escape, or Skip, or click the animation, to enter the site.</p>
      <button type="button" className="intro-skip" id="intro-skip">Skip</button>
    </div>
  );
}
