import { AUDIO_BPM } from './musicMappings.js';

const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const FIRE_INTERVAL_SECONDS = 8.4;

/** One lazy Web Audio transport, decoded recording buffer, and shared clock.
 * Filter/gain paths are generic remixes of the recording, not official stems.
 * Scientific models contain only palette-derived controls; no DOM or geography.
 */
export class RemixEngine {
  constructor({ contextClass, sourceUrl = '/audio/deliberate-thought.mp3', maxAccents = 8 } = {}) {
    this.contextClass = contextClass;
    this.sourceUrl = sourceUrl;
    this.maxAccents = Math.min(8, Math.max(1, maxAccents));
    this.ctx = null;
    this.master = null;
    this.buffer = null;
    this.loading = null;
    this.original = null;
    this.models = new Map();
    this.hidden = new Set();
    this.selection = null;
    this.mode = 'solo';
    this.gates = new Map();
    this.accents = new Set();
    this.timer = null;
    this.nextDropletAt = 0;
    this.nextFireAt = 0;
    this.noxVoice = null;
    this.isRunning = false;
    this.muted = false;
    this.volume = 0.22;
    this.onChange = null;
    this.playRequest = 0;
    this.startedAt = 0;
  }

  get available() {
    return Boolean(this.contextClass) ||
      (typeof window !== 'undefined' && Boolean(window.AudioContext || window.webkitAudioContext));
  }
  get currentTime() { return this.ctx?.currentTime || 0; }
  get duration() { return this.buffer?.duration || 177.456; }
  get playableParameters() {
    return {
      temperatureRate: this.targets?.get(this.original?.playbackRate) ?? 1,
      carbonPadGain: this.targets?.get(this.gates.get('carbon_monoxide')?.gain.gain) ?? 0,
      noxFrequency: this.targets?.get(this.noxVoice?.oscillator.frequency) ?? null,
      activeIds: [...this.models.keys()].filter(id => this.audible(id)),
      activeAccentCount: this.accents.size,
      contextState: this.ctx?.state,
      bufferDuration: this.buffer?.duration ?? 0,
    };
  }
  get elapsed() {
    if (!this.ctx || !this.original) return 0;
    return Math.max(0, this.currentTime - this.startedAt) * finite(this.original.playbackRate.value, 1) % this.duration;
  }

  createContext() {
    const AudioClass = this.contextClass || window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioClass();
    this.master = this.ctx.createGain();
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -22;
    this.limiter.knee.value = 16;
    this.limiter.ratio.value = 10;
    this.limiter.attack.value = 0.01;
    this.limiter.release.value = 0.2;
    this.master.gain.value = 0;
    this.master.connect(this.limiter);
    // A post-limiter analyser enables real peak/RMS verification, not gain guesses.
    if (typeof this.ctx.createAnalyser === 'function') {
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0;
      this.limiter.connect(this.analyser).connect(this.ctx.destination);
    } else {
      this.limiter.connect(this.ctx.destination);
    }
  }

  async play() {
    const request = ++this.playRequest;
    if (!this.ctx) {
      if (!this.available) throw new Error('Audio is unavailable in this browser; study mode still works silently.');
      this.createContext();
    }
    try {
      await this.fetchBuffer();
    } catch (error) {
      this.isRunning = false;
      this.playRequest++;
      if (this.ctx?.state === 'running') await this.ctx.suspend();
      this.onChange?.(this);
      throw error;
    }
    if (request !== this.playRequest) return;
    await this.ctx.resume();
    if (request !== this.playRequest) {
      await this.ctx.suspend();
      return;
    }
    if (!this.original) this.remixRecording();
    this.isRunning = true;
    this.refresh();
    this.setVolume(this.volume);
    this.startClock();
    this.onChange?.(this);
  }

  async fetchBuffer() {
    if (this.buffer) return this.buffer;
    if (!this.loading) {
      this.loading = (async () => {
        const response = await fetch(this.sourceUrl);
        if (!response.ok) throw new Error(`The original track could not load (HTTP ${response.status}). Playback remains off.`);
        const bytes = await response.arrayBuffer();
        const buffer = await this.ctx.decodeAudioData(bytes);
        if (!(buffer.duration > 0)) throw new Error('The recording decoded to an empty buffer. Playback remains off.');
        this.buffer = buffer;
        return buffer;
      })().finally(() => { this.loading = null; });
    }
    return this.loading;
  }

  remixRecording() {
    this.original = this.ctx.createBufferSource();
    this.original.buffer = this.buffer;
    this.original.loop = true;
    this.original.playbackRate.value = 1;
    this.color = this.ctx.createBiquadFilter();
    this.color.type = 'lowpass';
    this.color.frequency.value = 1450;
    this.color.Q.value = 0.6;
    this.dryGain = this.ctx.createGain();
    // Deliberately preserve the last-known-good conservative source level.
    this.dryGain.gain.value = 0.085;
    this.original.connect(this.color).connect(this.dryGain).connect(this.master);
    for (const id of ['carbon_monoxide', 'near_surface_temperature']) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 0.7;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      this.original.connect(filter).connect(gain).connect(this.master);
      this.gates.set(id, { filter, gain });
    }
    // Start only from the explicit play() path, while the recording is silent.
    this.original.start();
    this.startedAt = this.currentTime;
  }

  ramp(parameter, value, seconds = 0.2) {
    if (!this.ctx || !parameter) return;
    if (!this.targets) this.targets = new Map();
    this.targets.set(parameter, finite(value, 0));
    const target = finite(value, 0);
    const now = this.currentTime;
    if (typeof parameter.cancelAndHoldAtTime === 'function') parameter.cancelAndHoldAtTime(now);
    else {
      const current = finite(parameter.value, target);
      parameter.cancelScheduledValues(now);
      parameter.setValueAtTime(current, now);
    }
    parameter.setTargetAtTime(target, now, Math.max(0.01, seconds));
  }

  setModel(models, { visibility = {}, selection = this.selection, mode = this.mode } = {}) {
    this.models = new Map(Object.entries(models || {}));
    this.hidden = new Set(Object.keys(visibility).filter(id => visibility[id] === false));
    this.selection = selection;
    this.mode = mode === 'composition' ? 'composition' : 'solo';
    this.refresh();
  }
  setSelected(id) { this.selection = id; this.refresh(); }
  setMode(mode) { this.mode = mode === 'composition' ? 'composition' : 'solo'; this.refresh(); }
  setVisibility(id, visible) {
    if (visible) this.hidden.delete(id);
    else this.hidden.add(id);
    this.refresh();
  }
  eligible(id) {
    const model = this.models.get(id);
    return Boolean(!this.hidden.has(id) && model && !model.silent && model.classified_count > 0 &&
      (this.mode === 'composition' || this.selection === id));
  }
  audible(id) { return Boolean(this.isRunning && this.eligible(id)); }

  refresh() {
    if (!this.ctx) return;
    const carbon = this.models.get('carbon_monoxide');
    const carbonGate = this.gates.get('carbon_monoxide');
    if (carbonGate) {
      this.ramp(carbonGate.gain.gain, this.audible('carbon_monoxide') ? carbon.padGain : 0, 0.65);
      this.ramp(carbonGate.filter.frequency, 1100 + (carbon?.tier || 0) * 400, 0.9);
    }
    const temperature = this.models.get('near_surface_temperature');
    const temperatureGate = this.gates.get('near_surface_temperature');
    if (temperatureGate) this.ramp(temperatureGate.gain.gain, this.audible('near_surface_temperature') ? 0.01 : 0, 0.65);
    if (this.original) {
      this.ramp(this.original.playbackRate,
        this.audible('near_surface_temperature') ? temperature.playbackRate : 1, 0.85);
    }
    this.syncNOx();
    this.pruneIneligibleAccents();
    this.startClock();
    this.onChange?.(this);
  }

  setMute(value) {
    this.muted = Boolean(value);
    this.setVolume(this.volume);
    this.syncNOx();
  }
  pruneIneligibleAccents() {
    for (const record of this.accents) {
      if (this.audible(record.id)) continue;
      record.oscillator.onended = null;
      try { record.oscillator.stop(); } catch { /* Already ended. */ }
      record.oscillator.disconnect();
      record.gain.disconnect();
      this.accents.delete(record);
    }
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(0.24, finite(Number(value), 0)));
    if (this.master) this.ramp(this.master.gain, this.muted ? 0 : this.volume, 0.05);
    this.onChange?.(this);
  }
  startClock() {
    if (this.timer || !this.isRunning || this.ctx?.state !== 'running') return;
    this.timer = setInterval(() => this.tick(), 120);
    this.tick();
  }
  tick() {
    if (!this.ctx || this.ctx.state !== 'running' || !this.isRunning) return;
    const now = this.currentTime;
    this.pruneIneligibleAccents();
    const precipitation = this.models.get('precipitation');
    if (this.eligible('precipitation')) {
      for (const [kind, density, hertz] of [
        ['rain', precipitation.rain ?? precipitation.density ?? 0, 350],
        ['frozen', precipitation.frozen ?? 0, 520],
      ]) {
        if (density <= 0 || now < this.nextDropletAt) continue;
        this.accent('precipitation', hertz + Math.min(200, density * 15),
          0.022 + clampUnit(precipitation.strength) * 0.02, 'sine', 0.45);
        // Average intervals range from sparse (~6 seconds) to clustered (~0.8 seconds).
        this.nextDropletAt = now + Math.max(0.8, 7 - density * 0.78);
        break;
      }
    }
    if (this.eligible('active_fires') && now >= this.nextFireAt) {
      const power = clampUnit(this.models.get('active_fires').power);
      this.accent('active_fires', 260 + power * 150, 0.024 + power * 0.028, 'sine', 0.5);
      this.nextFireAt = now + FIRE_INTERVAL_SECONDS + (1 - power) * 2;
    }
    this.syncNOx();
  }

  accent(id, hertz, amplitude, type = 'sine', duration = 0.8) {
    if (!this.ctx || this.ctx.state !== 'running' || !this.audible(id) || this.muted || this.accents.size >= this.maxAccents) return;
    if (!finite(hertz, 0) || !finite(amplitude, 0)) return;
    const oscillator = this.ctx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = Math.max(45, Math.min(1800, hertz));
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    oscillator.connect(gain).connect(this.master);
    const now = this.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(Math.min(0.08, amplitude), now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
    const record = { id, oscillator, gain };
    this.accents.add(record);
    oscillator.onended = () => {
      this.accents.delete(record);
      oscillator.disconnect();
      gain.disconnect();
    };
  }

  syncNOx() {
    if (!this.ctx || this.ctx.state !== 'running' || !this.isRunning) return;
    const active = this.audible('nitrogen_oxides');
    const model = this.models.get('nitrogen_oxides');
    if (active && !this.noxVoice) {
      const oscillator = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = finite(model.frequency, 220);
      gain.gain.value = 0;
      oscillator.connect(gain).connect(this.master);
      oscillator.start();
      this.noxVoice = { oscillator, gain };
    }
    if (!this.noxVoice) return;
    this.ramp(this.noxVoice.oscillator.frequency, active ? model.frequency : 220, 0.65);
    this.ramp(this.noxVoice.gain.gain, active && !this.muted ? 0.038 : 0, 0.35);
  }

  getOutputMetrics() {
    if (!this.analyser || !this.ctx) return null;
    const samples = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(samples);
    let peak = 0, sum = 0;
    for (const sample of samples) {
      peak = Math.max(peak, Math.abs(sample));
      sum += sample * sample;
    }
    return { rms: Math.sqrt(sum / samples.length), peak, contextState: this.ctx.state };
  }

  stopSources() {
    this.playRequest++;
    this.isRunning = false;
    clearInterval(this.timer);
    this.timer = null;
    this.nextDropletAt = 0;
    this.nextFireAt = 0;
    for (const { oscillator, gain } of this.accents) {
      oscillator.onended = null;
      try { oscillator.stop(); } catch { /* Already ended. */ }
      oscillator.disconnect();
      gain.disconnect();
    }
    this.accents.clear();
    if (this.noxVoice) {
      try { this.noxVoice.oscillator.stop(); } catch { /* Already ended. */ }
      this.noxVoice.oscillator.disconnect();
      this.noxVoice.gain.disconnect();
      this.noxVoice = null;
    }
    if (this.original) {
      try { this.original.stop(); } catch { /* Already ended. */ }
      this.original.disconnect();
      this.original = null;
    }
    for (const { filter, gain } of this.gates.values()) {
      filter.disconnect();
      gain.disconnect();
    }
    this.gates.clear();
    this.targets?.clear();
    this.color?.disconnect();
    this.dryGain?.disconnect();
    this.color = null;
    this.dryGain = null;
  }

  async pause() {
    this.isRunning = false;
    this.playRequest++;
    clearInterval(this.timer);
    this.timer = null;
    if (this.master) this.ramp(this.master.gain, 0, 0.04);
    if (this.ctx && this.ctx.state === 'running') await this.ctx.suspend();
    this.onChange?.(this);
  }

  async reset() {
    this.stopSources();
    if (this.master) this.master.gain.value = 0;
    if (this.ctx && this.ctx.state === 'running') await this.ctx.suspend();
    this.onChange?.(this);
  }

  async dispose() {
    await this.reset();
    this.master?.disconnect();
    this.limiter?.disconnect();
    this.analyser?.disconnect();
    if (this.ctx && this.ctx.state !== 'closed') await this.ctx.close();
    this.ctx = null;
    this.master = null;
    this.limiter = null;
    this.analyser = null;
    this.buffer = null;
    this.loading = null;
    this.onChange = null;
  }
}

function clampUnit(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}
