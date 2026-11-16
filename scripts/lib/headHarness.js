/**
 * Shared synthetic head-direction harness for the Live Map browser checks.
 *
 * Chromium's fake camera supplies real video frames; `/src/hooks/useHeadDirection.js`
 * is served with its detector loader replaced by `window.DETECTOR`, which returns a
 * face transformation matrix for `window.__HEAD_POSE__`. Nothing here is a real-face,
 * HRTF localisation or speaker-audibility claim. Needs the Vite dev server (it serves
 * /src modules), e.g. JUKEBOX_URL=http://127.0.0.1:8031.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

export const origin = process.env.JUKEBOX_URL || 'http://127.0.0.1:8001';
if (!/^(127\.0\.0\.1|localhost)$/.test(new URL(origin).hostname)) throw new Error('Local-only browser check');

/** Head degrees: positive yaw is the subject's right, positive pitch is up. */
export const POSES = Object.freeze({
  forward: { yaw: 0, pitch: 0 },
  right: { yaw: 25, pitch: 0 },
  left: { yaw: -25, pitch: 0 },
  up: { yaw: 0, pitch: 25 },
  down: { yaw: 0, pitch: -25 },
});
export const POSITIONS = Object.freeze({
  forward: { x: 0, y: 0, z: 0 },
  right: { x: 2, y: 0, z: 0 },
  left: { x: -2, y: 0, z: 0 },
  up: { x: 0, y: 2, z: 0 },
  down: { x: 0, y: -2, z: 0 },
});
/** The head preview controller's return window (src/lib/headPreviewController.js). */
export const RETURN_WINDOW_MS = 1500;
/** Explicitly enables the legacy return-to-travel gesture for regression coverage; production starts listen-only. */
export async function enableHeadTravel(page){ await page.getByLabel("Return with head movement",{exact:true}).check(); }

function installSpies() {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true });
  const spy = window.__HEAD_TEST__ = {
    contexts: 0, sources: 0, decodes: 0, oscillators: 0,
    gum: 0, stops: 0, closes: 0, calls: 0, timestamps: [],
  };
  window.__HEAD_POSE__ = { yaw: 0, pitch: 0, missing: false };
  window.DETECTOR = {
    detectForVideo(video, timestamp) {
      spy.calls++;
      spy.timestamps.push(timestamp);
      const { yaw, pitch, missing } = window.__HEAD_POSE__;
      const y = yaw * Math.PI / 180;
      const p = pitch * Math.PI / 180;
      const forward = [-Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p)];
      return { facialTransformationMatrixes: missing ? [] : [{
        rows: 4, columns: 4, data: [1, 0, 0, 0, 0, 1, 0, 0, ...forward, 0, 0, 0, 0, 1],
      }] };
    },
    close() { spy.closes++; },
  };
  const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async constraints => {
    spy.gum++;
    if (constraints.audio !== false) throw new Error('Microphone is not allowed');
    const stream = await getUserMedia(constraints);
    for (const track of stream.getTracks()) {
      const stop = track.stop.bind(track);
      track.stop = () => { spy.stops++; stop(); };
    }
    return stream;
  };
  const Context = AudioContext;
  window.AudioContext = class extends Context {
    constructor(...args) { super(...args); spy.contexts++; }
    createBufferSource(...args) { spy.sources++; return super.createBufferSource(...args); }
    decodeAudioData(...args) { spy.decodes++; return super.decodeAudioData(...args); }
    createOscillator() { spy.oscillators++; throw new Error('oscillator forbidden'); }
  };
}

export async function openHeadPage({ viewport = { width: 390, height: 844 } } = {}) {
  const browser = await chromium.launch({
    headless: process.env.HEADED !== '1',
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') console.error('browser:', message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(installSpies);
  await page.route('**/src/hooks/useHeadDirection.js*', async route => {
    const response = await route.fetch();
    const source = await response.text();
    if (!source.includes('detectorLoader = defaultDetectorLoader')) throw new Error('Head hook detector injection point changed');
    await route.fulfill({ response, body: source.replace('detectorLoader = defaultDetectorLoader', 'detectorLoader=()=>Promise.resolve(window.DETECTOR)') });
  });
  await page.goto(`${origin}/?view=music`, { waitUntil: 'networkidle' });
  await page.bringToFront();
  if (await page.locator('#intro-skip').count()) await page.locator('#intro-skip').click();
  await page.locator('[data-exploration-region]').waitFor({ state: 'attached' });
  return { browser, page, errors, ...helpers(page) };
}

function helpers(page) {
  const spy = () => page.evaluate(() => { const { timestamps, ...rest } = window.__HEAD_TEST__; return rest; });
  const diag = () => page.evaluate(() => window.__JUKEBOX_AUDIO_REF__.current.spatial.getDiagnostics());
  const marker = () => page.locator('[data-exploration-region]').getAttribute('data-exploration-region');
  const direction = () => page.locator('[data-head-test]').getAttribute('data-direction');
  const status = () => page.locator('[data-head-test]').getAttribute('data-head-test');
  const waitDirection = (label, timeout = 6000) => page.waitForFunction(
    value => document.querySelector('[data-head-test]')?.dataset.direction === value, label, { timeout });
  const waitMarker = (value, timeout = 4000) => page.waitForFunction(
    expected => document.querySelector('[data-exploration-region]')?.dataset.explorationRegion === expected, String(value), { timeout });
  const waitSource = (position, timeout = 4000) => page.waitForFunction(expected => {
    const point = window.__JUKEBOX_AUDIO_REF__.current?.spatial.getDiagnostics().sourcePosition;
    return point && point.x === expected.x && point.y === expected.y && point.z === expected.z;
  }, position, { timeout });
  /** Let the detector sample `count` more frames so any wrong reaction would have happened. */
  const frames = async (count = 4) => {
    const start = await page.evaluate(() => window.__HEAD_TEST__.calls);
    await page.waitForFunction(([from, n]) => window.__HEAD_TEST__.calls >= from + n, [start, count], { timeout: 4000 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  const setPose = pose => page.evaluate(value => { window.__HEAD_POSE__ = { yaw: 0, pitch: 0, missing: false, ...value }; }, pose);
  /** Turn the synthetic head to a named direction (or a raw pose) and wait for the published label. */
  const look = async (label, pose = POSES[label]) => {
    await setPose(pose);
    await waitDirection(label);
  };
  const loseFace = async () => {
    await setPose({ missing: true });
    await waitDirection('uncertain');
  };
  const enableCamera = async () => {
    await page.getByRole('button', { name: 'Enable camera', exact: true }).click();
    await page.waitForSelector('[data-head-test="active"]', { timeout: 10000 });
    // The first visible face is the initial front (relative calibration).
    await waitDirection('forward');
  };
  const stopCamera = async () => {
    await page.getByRole('button', { name: 'Stop camera', exact: true }).click();
    await page.waitForSelector('[data-head-test="off"]', { timeout: 4000 });
  };
  const play = async () => {
    await page.getByRole('button', { name: 'Play remix', exact: true }).click();
    await page.waitForFunction(() => window.__JUKEBOX_AUDIO_REF__.current?.isRunning, null, { timeout: 45000 });
  };
  /** Exploration keys act only on a blurred document (never inside buttons or form controls). */
  const press = async (...keys) => {
    await page.evaluate(() => document.activeElement?.blur?.());
    for (const key of keys) await page.keyboard.press(key);
  };
  const noHorizontalOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  return { spy, diag, marker, direction, status, waitDirection, waitMarker, waitSource, frames, setPose, look, loseFace, enableCamera, stopCamera, play, press, noHorizontalOverflow };
}

/** Independent listener-relative native Web Audio mapping: +x right, +y up, -z front. */
export function expectedNative(source, orientation) {
  const norm = v => { const m = Math.hypot(v.x, v.y, v.z); return { x: v.x / m, y: v.y / m, z: v.z / m }; };
  const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const front = norm(orientation.forward);
  const right = norm(cross(front, norm(orientation.up)));
  const up = cross(right, front);
  return { x: dot(source, right), y: dot(source, up), z: -dot(source, front) };
}

/** Listener orientation the head hook writes for a calibrated pose (src/lib/headDirection.js). */
export function orientationForPose({ yaw, pitch }) {
  const y = yaw * Math.PI / 180, p = pitch * Math.PI / 180;
  return {
    forward: { x: Math.sin(y) * Math.cos(p), y: Math.cos(y) * Math.cos(p), z: Math.sin(p) },
    up: { x: -Math.sin(y) * Math.sin(p), y: -Math.cos(y) * Math.sin(p), z: Math.cos(p) },
  };
}

export function assertClose(actual, expected, tolerance, message) {
  for (const axis of ['x', 'y', 'z']) {
    assert.ok(Math.abs(actual[axis] - expected[axis]) <= tolerance,
      `${message}: ${axis} ${actual[axis]} != ${expected[axis]} (±${tolerance})`);
  }
}
