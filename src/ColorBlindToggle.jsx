import { useEffect, useState } from "react";

const STORAGE_KEY = "earth-jukebox-cvd";

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "safe";
  } catch {
    return false;
  }
}

function applyMode(on) {
  if (on) document.documentElement.dataset.cvd = "safe";
  else delete document.documentElement.dataset.cvd;
  try {
    localStorage.setItem(STORAGE_KEY, on ? "safe" : "");
  } catch {
    /* Preference still applies for this visit. */
  }
}

export default function ColorBlindToggle() {
  const [on, setOn] = useState(readStored);
  const [note, setNote] = useState("");

  useEffect(() => {
    applyMode(on);
  }, [on]);

  function toggle() {
    setOn((current) => {
      const next = !current;
      setNote(next
        ? "Color blind colors on. Each layer uses a blue or orange mark and its own pattern. NASA map pictures stay in their published colors."
        : "Color blind colors off.");
      return next;
    });
  }

  return (
    <>
      <button type="button" className="cvd-toggle" aria-pressed={on} aria-describedby="cvd-help" onClick={toggle}>
        Color blind colors
      </button>
      <span id="cvd-help" className="sr-only">Switches the interface to blue, orange, and patterns. NASA map pictures keep their published colors, and the written descriptions stay available.</span>
      <span className="sr-only" role="status">{note}</span>
    </>
  );
}
