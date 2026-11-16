import { createHeadDirectionState } from './headDirection.js';
import { PreviewTravelController } from './headPreviewController.js';
import { HEAD_LOG_FORMAT } from './headLog.js';

const same = (a, b) => a.action === b.action && a.direction === b.direction && a.to === b.to;
const agree = row => Boolean(row.logged && row.replayed && same(row.logged, row.replayed));

/** Pairs logged and replayed decisions by time, so one extra or missing decision does not shift the rest. */
function pairByTime(logged, replayed) {
  const rows = [];
  let i = 0;
  let j = 0;
  while (i < logged.length || j < replayed.length) {
    const a = logged[i];
    const b = replayed[j];
    if (a && b && a.t === b.t) {
      rows.push({ t: a.t, logged: a, replayed: b });
      i++;
      j++;
    } else if (a && (!b || a.t < b.t)) {
      rows.push({ t: a.t, logged: a, replayed: null });
      i++;
    } else {
      rows.push({ t: b.t, logged: null, replayed: b });
      j++;
    }
  }
  return rows;
}

/**
 * Replays a saved head log through the current classifier and travel controller.
 * Camera frames are classified again, as useHeadDirection does it. Everything else is
 * taken from the log as it happened: camera on and off, Calibrate front, resets, head
 * travel switched on or off, keyboard and map moves, and directions from other sources.
 * Returns the logged and replayed decisions paired by time (`rows`) and the first row where
 * they differ (-1 when they agree). A log that lost its oldest entries starts mid-session,
 * so its rows are compared from the first one both runs agree on (`comparedFrom`).
 * `config` overrides classifier settings, e.g. { oppositeDwellMs: 200 }.
 */
export function replayHeadLog(log, { config = {} } = {}) {
  if (log?.format !== HEAD_LOG_FORMAT || !Array.isArray(log.entries)) throw new TypeError('Not an Immearth head log.');
  let state = null;
  let published;
  let enabled = false;
  let controller = null;
  const events = [];
  const replayed = [];
  const deliver = event => {
    events.push(event);
    if (!enabled || !controller) return;
    const decision = controller.onDirection(event);
    if (decision.action !== 'none') replayed.push({ t: event.now, source: event.source, ...decision });
  };
  for (const entry of log.entries) {
    if (entry.kind === 'region') {
      if (!controller) controller = new PreviewTravelController(entry.index);
      else if (entry.cause !== 'head') controller.setCommittedIndex(entry.index);
    } else if (entry.kind === 'session') {
      if (entry.action === 'travel') {
            enabled = Boolean(entry.enabled);
        controller?.cancel();
      } else if (entry.action === 'camera-on') {
        state = createHeadDirectionState(config);
        published = undefined;
      } else if (entry.action === 'camera-off' || entry.action === 'camera-error') {
        state = null;
      } else if (entry.action === 'calibrated' || entry.action === 'reset') {
        state?.stop();
      }
    } else if (entry.kind === 'frame' && state) {
      // The first visible face sets the calibration: the hook reads it as front.
      const pose = Number.isFinite(entry.yaw) && Number.isFinite(entry.pitch) ? { yaw: entry.yaw, pitch: entry.pitch } : null;
      const output = state.poseAt(entry.cal ? { yaw: 0, pitch: 0 } : pose, entry.t);
      const direction = entry.cal ? 'forward' : output.direction;
      if (direction !== published) {
        published = direction;
        deliver({ direction, now: entry.t, source: 'head' });
      }
    } else if (entry.kind === 'event' && entry.source !== 'head') {
      deliver({ direction: entry.direction, now: entry.t, source: entry.source });
    }
  }
  const logged = log.entries.filter(entry => entry.kind === 'travel');
  const rows = pairByTime(logged, replayed);
  // The replay's classifier starts fresh where a dropped log begins, so its first
  // decisions there may differ for that reason alone.
  const comparedFrom = log.dropped > 0 ? Math.max(0, rows.findIndex(agree)) : 0;
  const firstDifference = rows.findIndex((row, i) => i >= comparedFrom && !agree(row));
  return { replayed, logged, rows, comparedFrom, firstDifference, events, summary: summarize(log.entries, replayed) };
}

function summarize(entries, replayed) {
  const frames = entries.filter(entry => entry.kind === 'frame');
  const gaps = frames.slice(1).map((frame, i) => frame.t - frames[i].t).sort((a, b) => a - b);
  const count = (list, action) => list.filter(decision => decision.action === action).length;
  const logged = entries.filter(entry => entry.kind === 'travel');
  const tally = list => Object.fromEntries(['preview', 'move', 'late', 'edge', 'cancel'].map(action => [action, count(list, action)]));
  return {
    frames: frames.length,
    faceLost: frames.filter(frame => !frame.face).length,
    seconds: frames.length > 1 ? Math.round(frames.at(-1).t - frames[0].t) / 1000 : 0,
    frameMs: gaps.length ? { median: gaps[Math.floor(gaps.length / 2)], max: gaps.at(-1) } : null,
    yawRange: frames.some(frame => Number.isFinite(frame.yaw))
      ? [Math.min(...frames.filter(f => Number.isFinite(f.yaw)).map(f => f.yaw)), Math.max(...frames.filter(f => Number.isFinite(f.yaw)).map(f => f.yaw))]
      : null,
    logged: tally(logged),
    replayed: tally(replayed),
  };
}
