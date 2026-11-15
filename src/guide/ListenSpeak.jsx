import { useEffect, useRef, useState } from "react";
import { VIEWS, goToView, viewFromLocation } from "../navigation.js";
import { IconMic, IconPlay, IconSpeaker, IconStop } from "../Icons.jsx";
import { targetIsForm } from "../hooks/useExplorer.js";
import { MAPS } from "./maps.js";
import { HOME_SECTIONS, SECTION_COMMAND, hasPhrase, matchCommand, normalizeHeard } from "./voiceCommands.js";
import { createVoiceSession } from "./voice.js";

const OVERVIEW_AUDIO = `${import.meta.env.BASE_URL}audio/page-overview.m4a`;

const SWITCH_VOICE = {
  home: { src: `${import.meta.env.BASE_URL}audio/switch-home.m4a`, text: "Switching to home." },
  music: { src: `${import.meta.env.BASE_URL}audio/switch-live-map.m4a`, text: "Switching to live map." },
  data: { src: `${import.meta.env.BASE_URL}audio/switch-earth-data.m4a`, text: "Switching to Earth data." },
  access: { src: `${import.meta.env.BASE_URL}audio/switch-accessibility.m4a`, text: "Switching to accessibility and help." },
};

let pendingSwitch = null;

const OVERVIEW = [
  "Immearth is a NASA Space Apps project.",
  "Five NASA views of Earth become one piece of music: precipitation, active fires, carbon monoxide, nitrogen oxides, and temperature. Rain and fires are NASA’s latest pictures, while the others are extracted from the latest animations.",
  "The home page introduces everything. With the Live Map, inside you will find Play remix. Press on it and pick a map. You’ll be able to move across 48 regions onto all in a layered map. With headphones, the music sits all around you.",
  "The other pages stack the maps, explain them, or show the keys with voice commands. To move by looking, press Enable camera. Look towards the region and look forwards. The arrow keys, or W A S D, do the same thing. Home takes you all the way back to the start. At the same time, by staring continuously at one side, you’ll be able to sample the music that you would hear if you were to move there.",
  "You can use a keyboard, a screen reader, or your voice. Dark mode and color-blind colors are at the top of every page. The microphone and camera stay off until you turn them on.",
  "On this page, say next, previous, a map name, or page overview. Say stop speaking to quiet the voice, or stop listening to turn the microphone off.",
];

export default function ListenSpeak({ home = false }) {
  const [status, setStatus] = useState("");
  const [voiceHint, setVoiceHint] = useState("Voice is off. Press L to play the overview, press N for the next page, or start voice and say next, previous, a map name, or page overview.");
  const [listening, setListening] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [lastSection, setLastSection] = useState("overview");
  const dialogRef = useRef(null);
  const dialogTitleRef = useRef(null);
  const voiceRef = useRef(null);
  const runRef = useRef(() => false);
  const overviewAudioRef = useRef(null);
  const switchAudioRef = useRef(null);
  const playRef = useRef(() => {});
  const stopRef = useRef(() => {});
  const nextRef = useRef(() => {});

  function announce(message) {
    setStatus("");
    window.setTimeout(() => setStatus(message), 30);
  }

  function focusHeading(id) {
    const section = document.getElementById(id);
    const heading = section?.querySelector("h1, h2, h3");
    heading?.focus();
    return section;
  }

  function goTo(id, quiet) {
    const map = MAPS.find((item) => item.command === id || item.id === id);
    const commandToId = Object.fromEntries(Object.entries(SECTION_COMMAND).map(([sectionId, command]) => [command, sectionId]));
    const sectionId = map ? "maps" : commandToId[id] || id;
    const section = focusHeading(sectionId);
    if (section) setLastSection(section.id);
    if (map) document.getElementById(map.id)?.querySelector("h3")?.focus();
    const label = map?.label || HOME_SECTIONS.find(([sectionName]) => sectionName === sectionId)?.[1] || id;
    let message = `${label}.`;
    if (map) message = `${map.label}. In the musical remix: ${map.planned}`;
    if (!quiet) announce(message);
    return message;
  }

  function step(direction) {
    const index = Math.max(0, HOME_SECTIONS.findIndex(([id]) => id === lastSection));
    const next = index + direction;
    if (next < 0) {
      goTo(HOME_SECTIONS[0][0], true);
      announce("Already at the start of the page.");
      return "Already at the start of the page.";
    }
    if (next >= HOME_SECTIONS.length) {
      goTo(HOME_SECTIONS[HOME_SECTIONS.length - 1][0], true);
      announce("Already at the end of the page.");
      return "Already at the end of the page.";
    }
    return goTo(HOME_SECTIONS[next][0]);
  }

  function openOverview() {
    setOverviewOpen(true);
    window.setTimeout(() => dialogTitleRef.current?.focus(), 0);
  }

  function stopSpeaking() {
    window.speechSynthesis?.cancel();
    for (const audio of [overviewAudioRef.current, switchAudioRef.current]) {
      if (!audio) continue;
      audio.pause();
      audio.currentTime = 0;
    }
    setVoiceHint("Stopped speaking.");
    announce("Stopped speaking.");
  }

  function playSwitch(view) {
    const line = SWITCH_VOICE[view];
    const audio = switchAudioRef.current;
    if (!line || !audio) return;
    window.speechSynthesis?.cancel();
    const overview = overviewAudioRef.current;
    if (overview && !overview.paused) overview.pause();
    audio.src = line.src;
    audio.currentTime = 0;
    setVoiceHint(line.text);
    announce(line.text);
    audio.play()?.catch(() => {
      setVoiceHint(line.text);
    });
  }

  function openPage(view, hash = "") {
    if (viewFromLocation() === view) {
      playSwitch(view);
      if (hash) goToView(view, hash);
      return;
    }
    pendingSwitch = view;
    goToView(view, hash);
  }

  function nextPage() {
    const index = VIEWS.indexOf(viewFromLocation());
    if (index < 0 || index >= VIEWS.length - 1) {
      setVoiceHint("Already on the last page.");
      announce("Already on the last page.");
      return;
    }
    openPage(VIEWS[index + 1]);
  }

  function playOverview() {
    openOverview();
    window.speechSynthesis?.cancel();
    const audio = overviewAudioRef.current;
    if (!audio) return;
    window.dispatchEvent(new Event("immearth-pause-preview"));
    const switching = switchAudioRef.current;
    if (switching && !switching.paused) switching.pause();
    audio.currentTime = 0;
    const pending = audio.play();
    setVoiceHint("Playing the recorded overview.");
    announce("Playing the recorded overview.");
    pending?.catch(() => {
      setVoiceHint("The recorded overview could not play. The written overview is still on the page.");
      announce("The recorded overview could not play. The written overview is still on the page.");
    });
  }

  function toggleOverview() {
    const audio = overviewAudioRef.current;
    if (audio && !audio.paused) stopSpeaking();
    else playOverview();
  }

  function speak(text) {
    if (!text) return false;
    window.speechSynthesis?.cancel();
    const switching = switchAudioRef.current;
    if (switching && !switching.paused) switching.pause();
    setVoiceHint(text);
    announce(text);
    return true;
  }

  playRef.current = toggleOverview;
  stopRef.current = stopSpeaking;
  nextRef.current = nextPage;

  runRef.current = (phrase) => {
    const heard = normalizeHeard(phrase);
    if (hasPhrase(heard, "stop test tones") || hasPhrase(heard, "stop the test tones") || hasPhrase(heard, "stop tones")) {
      const message = window.earthAudio ? window.earthAudio.stopTestTones() : "Test tones are not available.";
      setVoiceHint(message);
      announce(message);
      return true;
    }
    if (hasPhrase(heard, "stop listening") || hasPhrase(heard, "voice off")) {
      voiceRef.current?.stop();
      setListening(false);
      return true;
    }
    if (hasPhrase(heard, "stop speaking") || hasPhrase(heard, "be quiet") || heard === "stop") {
      stopSpeaking();
      return true;
    }
    const name = matchCommand(heard);
    if (!name) return false;
    const actions = {
      next: () => step(1),
      previous: () => step(-1),
      "page overview": () => {
        playOverview();
      },
      "immersive listening": () => openPage("music"),
      move: () => openPage("access", "keys"),
      "turn left": () => openPage("music", "map-navigation"),
      "turn right": () => openPage("music", "map-navigation"),
      recenter: () => openPage("music", "map-navigation"),
      "test tones": () => openPage("music", "map-navigation"),
    };
    const result = actions[name] ? actions[name]() : goTo(name);
    if (typeof result === "string") speak(result);
    return true;
  };

  useEffect(() => {
    const session = createVoiceSession({
      onHint: (message) => {
        setVoiceHint(message);
        announce(message);
      },
      onListening: (value) => setListening(value),
      runCommand: (phrase) => runRef.current(phrase),
    });
    voiceRef.current = session;
    return () => session.dispose();
  }, []);

  useEffect(() => {
    const here = viewFromLocation();
    if (pendingSwitch !== here) return undefined;
    const view = pendingSwitch;
    playSwitch(view);
    const timer = window.setTimeout(() => {
      if (pendingSwitch === view) pendingSwitch = null;
    }, 500);
    return () => {
      window.clearTimeout(timer);
      switchAudioRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    function onKey(event) {
      if (event.defaultPrevented || event.repeat || event.ctrlKey || event.altKey || event.metaKey || targetIsForm(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === "n") {
        event.preventDefault();
        nextRef.current();
        return;
      }
      if (!home || key !== "l") return;
      event.preventDefault();
      playRef.current();
    }
    function onOpen() {
      setOverviewOpen(true);
      window.setTimeout(() => dialogTitleRef.current?.focus(), 0);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("immearth-open-overview", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("immearth-open-overview", onOpen);
    };
  }, [home]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    if (overviewOpen && !dialog.open) dialog.showModal();
    if (!overviewOpen && dialog.open) dialog.close();
    return undefined;
  }, [overviewOpen]);

  function toggleVoice() {
    if (listening) {
      voiceRef.current?.stop();
      setListening(false);
    } else {
      voiceRef.current?.start().then((started) => setListening(Boolean(started)));
    }
  }

  return (
    <>
      <div className="visually-hidden" role="status">{status}</div>
      <audio ref={overviewAudioRef} src={OVERVIEW_AUDIO} preload="none" />
      <audio ref={switchAudioRef} preload="none" />
      <section className="assist-strip" aria-labelledby="assist-title">
        <div className="assist-inner">
          <div className="assist-label">
            <IconSpeaker />
            <div>
              <h2 id="assist-title" tabIndex={-1}>Listen and speak</h2>
              {home && <p>Hear the recorded overview, or turn on voice and say where you want to go. Press L when you are not on a button or text field. Press N for the next page.</p>}
            </div>
          </div>
          <div className="assist-actions" role="group" aria-label="Listening and voice controls">
            {home && <button type="button" className="button button-secondary" onClick={playOverview}><IconPlay /> Play overview</button>}
            <button type="button" className="button button-quiet" onClick={stopSpeaking}><IconStop /> Stop speaking</button>
            <button type="button" className="button button-secondary" aria-pressed={listening} aria-describedby={home ? "voice-hint" : undefined} onClick={toggleVoice}><IconMic /> {listening ? "Stop voice" : "Start voice"}</button>
          </div>
        </div>
        {home && <p id="voice-hint" className="assist-hint">{voiceHint}</p>}
      </section>
      {home && <dialog id="overview-dialog" ref={dialogRef} aria-labelledby="overview-dialog-title" onClose={() => setOverviewOpen(false)}>
        <h2 id="overview-dialog-title" ref={dialogTitleRef} tabIndex={-1}>Page overview</h2>
        <div id="page-overview">{OVERVIEW.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
        <button type="button" className="button button-primary" onClick={() => setOverviewOpen(false)}>Close</button>
      </dialog>}
    </>
  );
}
