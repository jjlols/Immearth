import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { TOUR_STEPS, placeTourCard, readTour, rememberTourStep, finishTour } from "../lib/liveTour.js";

function introIsGone() {
  return typeof document === "undefined" || !document.getElementById("intro");
}

export default function LiveTour() {
  const saved = readTour(typeof localStorage === "undefined" ? { getItem: () => null } : localStorage);
  const [show, setShow] = useState(saved.show);
  const [step, setStep] = useState(saved.step);
  const [ready, setReady] = useState(false);
  const [box, setBox] = useState(null);
  const cardRef = useRef(null);

  useEffect(() => {
    if (!show) return undefined;
    if (introIsGone()) { setReady(true); return undefined; }
    const watch = new MutationObserver(() => {
      if (introIsGone()) setReady(true);
    });
    watch.observe(document.body, { childList: true, subtree: true });
    return () => watch.disconnect();
  }, [ready, show]);

  useLayoutEffect(() => {
    if (!show || !ready) return undefined;
    const node = document.querySelector(TOUR_STEPS[step].target);
    const card = cardRef.current;
    if (!node || !card) return undefined;
    node.classList.add("tour-target");
    node.scrollIntoView({ block: "center", inline: "nearest" });
    const place = () => {
      const target = node.getBoundingClientRect();
      const size = card.getBoundingClientRect();
      const header = document.querySelector(".nasa-header")?.getBoundingClientRect().bottom ?? 12;
      setBox(placeTourCard(target, size, { width: window.innerWidth, height: window.innerHeight, topLimit: Math.max(12, header + 8) }));
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      node.classList.remove("tour-target");
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [show, ready, step]);

  if (!show || !ready) return null;
  const current = TOUR_STEPS[step];
  const last = step === TOUR_STEPS.length - 1;

  function go(next) {
    const clamped = Math.max(0, Math.min(TOUR_STEPS.length - 1, next));
    setStep(clamped);
    rememberTourStep(localStorage, clamped);
  }

  function finish() {
    finishTour(localStorage);
    document.querySelector(".tour-target")?.classList.remove("tour-target");
    setShow(false);
  }

  return (
    <div
      ref={cardRef}
      className="live-tour"
      data-side={box?.side || "right"}
      role="dialog"
      aria-modal="false"
      aria-labelledby="tour-title"
      style={box ? { top: box.top, left: box.left, "--tour-arrow": `${box.arrow}px` } : { visibility: "hidden" }}
    >
      <span className="live-tour-arrow" aria-hidden="true" />
      <p className="live-tour-badge">Tour</p>
      <p className="live-tour-count">Step {step + 1} of {TOUR_STEPS.length}</p>
      <h2 id="tour-title">{current.title}</h2>
      <p>{current.body}</p>
      <div className="live-tour-actions">
        <button type="button" className="live-tour-back" onClick={() => go(step - 1)} disabled={step === 0}>Back</button>
        {last
          ? <button type="button" id="tour-next" className="live-tour-next" onClick={finish}>Finish</button>
          : <button type="button" id="tour-next" className="live-tour-next" onClick={() => go(step + 1)}>Next</button>}
      </div>
    </div>
  );
}
