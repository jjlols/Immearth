const status = document.querySelector("#status");
const exploreButton = document.querySelector("#explore-button");
const nav = document.querySelector("#site-nav");
const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#site-search");
const cards = [...document.querySelectorAll(".card")];
const empty = document.querySelector("#map-empty");
const sections = [...document.querySelectorAll("[data-section]")];
const dialog = document.querySelector("#overview-dialog");
const openOverviewButton = document.querySelector("#open-overview");
const dialogTitle = document.querySelector("#overview-dialog-title");

let searchTimer = 0;
let lastMovedId = null;

function announce(message) {
  status.textContent = "";
  window.setTimeout(() => {
    status.textContent = message;
  }, 30);
}

function headingFor(element) {
  return element.querySelector("h1, h2, h3");
}

function goTo(id, quiet) {
  const element = document.getElementById(id) || document.querySelector(`[data-voice-command="${CSS.escape(id)}"]`);
  if (!element) return false;
  if (element.hidden) element.hidden = false;
  const heading = headingFor(element);
  const section = element.hasAttribute("data-section") ? element : element.closest("[data-section]");
  if (section) lastMovedId = section.id;
  heading.focus();
  let message = `${element.dataset.voiceLabel || heading.textContent}.`;
  const planned = element.classList.contains("card") ? element.querySelector(".planned") : null;
  if (planned) message = `${element.dataset.voiceLabel}. ${planned.textContent.trim()}`;
  const missingPhoto = document.querySelector("#photo-missing");
  if (element.id === "photo" && missingPhoto && !missingPhoto.hidden) {
    message = `${message} ${(missingPhoto.querySelector("p") || missingPhoto).textContent.trim()}`;
  }
  if (!quiet) announce(message);
  return message;
}

function sectionIndexNearView() {
  const line = window.scrollY + 96;
  let index = 0;
  sections.forEach((section, i) => {
    if (section.offsetTop <= line) index = i;
  });
  return index;
}

function step(direction) {
  const remembered = sections.findIndex((section) => section.id === lastMovedId);
  const near = sectionIndexNearView();
  const nextIndex = (remembered >= 0 ? remembered : near) + direction;
  if (nextIndex < 0) {
    goTo(sections[0].id, true);
    announce("Already at the start of the page.");
    return "Already at the start of the page.";
  }
  if (nextIndex >= sections.length) {
    goTo(sections[sections.length - 1].id, true);
    announce("Already at the end of the page.");
    return "Already at the end of the page.";
  }
  return goTo(sections[nextIndex].id);
}

function openOverview() {
  dialog.showModal();
  dialogTitle.focus();
}

function setMenu(open) {
  exploreButton.setAttribute("aria-expanded", String(open));
  nav.classList.toggle("is-open", open);
}

function applySearch() {
  const query = searchInput.value.trim().toLowerCase();
  let shown = 0;
  cards.forEach((card) => {
    const match = query.length === 0 || card.dataset.search.includes(query);
    card.hidden = !match;
    if (match) shown += 1;
  });
  empty.hidden = shown !== 0;
  const message = shown === 0
    ? `No maps match ${searchInput.value.trim()}.`
    : `Showing ${shown} of ${cards.length} maps.`;
  announce(message);
}

const commands = {};
document.querySelectorAll("[data-voice-command]").forEach((element) => {
  const name = element.dataset.voiceCommand;
  if (name === "next" || name === "previous") return;
  commands[name] = () => goTo(element.id);
});
commands.next = () => step(1);
commands.previous = () => step(-1);
commands["page overview"] = () => {
  openOverview();
  return overviewText();
};

const aliases = {
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
  "photo of the day": "photo",
  "space photo": "photo",
  "image of the day": "photo",
  "go to the photo": "photo",
  photos: "photo",
  picture: "photo",
  pictures: "photo",
  rain: "precipitation",
  "active fires": "fires",
  fire: "fires",
  heat: "temperature",
  nox: "nitrogen oxides",
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

commands["turn left"] = () => (window.earthAudio
  ? window.earthAudio.nudgeHeading(-15, { announce: "none" })
  : "Immersive listening is not available.");
commands["turn right"] = () => (window.earthAudio
  ? window.earthAudio.nudgeHeading(15, { announce: "none" })
  : "Immersive listening is not available.");
commands.recenter = () => (window.earthAudio
  ? window.earthAudio.recenter({ announce: "none" })
  : "Immersive listening is not available.");
commands["test tones"] = () => (window.earthAudio
  ? window.earthAudio.startTestTones()
  : "Immersive listening is not available.");

function overviewText() {
  return document.querySelector("#page-overview").innerText.trim();
}

function voiceHint(message) {
  const hint = document.querySelector("#voice-hint");
  if (hint) hint.textContent = message;
  announce(message);
}

function speak(text) {
  if (!text || !window.speechSynthesis) {
    voiceHint("This browser cannot speak. The written overview is still on the page.");
    return false;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  window.speechSynthesis.speak(utterance);
  return true;
}

function hasPhrase(heard, phrase) {
  return new RegExp(`(?:^|\\s)${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`).test(heard);
}

function matchName(heard) {
  const entries = [
    ...Object.keys(commands).map((name) => [name, name]),
    ...Object.entries(aliases),
  ];
  let best = null;
  entries.forEach(([phrase, name]) => {
    if (hasPhrase(heard, phrase) && (!best || phrase.length > best.phrase.length)) best = { phrase, name };
  });
  return best ? best.name : "";
}

function runCommand(phrase) {
  const heard = phrase.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (hasPhrase(heard, "stop test tones") || hasPhrase(heard, "stop the test tones") || hasPhrase(heard, "stop tones")) {
    const message = window.earthAudio ? window.earthAudio.stopTestTones() : "Test tones are not available.";
    voiceHint(message);
    return true;
  }
  if (hasPhrase(heard, "stop listening") || hasPhrase(heard, "voice off")) {
    stopListening();
    return true;
  }
  if (hasPhrase(heard, "stop speaking") || hasPhrase(heard, "be quiet") || heard === "stop") {
    window.speechSynthesis?.cancel();
    voiceHint("Stopped speaking.");
    return true;
  }
  const name = matchName(heard);
  if (!name || !commands[name]) return false;
  const result = commands[name]();
  if (typeof result === "string") speak(result);
  return true;
}

const commandList = document.querySelector("#command-list");
Object.keys(commands).forEach((name) => {
  const item = document.createElement("li");
  item.textContent = name;
  commandList.append(item);
});

exploreButton.addEventListener("click", () => {
  setMenu(exploreButton.getAttribute("aria-expanded") !== "true");
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && exploreButton.getAttribute("aria-expanded") === "true") {
    setMenu(false);
    exploreButton.focus();
  }
});

document.addEventListener("click", (event) => {
  if (exploreButton.getAttribute("aria-expanded") !== "true") return;
  if (nav.contains(event.target) || exploreButton.contains(event.target)) return;
  setMenu(false);
});

nav.addEventListener("click", (event) => {
  if (event.target.closest("a")) setMenu(false);
});

searchInput.addEventListener("input", () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(applySearch, 300);
});

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  applySearch();
  const first = cards.find((card) => !card.hidden);
  if (first) headingFor(first).focus();
  else empty.focus();
});

document.querySelector("#next-section").addEventListener("click", () => step(1));
document.querySelector("#prev-section").addEventListener("click", () => step(-1));
openOverviewButton.addEventListener("click", openOverview);
document.querySelector("#close-overview").addEventListener("click", () => dialog.close());
dialog.addEventListener("close", () => openOverviewButton.focus());

const voiceToggle = document.querySelector("#voice-toggle");
let listening = false;
let startingVoice = false;
let audioContext = null;
let audioStream = null;
let meter = null;
let speechChunks = [];
let heardSpeech = false;
let quietFrames = 0;
let sendingVoice = false;

function setListening(on) {
  listening = on;
  if (!voiceToggle) return;
  voiceToggle.setAttribute("aria-pressed", String(on));
  voiceToggle.textContent = on ? "Stop voice" : "Start voice";
}

function stopListening() {
  setListening(false);
  speechChunks = [];
  heardSpeech = false;
  quietFrames = 0;
  if (meter) meter.disconnect();
  meter = null;
  audioStream?.getTracks().forEach((track) => track.stop());
  audioStream = null;
  audioContext?.close();
  audioContext = null;
  voiceHint("Voice is off. Start voice, then say next, previous, photo, or page overview.");
}

async function waitForSpeechEngine() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    let response;
    try {
      response = await fetch("/api/health");
    } catch (_) {
      voiceHint("Voice needs the project server. Run py voice_server.py and open http://127.0.0.1:8765/site/.");
      return false;
    }
    if (response.status === 404) {
      voiceHint("Voice needs the project server. Stop any other server, run py voice_server.py, and open http://127.0.0.1:8765/site/.");
      return false;
    }
    if (response.ok) {
      const info = await response.json();
      if (info.ready) return true;
      if (info.error) {
        voiceHint(info.error);
        return false;
      }
    }
    voiceHint("Starting speech on the server. This happens once.");
    await new Promise((resolve) => window.setTimeout(resolve, 1000));
  }
  voiceHint("The speech engine did not start. Run py voice_server.py and open http://127.0.0.1:8765/site/.");
  return false;
}

function downsample(samples, fromRate, toRate) {
  if (fromRate === toRate) return samples;
  const ratio = fromRate / toRate;
  const length = Math.floor(samples.length / ratio);
  const output = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(samples.length, Math.floor((index + 1) * ratio));
    let sum = 0;
    for (let sample = start; sample < end; sample += 1) sum += samples[sample];
    output[index] = sum / Math.max(1, end - start);
  }
  return output;
}

function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset, text) => { for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i)); };
  write(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + index * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  });
  return buffer;
}

async function sendUtterance(chunks, sampleRate) {
  if (sendingVoice || !listening) return;
  const merged = new Float32Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  chunks.forEach((chunk) => {
    merged.set(chunk, offset);
    offset += chunk.length;
  });
  const samples = downsample(merged, sampleRate, 16000);
  if (samples.length < 16000 * 0.35) return;
  sendingVoice = true;
  voiceHint("Heard you. Checking the command.");
  try {
    const response = await fetch("/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": "audio/wav" },
      body: encodeWav(samples, 16000),
    });
    const payload = await response.json();
    if (!response.ok) {
      voiceHint(payload.error || "The server could not hear that.");
      return;
    }
    if (!payload.text) {
      voiceHint("Listening. Say next, previous, photo, or page overview.");
      return;
    }
    if (!runCommand(payload.text)) {
      voiceHint(`Heard “${payload.text}”. Try next, previous, photo, or page overview.`);
    } else if (listening) {
      voiceHint("Listening. Say next, previous, photo, or page overview.");
    }
  } catch (_) {
    stopListening();
    voiceHint("Voice needs the project server. Run py voice_server.py and open http://127.0.0.1:8765/site/.");
  } finally {
    sendingVoice = false;
  }
}

async function startListening() {
  if (startingVoice || listening) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    voiceHint("This browser cannot use the microphone. Play overview still speaks the written text.");
    return;
  }
  startingVoice = true;
  try {
    const ready = await waitForSpeechEngine();
    if (!ready) return;
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new AudioContext();
    await audioContext.resume();
    const source = audioContext.createMediaStreamSource(audioStream);
    const mute = audioContext.createGain();
    mute.gain.value = 0;
    meter = audioContext.createScriptProcessor(4096, 1, 1);
    meter.onaudioprocess = (event) => {
      if (!listening) return;
      if (window.speechSynthesis?.speaking) {
        speechChunks = [];
        heardSpeech = false;
        quietFrames = 0;
        return;
      }
      const channel = event.inputBuffer.getChannelData(0);
      let energy = 0;
      for (let index = 0; index < channel.length; index += 1) energy += channel[index] * channel[index];
      const loud = Math.sqrt(energy / channel.length) > 0.02;
      if (sendingVoice) return;
      if (loud) {
        heardSpeech = true;
        quietFrames = 0;
        speechChunks.push(new Float32Array(channel));
      } else if (heardSpeech) {
        speechChunks.push(new Float32Array(channel));
        quietFrames += 1;
        if (quietFrames > 10) {
          const utterance = speechChunks;
          speechChunks = [];
          heardSpeech = false;
          quietFrames = 0;
          sendUtterance(utterance, audioContext.sampleRate);
        }
      }
    };
    source.connect(meter);
    meter.connect(mute);
    mute.connect(audioContext.destination);
    setListening(true);
    voiceHint("Listening. Say next, previous, photo, or page overview.");
  } catch (error) {
    const blocked = error && error.name === "NotAllowedError";
    stopListening();
    voiceHint(blocked
      ? "Microphone permission was blocked. Allow the microphone, then start voice again."
      : "The microphone could not be opened.");
  } finally {
    startingVoice = false;
  }
}

voiceToggle?.addEventListener("click", () => {
  if (listening) stopListening();
  else startListening();
});

document.querySelector("#play-overview")?.addEventListener("click", () => {
  openOverview();
  speak(overviewText());
});

document.querySelector("#stop-speaking")?.addEventListener("click", () => {
  window.speechSynthesis?.cancel();
  voiceHint("Stopped speaking.");
});

function probePhoto(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = url;
  });
}

async function loadDailyPhoto() {
  const image = document.querySelector("#daily-photo");
  const caption = document.querySelector("#daily-caption");
  const frame = document.querySelector("#photo-frame");
  const missing = document.querySelector("#photo-missing");
  if (!image || !frame || !missing) return;
  let text = "";
  try {
    const response = await fetch("photo-of-the-day/caption.txt");
    if (response.ok) text = (await response.text()).trim();
  } catch (_) { /* caption is optional */ }
  const files = ["photo.jpg", "photo.jpeg", "photo.png", "photo.webp", "photo.gif"];
  for (const file of files) {
    const url = `photo-of-the-day/${file}`;
    if (await probePhoto(url)) {
      image.src = url;
      image.alt = text || "Space photo of the day. Add caption.txt in the photo folder so this picture can be described.";
      caption.textContent = text || "Add caption.txt next to the photo so people who cannot see it know what it shows.";
      frame.hidden = false;
      missing.hidden = true;
      return;
    }
  }
}

loadDailyPhoto();

window.earthJukebox = Object.freeze({
  goTo,
  next: () => step(1),
  previous: () => step(-1),
  openOverview,
  announce,
  speak,
  startListening,
  stopListening,
  command: runCommand,
  overviewText,
  commands,
});
