/* Shared vocabulary for the home page voice session and the Accessibility & help page.
   Recognition happens on the local keyword spotter; this file only names the commands. */

export const HOME_SECTIONS = [
  ["overview", "Overview"],
  ["live-preview", "Live Map preview"],
  ["maps", "The five maps"],
  ["explore", "Explore the site"],
  ["everyone", "Built for everyone"],
];

export const SECTION_COMMAND = {
  overview: "overview",
  "live-preview": "live preview",
  maps: "maps",
  explore: "open a page",
  everyone: "accessibility",
};

export const MAP_COMMANDS = ["precipitation", "fires", "carbon monoxide", "nitrogen oxides", "temperature"];

export const ACTION_COMMANDS = [
  "next",
  "previous",
  "page overview",
  "immersive listening",
  "move",
  "turn left",
  "turn right",
  "recenter",
  "test tones",
];

export const COMMAND_NAMES = [
  ...HOME_SECTIONS.map(([id]) => SECTION_COMMAND[id]),
  ...MAP_COMMANDS,
  ...ACTION_COMMANDS,
];

export const ALIASES = {
  "read the overview": "page overview",
  "read overview": "page overview",
  "play overview": "page overview",
  "next section": "next",
  "previous section": "previous",
  back: "previous",
  "the maps": "maps",
  "go to the maps": "maps",
  "moving around": "move",
  movement: "move",
  keys: "move",
  keyboard: "move",
  help: "move",
  pages: "open a page",
  "open page": "open a page",
  explore: "open a page",
  rain: "precipitation",
  "active fires": "fires",
  fire: "fires",
  heat: "temperature",
  nox: "nitrogen oxides",
  "live map": "immersive listening",
  "open the live map": "immersive listening",
  "listening map": "immersive listening",
  "turn to the left": "turn left",
  "look left": "turn left",
  "face left": "turn left",
  "turn to the right": "turn right",
  "look right": "turn right",
  "face right": "turn right",
  "face forward": "recenter",
  "look forward": "recenter",
  center: "recenter",
  centre: "recenter",
  "play test tones": "test tones",
  "play the test tones": "test tones",
  "play tones": "test tones",
};

export const STOP_COMMANDS = ["stop speaking", "be quiet", "stop", "stop listening", "voice off", "stop test tones"];

export function hasPhrase(heard, phrase) {
  return new RegExp(`(?:^|\\s)${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`).test(heard);
}

export function normalizeHeard(phrase) {
  return phrase.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** Longest matching alias or command wins. Returns the canonical command name or null. */
export function matchCommand(heard) {
  const entries = [...COMMAND_NAMES.map((name) => [name, name]), ...Object.entries(ALIASES)];
  let best = null;
  entries.forEach(([alias, name]) => {
    if (hasPhrase(heard, alias) && (!best || alias.length > best.alias.length)) best = { alias, name };
  });
  return best ? best.name : null;
}
