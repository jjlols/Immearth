export const VIEWS = ["home", "music", "layers"];

export function viewFromLocation() {
  const view = new URLSearchParams(window.location.search).get("view");
  if (view === "guide") return "home";
  return VIEWS.includes(view) ? view : "home";
}

export function hrefFor(view) {
  const next = view === "guide" ? "home" : view;
  if (next === "home") return "./";
  return `?view=${next}`;
}

export function goToView(view, hash = "") {
  const next = view === "guide" ? "home" : (VIEWS.includes(view) ? view : "home");
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
