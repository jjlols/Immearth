export const VIEWS = ["music", "guide", "layers", "photo"];

export function viewFromLocation() {
  const view = new URLSearchParams(window.location.search).get("view");
  return VIEWS.includes(view) ? view : "music";
}

export function hrefFor(view) {
  if (view === "music") return "./";
  return `?view=${view}`;
}

export function goToView(view) {
  const next = VIEWS.includes(view) ? view : "music";
  const path = window.location.pathname;
  const url = next === "music" ? path : `${path}?view=${next}`;
  window.history.pushState({ view: next }, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
