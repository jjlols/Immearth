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
  const write = (offset, text) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
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

const SERVER_HINT = "Voice needs the project server. Run py voice_server.py, then open this React app with npm run dev.";

export function createVoiceSession({ onHint, runCommand }) {
  let listening = false;
  let startingVoice = false;
  let audioContext = null;
  let audioStream = null;
  let meter = null;
  let speechChunks = [];
  let heardSpeech = false;
  let quietFrames = 0;
  let sendingVoice = false;
  let closed = false;

  async function waitForSpeechEngine() {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      let response;
      try {
        response = await fetch("/api/health");
      } catch {
        onHint(SERVER_HINT);
        return false;
      }
      if (response.status === 404) {
        onHint(SERVER_HINT);
        return false;
      }
      if (response.ok) {
        const info = await response.json();
        if (info.ready) return true;
        if (info.error) {
          onHint(info.error);
          return false;
        }
      }
      onHint("Starting speech on the server. This happens once.");
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
    }
    onHint("The speech engine did not start. Run py voice_server.py and keep npm run dev open.");
    return false;
  }

  async function sendUtterance(chunks, sampleRate) {
    if (sendingVoice || !listening || closed) return;
    const merged = new Float32Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
    let offset = 0;
    chunks.forEach((chunk) => {
      merged.set(chunk, offset);
      offset += chunk.length;
    });
    const samples = downsample(merged, sampleRate, 16000);
    if (samples.length < 16000 * 0.35) return;
    sendingVoice = true;
    onHint("Heard you. Checking the command.");
    try {
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "audio/wav" },
        body: encodeWav(samples, 16000),
      });
      const payload = await response.json();
      if (!response.ok) {
        onHint(payload.error || "The server could not hear that.");
        return;
      }
      if (!payload.text) {
        onHint("Listening. Say next, previous, photo, or page overview.");
        return;
      }
      if (!runCommand(payload.text)) {
        onHint(`Heard “${payload.text}”. Try next, previous, photo, or page overview.`);
      } else if (listening) {
        onHint("Listening. Say next, previous, photo, or page overview.");
      }
    } catch {
      stop();
      onHint(SERVER_HINT);
    } finally {
      sendingVoice = false;
    }
  }

  function stop() {
    listening = false;
    speechChunks = [];
    heardSpeech = false;
    quietFrames = 0;
    if (meter) meter.disconnect();
    meter = null;
    audioStream?.getTracks().forEach((track) => track.stop());
    audioStream = null;
    audioContext?.close();
    audioContext = null;
    onHint("Voice is off. Start voice, then say next, previous, photo, or page overview.");
  }

  async function start() {
    if (closed || startingVoice || listening) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      onHint("This browser cannot use the microphone. Play overview still speaks the written text.");
      return;
    }
    startingVoice = true;
    try {
      const ready = await waitForSpeechEngine();
      if (!ready || closed) return;
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
      listening = true;
      onHint("Listening. Say next, previous, photo, or page overview.");
      return true;
    } catch (error) {
      const blocked = error && error.name === "NotAllowedError";
      stop();
      onHint(blocked
        ? "Microphone permission was blocked. Allow the microphone, then start voice again."
        : "The microphone could not be opened.");
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
