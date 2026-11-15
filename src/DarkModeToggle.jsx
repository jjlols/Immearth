import { useEffect, useState } from "react";

const STORAGE_KEY = "immearth-theme";

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "dark";
  } catch {
    return false;
  }
}

function applyTheme(on) {
  if (on) document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", on ? "#071422" : "#0b3d91");
  try {
    localStorage.setItem(STORAGE_KEY, on ? "dark" : "light");
  } catch {
    /* Preference still applies for this visit. */
  }
}

export default function DarkModeToggle() {
  const [on, setOn] = useState(readStored);
  const [note, setNote] = useState("");

  useEffect(() => {
    applyTheme(on);
  }, [on]);

  function toggle() {
    setOn((current) => {
      const next = !current;
      setNote(next ? "Dark mode on." : "Dark mode off.");
      return next;
    });
  }

  return (
    <>
      <button type="button" className="cvd-toggle theme-toggle" aria-pressed={on} onClick={toggle}>
        {on ? "Light mode" : "Dark mode"}
      </button>
      <span className="sr-only" role="status">{note}</span>
    </>
  );
}
