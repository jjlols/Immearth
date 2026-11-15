import { useEffect, useRef, useState } from "react";
import { goToView } from "../navigation.js";
import { IconMic, IconPlay, IconSpeaker, IconStop } from "../Icons.jsx";
import { targetIsForm } from "../hooks/useExplorer.js";
import { MAPS } from "./maps.js";
import { HOME_SECTIONS, SECTION_COMMAND, hasPhrase, matchCommand, normalizeHeard } from "./voiceCommands.js";
import { createVoiceSession } from "./voice.js";

const OVERVIEW_AUDIO = `${import.meta.env.BASE_URL}audio/page-overview.m4a`;

const OVERVIEW = [
  "Immearth. A NASA Space Apps project, not the official NASA website.",
  "This site turns five NASA Earth maps into one shared piece of music: precipitation, active fires, carbon monoxide, nitrogen oxides, and near-surface temperature. Precipitation and fires are NASA’s latest published images. The other three are the first frame of an animation, not a verified latest observation.",
  "The home page introduces the maps, plays a Live Map preview, and links to every other page. The preview keeps your place fixed and starts the music on its own. The full Live Map is where you choose a map, move between 48 regions, and use every sound setting. That page stays silent until you press Play remix. Earth data describes each map in detail. Accessibility and help lists every key and voice command.",
  "On this page you can say next or previous to move between sections, say a map name, or say page overview. Say stop speaking to quiet the voice, or stop listening to turn the microphone off. Press L, when you are not on a button or text field, to play or stop this overview.",
];

export default function ListenSpeak() {
  const [status, setStatus] = useState("");
  const [voiceHint, setVoiceHint] = useState("Voice is off. Press L to play the overview, or start voice and say next, previous, a map name, or page overview.");
  const [listening, setListening] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [lastSection, setLastSection] = useState("overview");
  const dialogRef = useRef(null);
  const dialogTitleRef = useRef(null);
  const voiceRef = useRef(null);
  const runRef = useRef(() => false);
  const overviewAudioRef = useRef(null);
  const playRef = useRef(() => {});
  const stopRef = useRef(() => {});

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
    const audio = overviewAudioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setVoiceHint("Stopped speaking.");
    announce("Stopped speaking.");
  }

  function playOverview() {
    openOverview();
    window.speechSynthesis?.cancel();
    const audio = overviewAudioRef.current;
    if (!audio) return;
    window.dispatchEvent(new Event("immearth-pause-preview"));
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
    if (!text || !window.speechSynthesis) {
      setVoiceHint("This browser cannot speak. The written overview is still on the page.");
      announce("This browser cannot speak. The written overview is still on the page.");
      return false;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    window.speechSynthesis.speak(utterance);
    return true;
  }

  playRef.current = toggleOverview;
  stopRef.current = stopSpeaking;

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
      "immersive listening": () => goToView("music"),
      move: () => goToView("access", "keys"),
      "turn left": () => goToView("music", "map-navigation"),
      "turn right": () => goToView("music", "map-navigation"),
      recenter: () => goToView("music", "map-navigation"),
      "test tones": () => goToView("music", "map-navigation"),
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
    function onKey(event) {
      if (event.defaultPrevented || event.repeat || event.ctrlKey || event.altKey || event.metaKey || targetIsForm(event.target)) return;
      if (event.key.toLowerCase() !== "l") return;
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
  }, []);

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
      <section className="assist-strip" aria-labelledby="assist-title">
        <div className="assist-inner">
          <div className="assist-label">
            <IconSpeaker />
            <div>
              <h2 id="assist-title" tabIndex={-1}>Listen and speak</h2>
              <p>Hear the recorded overview, or turn on voice and say where you want to go. Press L when you are not on a button or text field.</p>
            </div>
          </div>
          <div className="assist-actions" role="group" aria-label="Listening and voice controls">
            <button type="button" className="button button-secondary" onClick={playOverview}><IconPlay /> Play overview</button>
            <button type="button" className="button button-quiet" onClick={stopSpeaking}><IconStop /> Stop speaking</button>
            <button type="button" className="button button-secondary" aria-pressed={listening} aria-describedby="voice-hint" onClick={toggleVoice}><IconMic /> {listening ? "Stop voice" : "Start voice"}</button>
          </div>
        </div>
        <p id="voice-hint" className="assist-hint">{voiceHint}</p>
      </section>
      <dialog id="overview-dialog" ref={dialogRef} aria-labelledby="overview-dialog-title" onClose={() => setOverviewOpen(false)}>
        <h2 id="overview-dialog-title" ref={dialogTitleRef} tabIndex={-1}>Page overview</h2>
        <div id="page-overview">{OVERVIEW.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
        <button type="button" className="button button-primary" onClick={() => setOverviewOpen(false)}>Close</button>
      </dialog>
    </>
  );
}
