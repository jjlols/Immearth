/* Browser speech recognition for the listen-and-speak controls. */
function recognitionConstructor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

const OFF_HINT = "Voice is off. Press L to play the overview, press N for the next page, or start voice and say next, previous, a map name, or page overview.";

export function createVoiceSession({ onHint, onListening, runCommand }) {
  let listening = false;
  let startingVoice = false;
  let closed = false;
  let recognizer = null;
  let local = false;
  let preferLocal = false;
  let restartTimer = 0;
  let generation = 0;

  const Ctor = recognitionConstructor();
  if (Ctor?.available) {
    Ctor.available({ langs: ["en-US"], processLocally: true }).then((status) => {
      preferLocal = status === "available";
    }).catch(() => {
      preferLocal = false;
    });
  }

  function listeningHint() {
    return local
      ? "Listening on this computer. Say next, previous, a map name, or page overview."
      : "Listening with this browser’s speech service. Say next, previous, a map name, or page overview.";
  }

  function clearRestart() {
    window.clearTimeout(restartTimer);
    restartTimer = 0;
  }

  function detach(current) {
    if (!current) return;
    current.onresult = null;
    current.onerror = null;
    current.onend = null;
    try { current.abort(); } catch { /* already stopped */ }
  }

  function stop() {
    listening = false;
    generation += 1;
    clearRestart();
    detach(recognizer);
    recognizer = null;
    if (!closed) onListening?.(false);
    onHint(OFF_HINT);
  }

  function fail(message) {
    listening = false;
    generation += 1;
    clearRestart();
    detach(recognizer);
    recognizer = null;
    if (!closed) onListening?.(false);
    onHint(message);
  }

  function handleTranscript(text) {
    const heard = text.trim();
    if (!heard || !listening) return;
    if (!runCommand(heard)) {
      onHint(`Heard “${heard}”. Try next, previous, a map name, or page overview.`);
    } else if (listening) {
      onHint(listeningHint());
    }
  }

  function openRecognizer(useLocal) {
    const Ctor = recognitionConstructor();
    const recognition = new Ctor();
    const mine = generation;
    local = false;
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    if (useLocal && "processLocally" in recognition) {
      try {
        recognition.processLocally = true;
        local = true;
      } catch {
        local = false;
      }
    }
    recognition.onresult = (event) => {
      if (!listening || mine !== generation) return;
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (!result.isFinal || !result[0]) continue;
        handleTranscript(result[0].transcript || "");
      }
    };
    recognition.onerror = (event) => {
      if (!listening || mine !== generation) return;
      const code = event.error;
      if (code === "no-speech" || code === "aborted") return;
      if (local && (code === "language-not-supported" || code === "network" || code === "service-not-allowed")) {
        onHint("This browser cannot recognize speech on the computer, so it is using its speech service. Say next, previous, a map name, or page overview.");
        detach(recognition);
        if (recognizer === recognition) recognizer = null;
        try {
          openRecognizer(false);
        } catch {
          fail("This browser’s speech service could not be started. Start voice to try again.");
        }
        return;
      }
      if (code === "not-allowed" || code === "service-not-allowed") {
        fail("Microphone permission was blocked. Allow the microphone for this site, then start voice again.");
        return;
      }
      if (code === "audio-capture") {
        fail("The microphone could not be opened. Check that a microphone is connected, allowed for this browser, and not in use by another app.");
        return;
      }
      if (code === "network") {
        fail("This browser’s speech service could not be reached. Check the connection, then start voice again.");
        return;
      }
      fail("Voice stopped. Start voice to try again.");
    };
    recognition.onend = () => {
      if (!listening || closed || mine !== generation || recognizer !== recognition) return;
      restartTimer = window.setTimeout(() => {
        if (!listening || closed || recognizer !== recognition) return;
        try {
          recognition.start();
        } catch {
          fail("Voice stopped. Start voice to try again.");
        }
      }, 300);
    };
    recognizer = recognition;
    recognition.start();
  }

  async function start() {
    if (closed || startingVoice || listening) return false;
    if (!recognitionConstructor()) {
      onHint("This browser cannot use voice commands. Play overview still plays the recording, and every command is also a button or link.");
      return false;
    }
    startingVoice = true;
    generation += 1;
    try {
      listening = true;
      openRecognizer(preferLocal);
      onListening?.(true);
      onHint(listeningHint());
      return true;
    } catch (error) {
      const name = error && error.name;
      fail(name === "NotAllowedError" || name === "SecurityError"
        ? "Microphone permission was blocked. Allow the microphone for this site, then start voice again."
        : "The microphone could not be opened. Check that a microphone is connected, allowed for this browser, and not in use by another app.");
      return false;
    } finally {
      startingVoice = false;
    }
  }

  return {
    start,
    stop,
    get listening() { return listening; },
    dispose() {
      closed = true;
      stop();
    },
  };
}
