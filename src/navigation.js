export const VIEWS = ["home", "music", "data", "access"];

/* Older links keep working: ?view=guide, ?view=photo, and ?view=layers open the home page. */
const LEGACY = { guide: "home", photo: "home", layers: "home" };

export const VIEW_TITLES = {
  home: "Immearth",
  music: "Live Map · Immearth",
  data: "Earth data · Immearth",
  access: "Accessibility & help · Immearth",
};

export function normalizeView(view) {
  const next = LEGACY[view] || view;
  return VIEWS.includes(next) ? next : "home";
}

export function viewFromLocation() {
  return normalizeView(new URLSearchParams(window.location.search).get("view"));
}

export function hrefFor(view, hash = "") {
  const next = normalizeView(view);
  const base = next === "home" ? "./" : `?view=${next}`;
  return hash ? `${base}#${hash}` : base;
}

export function goToView(view, hash = "") {
  const next = normalizeView(view);
  const path = window.location.pathname;
  const url = `${next === "home" ? path : `${path}?view=${next}`}${hash ? `#${hash}` : ""}`;
  window.history.pushState({ view: next }, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.setTimeout(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }
    const node = document.getElementById(hash);
    if (!node) return;
    node.scrollIntoView();
    node.focus();
  }, 50);
}

/** Props for an in-app link: real href for middle-click/copy, pushState on plain click. */
export function linkTo(view, hash = "") {
  return {
    href: hrefFor(view, hash),
    onClick: (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      goToView(view, hash);
    },
  };
}
