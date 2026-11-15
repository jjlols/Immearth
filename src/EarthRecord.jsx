import "./earth-record.css";

export default function EarthRecord() {
  return (
    <svg className="corner-earth" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="32" fill="#1a73c7" />
      <ellipse cx="22" cy="28" rx="8" ry="13" fill="#2f9e4f" />
      <ellipse cx="24" cy="44" rx="5" ry="7" fill="#248a42" />
      <ellipse cx="40" cy="24" rx="7" ry="9" fill="#3cb564" />
      <ellipse cx="43" cy="40" rx="9" ry="6" fill="#2a8f48" />
      <ellipse cx="34" cy="48" rx="3.5" ry="2.4" fill="#57c070" />
      <ellipse cx="16" cy="16" rx="7" ry="2.4" fill="rgba(255,255,255,0.45)" />
    </svg>
  );
}
