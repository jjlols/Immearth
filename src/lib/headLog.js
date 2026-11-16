/**
 * A bounded in-memory log of head travel: each camera frame as the head angles the
 * classifier saw, each published direction and each travel decision. It holds numbers
 * and labels only, never a camera image, and stays in the page until the tester saves
 * it ("Save head log" in HeadDirectionControl). scripts/replay_head_log.mjs replays a
 * saved log through the current code, so a report from another machine can be checked.
 */
export const HEAD_LOG_FORMAT = 'immearth-head-log';
export const HEAD_LOG_VERSION = 1;

// A region, head-travel switch or camera state that falls off the front of a full log is
// carried as context: a saved log starts with the newest of each, so the replay of a long
// session still knows the listener's region, whether head travel was on and whether the
// camera was running.
function contextKey(entry) {
  if (entry?.kind === 'region') return 'region';
  if (entry?.kind !== 'session') return null;
  if (entry.action === 'travel') return 'travel';
  return ['camera-on', 'camera-off', 'camera-error'].includes(entry.action) ? 'camera' : null;
}

const round = (value, digits) => {
  const scale = 10 ** digits;
  return Number.isFinite(value) ? Math.round(value * scale) / scale : null;
};

export function createHeadLog({ capacity = 30000, clock = () => performance.now() } = {}) {
  if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('Head log capacity must be a positive integer.');
  let ring = new Array(capacity);
  let next = 0;
  let size = 0;
  let dropped = 0;
  let carried = {};
  const entries = () => {
    const start = (next - size + capacity) % capacity;
    return Array.from({ length: size }, (_, i) => ring[(start + i) % capacity]);
  };
  return {
    /** Adds one entry; the oldest entry goes once the log is full. */
    record(kind, { t = clock(), ...fields } = {}) {
      const entry = { t: round(t, 2), kind, ...fields };
      if (size === capacity) {
        dropped++;
        const key = contextKey(ring[next]);
        if (key) carried[key] = ring[next];
      } else size++;
      ring[next] = entry;
      next = (next + 1) % capacity;
      return entry;
    },
    entries,
    get size() { return size; },
    get dropped() { return dropped; },
    clear() {
      ring = new Array(capacity);
      next = 0;
      size = 0;
      dropped = 0;
      carried = {};
    },
    /**
     * The saved file: format, when, how many entries fell off the front, the caller's
     * details, then the context carried from the dropped entries and the kept entries.
     */
    snapshot(details = {}) {
      const context = Object.values(carried).sort((a, b) => a.t - b.t).map(entry => ({ ...entry, carried: true }));
      return { format: HEAD_LOG_FORMAT, version: HEAD_LOG_VERSION, savedAt: new Date().toISOString(), dropped, ...details, entries: [...context, ...entries()] };
    },
  };
}

/** One camera frame: the calibrated head angles the classifier saw and what it decided. */
export function frameEntry(now, result, output) {
  return {
    t: now,
    face: Boolean(result?.facialTransformationMatrixes?.[0]),
    yaw: round(output?.pose?.yaw, 4),
    pitch: round(output?.pose?.pitch, 4),
    direction: output?.direction ?? null,
    candidate: output?.candidate ?? null,
    calibrated: Boolean(output?.calibrated),
    ...(output?.calibratedNow ? { cal: true } : {}),
    ...(output?.holding ? { holding: true } : {}),
  };
}

/** The page's one head log. */
export const headLog = createHeadLog();
