/** Musical controls derived only from nearest-palette summaries.
 * Palette labels are estimated interpretations of reviewed NASA raster ticks,
 * not official calibrated pixel observations. No brightness or geography is read.
 */
export const AUDIO_BPM = 69;
export const TRACK = Object.freeze({
  title: 'Deliberate Thought',
  artist: 'Kevin MacLeod',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
});
export const CO_PAD_GAINS = Object.freeze([0.008, 0.025, 0.05, 0.085, 0.13]);
export const clamp = (value, min = 0, max = 1) =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
export const median = features => Number(features?.median);

export function logRank(value, min = 0.001, max = 10) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return clamp((Math.log10(value) - Math.log10(min)) / (Math.log10(max) - Math.log10(min)));
}
export const frequency = midi => 440 * 2 ** ((midi - 69) / 12);

export function temperatureRank(value) {
  return Number.isFinite(value) ? clamp((value + 40) / 80) : null;
}
export function temperaturePlaybackRate(value) {
  const rank = temperatureRank(value);
  return rank === null ? 1 : 0.83 + 0.39 * rank;
}

export function coTier(value) {
  if (!Number.isFinite(value)) return 0;
  // The actual reviewed, nonuniform anchors: do not insert a 65 ppbv boundary.
  if (value < 100) return 0;
  if (value < 130) return 1;
  if (value < 200) return 2;
  if (value < 500) return 3;
  return 4;
}
export function coPadGain(value) {
  return Number.isFinite(value) ? CO_PAD_GAINS[coTier(value)] : 0;
}

/** A bounded D-minor pentatonic register; log10 happens before note selection. */
export function pitchNOx(value) {
  if (!Number.isFinite(value) || value <= 0) return null;
  const scale = [0, 3, 5, 7, 10];
  const step = Math.round(logRank(value) * 9);
  return frequency(50 + scale[step % scale.length] + 12 * Math.floor(step / scale.length));
}

/** Return separate droplet densities so rain and frozen scales are never merged. */
export function precipitationDensities({ rain_count = 0, snow_count = 0, max_value } = {}) {
  if (!Number.isFinite(max_value) || max_value > 20) return { rain: 0, frozen: 0 };
  const density = count => count > 0 ? Math.max(1, Math.min(8, Math.round(Math.log2(count + 1)))) : 0;
  return { rain: density(rain_count), frozen: density(snow_count) };
}

export function featureModel(id, features) {
  if (!features || features.status === 'silent' || !(features.classified_count > 0)) {
    return { id, silent: true, classified_count: features?.classified_count || 0 };
  }
  if (id === 'precipitation') {
    const densities = precipitationDensities(features);
    if (densities.rain + densities.frozen === 0) {
      return { id, kind: 'drops', silent: true, classified_count: features.classified_count };
    }
    return {
      id, kind: 'drops', densities,
      ...densities, // Retain the former numeric names alongside explicit densities.
      strength: clamp(Number.isFinite(features.max_value) ? features.max_value / 50 : 0),
      // Compatibility for callers of the earlier feature contract.
      density: Math.max(densities.rain, densities.frozen),
      rain: features.rain_count || 0, snow: features.snow_count || 0,
      frozen: (features.snow_count || 0) > (features.rain_count || 0),
      classified_count: features.classified_count,
    };
  }
  if (id === 'active_fires') {
    const value = median(features);
    return { id, kind: 'mallets', ...(!Number.isFinite(value) ? { silent: true } : { power: clamp(value / 8) }), classified_count: features.classified_count };
  }
  if (id === 'carbon_monoxide') {
    const value = median(features);
    return { id, kind: 'pad', ...(!Number.isFinite(value) ? { silent: true } : { tier: coTier(value), padGain: coPadGain(value), rank: clamp((value - 40) / 460) }), classified_count: features.classified_count };
  }
  if (id === 'nitrogen_oxides') {
    const value = median(features), hz = pitchNOx(value);
    return { id, kind: 'guide-note', ...(!Number.isFinite(hz) ? { silent: true } : { rank: logRank(value), frequency: hz }), classified_count: features.classified_count };
  }
  if (id === 'near_surface_temperature') {
    const value = median(features);
    return { id, kind: 'tempo', ...(!Number.isFinite(value) ? { silent: true } : { rank: temperatureRank(value), playbackRate: temperaturePlaybackRate(value) }), classified_count: features.classified_count };
  }
  throw new Error('Unrecognized canonical scientific field.');
}

export const INSTRUMENT_INFO = Object.freeze({
  precipitation: {
    kind: 'Separate rain and frozen droplets',
    explanation: 'Liquid-rain and frozen-palette matches have separate densities. Higher matched bins create limited clusters of soft droplets; near silence and unmatched colors stay silent.',
    caveat: 'Estimated discrete mm/hour classes (0.1–50). The overflow and no-data/gray cases never receive an invented upper value.',
  },
  active_fires: {
    kind: 'Infrequent fire-strength accents',
    explanation: 'A soft finite mallet/sine accent occurs only after long rests (at least about eight seconds). Its strength follows estimated fire radiative power (FRP).',
    caveat: 'Estimated 0–8 MW anchors. Accents are not fire counts, alarms, detections per second, or a report of current danger.',
  },
  carbon_monoxide: {
    kind: 'Five audible generic pad-volume tiers',
    explanation: 'Estimated CO values select five distinct gain levels on a generic filtered branch of the same recording. Low tiers are sparse; later tiers become clearly more present without lifting the master.',
    caveat: 'Nonuniform 40,100,130,200,500 ppbv estimated anchors. This is carbon monoxide, not CO₂; the filter branch is not an official synth or choir stem.',
  },
  nitrogen_oxides: {
    kind: 'One sustained gliding guide note',
    explanation: 'A single sustained note glides smoothly to a higher bounded musical register as the log₁₀-derived NOₓ estimate rises. Navigation changes its pitch; it does not start audio.',
    caveat: 'Estimated 0.001–10 ppbv labels are log₁₀ mapped before note selection. Concentration and latitude/longitude are never directly converted to pitch.',
  },
  near_surface_temperature: {
    kind: 'Warmer = faster shared recording',
    explanation: 'Estimated −40…+40 °C palette strength changes the entire shared recording from 0.83× to 1.22×. If this voice is absent, hidden or not audible, speed returns to 1×.',
    caveat: 'Playback speed inherently changes pitch too; it is not temperature-as-altitude. Estimated T2M labels retain the NASA short-caption 3 m versus detailed-caption 2 m discrepancy.',
  },
});

export function describeFeature(id, features) {
  const value = number => Number.isFinite(number)
    ? (Math.abs(number) < 1 ? Number(number.toFixed(4)) : Math.round(number * 10) / 10)
    : 'unavailable';
  if (!features || !(features.classified_count > 0) || features.status === 'silent') {
    return 'No confident nearest-palette matches. The selected voice remains silent rather than inventing an observation.';
  }
  if (id === 'carbon_monoxide') return `Estimated CO palette range: ${value(features.q20)}–${value(features.q80)} ppbv → generic pad gain (nonuniform anchors).`;
  if (id === 'nitrogen_oxides') return `Estimated NOₓ palette range: ${value(features.q20)}–${value(features.q80)} ppbv → log₁₀-derived guide-note register.`;
  if (id === 'near_surface_temperature') return `Estimated near-surface palette range: ${value(features.q20)}–${value(features.q80)} °C → shared music speed. T2M; captions differ on 3 m versus 2 m.`;
  if (id === 'active_fires') return `Estimated FRP palette median: ${value(features.median)} MW → sparse accent strength, never an incident count.`;
  if (id === 'precipitation') return `Liquid classes: ${features.rain_count || 0}; frozen classes: ${features.snow_count || 0} → separate limited droplet densities. Gray, unknown and overflow remain uncertain/silent.`;
  return 'Estimated nearest-palette characteristics, not calibrated numeric observations.';
}
