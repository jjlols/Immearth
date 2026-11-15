import { goToView, hrefFor } from "./navigation.js";

const LINKS = [
  ["music", "Music"],
  ["guide", "Guide"],
  ["layers", "Layer explorer"],
  ["photo", "Photo of the day"],
];

export default function PageSwitch({ current }) {
  return (
    <nav className="page-switch" aria-label="Pages" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem 0.9rem", alignItems: "center" }}>
      {LINKS.map(([view, label]) => (
        <a
          key={view}
          href={hrefFor(view)}
          aria-current={current === view ? "page" : undefined}
          onClick={(event) => {
            event.preventDefault();
            goToView(view);
          }}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
