import { SpatialRenderer } from './spatialRenderer.js';

const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const clampUnit = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
const FIRE_INTERVAL_SECONDS = 8.4;

/** Process only decoded recording samples; no oscillator or other sound generator.
 * Filter/gain paths are artistic remix branches, not isolated official stems.
 * Inputs are bounded palette-derived or caller-provided scientific feature models.
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
    this.gates = new Map();
    this.accents = new Set();
    this.targets = new Map();
    this.timer = null;
    this.nextDropletAt = 0;
    this.nextFrozenAt = 0;
    this.nextFireAt = 0;
    this.noxFilterFrequency = 16000;
    this.spatial = new SpatialRenderer();
    this.spatialEnabled = false;
    this.lastSourceRate = 1;
    this.isRunning = false;
    this.muted = false;
    this.volume = 0.32;
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
      temperatureRate: this.targets.get(this.original?.playbackRate) ?? 1,
      carbonPadGain: this.targets.get(this.gates.get('carbon_monoxide')?.gain.gain) ?? 0,
      noxFrequency: this.targets.get(this.color?.frequency) ?? this.color?.frequency.value ?? null,
      spatial: this.spatial.getDiagnostics(),
      activeIds: [...this.models.keys()].filter(id => this.audible(id)),
      activeAccentCount: this.accents.size,
      contextState: this.ctx?.state,
      bufferDuration: this.buffer?.duration ?? 0,
    };
  }
  get elapsed() {
    return this.sourcePosition || 0;
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
    this.spatial.attach(this.ctx, this.master, this.limiter);
    if (typeof this.ctx.createAnalyser === 'function') {
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0;
      this.limiter.connect(this.analyser).connect(this.ctx.destination);
    } else {
      this.limiter.connect(this.ctx.destination);
    }
  }

  async prime() {
    if (!this.ctx) {
      if (!this.available) return false;
      this.createContext();
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
    return this.ctx.state === "running";
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
    if (this.master) this.master.gain.value = 0;
    this.refresh();
    this.setVolume(this.volume);
    this.startClock();
    this.onChange?.(this);
  }

  async fetchBuffer() {
    if (this.buffer) return this.buffer;
    if (!this.loading) {
      const request = this.playRequest;
      const context = this.ctx;
      const load = (async () => {
        const response = await fetch(this.sourceUrl);
        if (!response.ok) throw new Error(`The original track could not load (HTTP ${response.status}). Playback remains off.`);
        const bytes = await response.arrayBuffer();
        const buffer = await context.decodeAudioData(bytes);
        if (!(buffer.duration > 0)) throw new Error('The recording decoded to an empty buffer. Playback remains off.');
        if (request !== this.playRequest || this.ctx !== context) return null;
        this.buffer = buffer;
        return buffer;
      })();
      this.loading = load;
      load.finally(() => { if (this.loading === load) this.loading = null; }).catch(() => {});
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
    this.color.frequency.value = 16000;
    this.color.Q.value = 0.4;
    this.dryGain = this.ctx.createGain();
    this.dryGain.gain.value = 0.085;
    this.original.connect(this.color).connect(this.dryGain).connect(this.master);

    // CO contributes a gentle low-frequency duplicate of the SAME playing samples.
    this.addFilterGate('carbon_monoxide', 'lowpass', 900, 0.5);
    // These independently filter and envelope the synchronized shared source.
    this.addFilterGate('rain', 'bandpass', 1500, 0.35);
    this.addFilterGate('frozen', 'lowpass', 750, 0.35);
    this.addFilterGate('active_fires', 'lowpass', 1100, 0.45);
    // Start only from the explicit play() path, with effects gains at zero.
    this.original.start();
    this.lastSourceRate = 1;
    this.sourcePosition = 0;
    this.startedAt = this.currentTime;
  }

  addFilterGate(id, type, frequency, q) {
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    this.original.connect(filter).connect(gain).connect(this.master);
    this.gates.set(id, { filter, gain });
  }

  ramp(parameter, value, seconds = 0.2) {
    if (!this.ctx || !parameter) return;
    const target = finite(value, 0);
    this.targets.set(parameter, target);
    const now = this.currentTime;
    if (typeof parameter.cancelAndHoldAtTime === 'function') parameter.cancelAndHoldAtTime(now);
    else {
      parameter.cancelScheduledValues(now);
      parameter.setValueAtTime(finite(parameter.value, target), now);
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
  /** Opt-in only; does not construct/resume an AudioContext or start playback. */
  setSpatialEnabled(enabled) {
    this.spatialEnabled = Boolean(enabled);
    this.spatial.setEnabled(this.spatialEnabled);
    if (this.ctx && !this.spatial.panner) {
      throw new Error('Spatial sound requires Web Audio PannerNode support; the original stereo mix remains available.');
    }
    this.onChange?.(this);
    return this.spatial.getDiagnostics();
  }
  setSpatialSourcePosition(position) {
    const result = this.spatial.setSourcePosition(position);
    this.onChange?.(this);
    return result;
  }
  setSpatialListenerPosition(position) {
    const result = this.spatial.setListenerPosition(position);
    this.onChange?.(this);
    return result;
  }
  setSpatialListenerOrientation(forward, up) {
    const result = this.spatial.setListenerOrientation(forward, up);
    this.onChange?.(this);
    return result;
  }
  setSpatialDistanceModel(settings) {
    const result = this.spatial.setDistanceModel(settings);
    this.onChange?.(this);
    return result;
  }
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
    const temperature = this.models.get('near_surface_temperature');
    if (this.original) {
      this.ramp(this.original.playbackRate,
        this.audible('near_surface_temperature') ? temperature.playbackRate : 1, 0.85);
    }
    const carbon = this.models.get('carbon_monoxide');
    const carbonGate = this.gates.get('carbon_monoxide');
    if (carbonGate) {
      this.ramp(carbonGate.gain.gain, this.audible('carbon_monoxide') ? carbon.padGain : 0, 0.65);
    }
    this.refreshFilters();
    this.pruneIneligibleAccents();
    this.startClock();
    this.onChange?.(this);
  }

  refreshFilters() {
    if (!this.ctx || !this.color) return;
    const nox = this.models.get('nitrogen_oxides');
    const rank = this.audible('nitrogen_oxides') ? clampUnit(nox.rank) : null;
    // Filter the existing waveform from full/dark to a more open/brighter register.
    // Log10 of the estimated concentration happened in the mapping module, not here.
    this.noxFilterFrequency = rank === null ? 16000 : 1200 * (16000 / 1200) ** rank;
    this.ramp(this.color.frequency, this.noxFilterFrequency, 0.9);
  }

  setMute(value) {
    this.muted = Boolean(value);
    this.setVolume(this.volume);
  }

  pruneIneligibleAccents() {
    for (const record of this.accents) {
      if (record.until > this.currentTime && this.audible(record.id)) continue;
      const gate = this.gates.get(record.gateId);
      if (gate) this.ramp(gate.gain.gain, 0, 0.1);
      this.accents.delete(record);
    }
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(0.5, finite(Number(value), 0)));
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
    if (this.original) {
      this.takePlaybackSample();
      this.checkPlaybackEnd(now);
    }
    this.pruneIneligibleAccents();
    const precipitation = this.models.get('precipitation');
    if (this.eligible('precipitation')) {
      const rain = precipitation.densities?.rain ?? 0;
      const frozen = precipitation.densities?.frozen ?? 0;
      if (rain > 0 && now >= this.nextDropletAt) {
        // Density is presence/count-based; amplitude uses estimated rate, not count.
        const strength = clampUnit(precipitation.strength);
        this.shapeRecording('rain', 0.045 + 0.035 * strength, 0.16, 0.75);
        this.nextDropletAt = now + Math.max(2.0, 6.8 - rain * 0.6);
      }
      if (frozen > 0 && now >= this.nextFrozenAt) {
        // Only a frozen-class presence count is claimed for its quiet sparse swell.
        this.shapeRecording('frozen', 0.025, 0.26, 0.95);
        this.nextFrozenAt = now + Math.max(3.8, 8.0 - frozen * 0.5);
      }
    }
    if (this.eligible('active_fires') && now >= this.nextFireAt) {
      const power = clampUnit(this.models.get('active_fires').power);
      const gate = this.gates.get('active_fires');
      if (gate) this.ramp(gate.filter.frequency, 850 + power * 1250, 0.6);
      this.shapeRecording('active_fires', 0.045 + power * 0.035, 0.20, 0.85);
      this.nextFireAt = now + FIRE_INTERVAL_SECONDS + (1 - power) * 2;
    }
  }

  takePlaybackSample() {
    if (!this.original) return;
    const now = this.currentTime;
    const delta = Math.max(0, now - this.startedAt);
    this.sourcePosition = (this.sourcePosition || 0) + delta * finite(this.lastSourceRate, 1);
    this.lastSourceRate = finite(this.original.playbackRate.value, 1);
    this.startedAt = now;
  }

  /** Keep progress display bounded at the native buffer loop boundary. */
  checkPlaybackEnd(now) {
    if (this.sourcePosition < this.duration - 0.5) return;
    // The recording's loop is a direct transport operation; no UI timer is needed.
    this.sourcePosition %= this.duration;
  }

  /** Envelope the existing source; never start an independent buffer or pitch. */
  shapeRecording(gateId, gainLevel, attack = 0.2, release = 0.8) {
    const id = gateId === 'rain' || gateId === 'frozen' ? 'precipitation' : gateId;
    if (!this.ctx || this.ctx.state !== 'running' || !this.audible(id) || this.accents.size >= this.maxAccents) return;
    const gate = this.gates.get(gateId);
    if (!gate) return;
    const parameter = gate.gain.gain;
    const now = this.currentTime;
    const duration = attack + release + 0.15;
    const record = { id, gateId, until: now + duration + 0.45 };
    this.accents.add(record);
    if (typeof parameter.cancelAndHoldAtTime === 'function') parameter.cancelAndHoldAtTime(now);
    else {
      parameter.cancelScheduledValues(now);
      parameter.setValueAtTime(parameter.value, now);
    }
    parameter.setValueAtTime(0, now);
    parameter.linearRampToValueAtTime(Math.min(0.085, finite(gainLevel, 0)), now + attack);
    parameter.setTargetAtTime(0, now + attack + 0.15, Math.max(0.05, release / 3));
    parameter.setValueAtTime(0, now + duration);
    this.targets.set(parameter, 0);
  }

  getOutputMetrics() {
    if (!this.analyser || !this.ctx) return null;
    const samples = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(samples);
    const measure = values => {
      let peak = 0, sum = 0;
      for (const sample of values) {
        peak = Math.max(peak, Math.abs(sample));
        sum += sample * sample;
      }
      return { rms: Math.sqrt(sum / values.length), peak };
    };
    const overall = measure(samples);
    const channels = [measure(samples)];
    if (typeof this.ctx.createChannelSplitter === 'function' && typeof this.ctx.createAnalyser === 'function') {
      try {
        if (!this.stereoMeter) {
          this.stereoMeter = { splitter: this.ctx.createChannelSplitter(2), analysers: [] };
          for (let channel = 0; channel < 2; channel++) {
            const analyser = this.ctx.createAnalyser();
            analyser.fftSize = this.analyser.fftSize;
            analyser.smoothingTimeConstant = this.analyser.smoothingTimeConstant;
            this.stereoMeter.splitter.connect(analyser, channel);
            this.stereoMeter.analysers.push(analyser);
          }
          // Meter-only splitter outputs do not connect to the audio destination.
          this.analyser.connect(this.stereoMeter.splitter);
        }
        for (let channel = 0; channel < 2; channel++) {
          const channelSamples = new Float32Array(this.stereoMeter.analysers[channel].fftSize);
          this.stereoMeter.analysers[channel].getFloatTimeDomainData(channelSamples);
          channels[channel] = measure(channelSamples);
        }
      } catch {
        // Overall analyser remains compatible; stereo fields honestly unavailable.
      }
    }
    return { ...overall, channels, spatial: this.spatial.getDiagnostics(), contextState: this.ctx.state };
  }

  stopSources() {
    this.playRequest++;
    this.isRunning = false;
    clearInterval(this.timer);
    this.timer = null;
    this.nextDropletAt = 0;
    this.nextFrozenAt = 0;
    this.nextFireAt = 0;
    this.accents.clear();
    if (this.original) {
      this.takePlaybackSample();
      try { this.original.stop(); } catch { /* Already ended. */ }
      this.original.disconnect();
      this.original = null;
    }
    for (const { filter, gain } of this.gates.values()) {
      filter.disconnect();
      gain.disconnect();
    }
    this.gates.clear();
    this.targets.clear();
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
    for (const record of this.accents) {
      const gate = this.gates.get(record.gateId);
      if (gate) {
        gate.gain.gain.cancelScheduledValues(this.currentTime);
        gate.gain.gain.value = 0;
        this.targets.set(gate.gain.gain, 0);
      }
    }
    this.accents.clear();
    this.nextDropletAt = 0;
    this.nextFrozenAt = 0;
    this.nextFireAt = 0;
    if (this.master) this.ramp(this.master.gain, 0, 0.04);
    if (this.ctx && this.ctx.state === 'running') await this.ctx.suspend();
    this.onChange?.(this);
  }

  async reset() {
    this.stopSources();
    if (this.master) {
      const now = this.currentTime;
      if (typeof this.master.gain.cancelAndHoldAtTime === 'function') this.master.gain.cancelAndHoldAtTime(now);
      else this.master.gain.cancelScheduledValues?.(now);
      this.master.gain.value = 0;
    }
    if (this.ctx && this.ctx.state === 'running') await this.ctx.suspend();
    this.onChange?.(this);
  }

  async dispose() {
    await this.reset();
    // Cut any pending decode's publication before disconnecting the shared graph.
    this.playRequest++;
    this.spatial.dispose();
    this.master?.disconnect();
    this.limiter?.disconnect();
    this.analyser?.disconnect();
    this.stereoMeter?.splitter.disconnect();
    this.stereoMeter?.analysers.forEach(analyser => analyser.disconnect());
    if (this.ctx && this.ctx.state !== 'closed') await this.ctx.close();
    this.ctx = null;
    this.master = null;
    this.limiter = null;
    this.analyser = null;
    this.stereoMeter = null;
    this.buffer = null;
    this.loading = null;
    this.onChange = null;
  }
}
