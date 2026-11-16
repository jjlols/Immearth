#!/usr/bin/env node
/**
 * Replays a head log saved with "Save head log" on the Live Map through the current
 * head classifier and travel controller. It prints what the saved run did next to what
 * this code does, so a head-travel problem on a tester's machine can be traced.
 *
 *   node scripts/replay_head_log.mjs immearth-head-log-<time>.json
 *   node scripts/replay_head_log.mjs <log> --set oppositeDwellMs=200 --set centerDwellMs=60
 *   node scripts/replay_head_log.mjs <log> --events     also list every published direction
 */
import { readFileSync } from 'node:fs';
import { HEAD_DIRECTION_DEFAULTS } from '../src/lib/headDirection.js';
import { replayHeadLog } from '../src/lib/headReplay.js';

const args = process.argv.slice(2);
const overrides = {};
let file = null;
let showEvents = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--events') showEvents = true;
  else if (args[i] === '--set') {
    const [key, value] = String(args[++i] ?? '').split('=');
    if (!Object.hasOwn(HEAD_DIRECTION_DEFAULTS, key) || !Number.isFinite(Number(value))) {
      console.error(`--set needs a head setting and a number, e.g. oppositeDwellMs=200. Settings: ${Object.keys(HEAD_DIRECTION_DEFAULTS).join(', ')}`);
      process.exit(2);
    }
    overrides[key] = Number(value);
  } else file = args[i];
}
if (!file) {
  console.error('Usage: node scripts/replay_head_log.mjs <immearth-head-log.json> [--set name=value]... [--events]');
  process.exit(2);
}

const log = JSON.parse(readFileSync(file, 'utf8'));
const { rows, comparedFrom, firstDifference, events, summary } = replayHeadLog(log, { config: overrides });
const zero = (log.entries.find(entry => !entry.carried) ?? log.entries[0])?.t ?? 0;
const at = t => ((t - zero) / 1000).toFixed(3).padStart(8);
const describe = d => (d ? `${d.action} ${d.direction ?? ''} ${d.to ?? ''}${Number.isFinite(d.elapsedMs) ? ` (${Math.round(d.elapsedMs)} ms)` : ''}${d.reason ? ` [${d.reason}]` : ''}`.replace(/\s+/g, ' ').trim() : '-');

console.log(`Saved ${log.savedAt} from ${log.userAgent ?? 'an unknown browser'}`);
console.log(`${log.entries.length} entries${log.dropped ? `, ${log.dropped} oldest dropped` : ''}; ${summary.frames} camera frames over ${summary.seconds} s` +
  (summary.frameMs ? `, frame gap median ${summary.frameMs.median.toFixed(1)} ms, max ${summary.frameMs.max.toFixed(1)} ms` : '') +
  `, face lost in ${summary.faceLost} frames` + (summary.yawRange ? `, yaw ${summary.yawRange[0]} to ${summary.yawRange[1]} degrees` : ''));
const current = { ...HEAD_DIRECTION_DEFAULTS, ...overrides };
const changed = Object.keys(current).filter(key => log.config && log.config[key] !== current[key]);
if (changed.length) console.log(`Settings that differ from the saved run: ${changed.map(key => `${key} ${log.config[key] ?? 'unset'} -> ${current[key]}`).join(', ')}`);
console.log('');
console.log(`    time  ${'saved run'.padEnd(34)}  this code`);
rows.forEach((row, i) => {
  const mark = i === firstDifference ? '   <- first difference' : '';
  console.log(`${at(row.t)}  ${describe(row.logged).padEnd(34)}  ${describe(row.replayed)}${mark}`);
});
if (showEvents) {
  console.log('\nPublished directions (this code):');
  for (const event of events) console.log(`${at(event.now)}  ${event.direction} (${event.source})`);
}
const tally = counts => Object.entries(counts).map(([action, n]) => `${action} ${n}`).join(', ');
console.log(`\nSaved run: ${tally(summary.logged)}`);
console.log(`This code: ${tally(summary.replayed)}`);
if (comparedFrom > 0) console.log(`The log starts mid-session (${log.dropped} oldest entries dropped), so rows before row ${comparedFrom + 1} are not compared.`);
console.log(firstDifference === -1 ? 'Same travel decisions.' : `Decisions differ from row ${firstDifference + 1}.`);
