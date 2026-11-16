/**
 * Head direction -> spatial source mapping through the synthetic camera driver.
 * Proves the lazy-audio and camera gates, the four artistic source offsets and
 * their native PannerNode mapping, and that a prompt return commits one step.
 * Not a human-camera, HRTF localisation or headphone listening claim.
 */
import assert from 'node:assert/strict';
import {
  openHeadPage, origin, POSES, POSITIONS, RETURN_WINDOW_MS,
  expectedNative, orientationForPose, assertClose,
} from './lib/headHarness.js';

const { browser, page, errors, ...h } = await openHeadPage({ legacyTravelOnRecenter: true });
try {
  assert.equal(await h.status(), 'off');
  assert.equal(await h.marker(), '0');
  await h.press('d', 'a');
  assert.equal(await h.marker(), '0', 'D then A returns to the start region');
  assert.deepEqual(await h.spy(), { contexts: 0, sources: 0, decodes: 0, oscillators: 0, gum: 0, stops: 0, closes: 0, calls: 0 },
    'no AudioContext and no camera request before Play / Enable camera');

  await h.enableCamera();
  assert.equal((await h.spy()).gum, 1);
  // Before Play a look still previews (the marker follows it) but creates no audio;
  // losing the face cancels it, so the committed region is unchanged.
  await h.look('right');
  await h.waitMarker('1');
  await h.loseFace();
  await h.waitMarker('0');
  assert.equal((await h.spy()).contexts, 0, 'head movement never creates audio before Play');
  await h.look('forward');
  await h.frames();
  assert.equal(await h.marker(), '0');

  await h.play();
  assert.deepEqual((await h.diag()).sourcePosition, POSITIONS.forward);
  assert.equal((await h.diag()).route, 'bypass-only');
  const mapping = [];
  let region = 0;
  for (const [label, committedAfterReturn] of [['right', 1], ['left', 0], ['up', 0], ['down', 8]]) {
    const startedAt = Date.now();
    await h.look(label);
    await h.waitSource(POSITIONS[label]);
    // The listener follows the head: wait until the published orientation settles on the pose.
    const orientation = orientationForPose(POSES[label]);
    await page.waitForFunction(expected => {
      const o = window.__JUKEBOX_AUDIO_REF__.current.spatial.getDiagnostics().orientation.forward;
      return Math.abs(o.x - expected.x) < 1e-9 && Math.abs(o.y - expected.y) < 1e-9 && Math.abs(o.z - expected.z) < 1e-9;
    }, orientation.forward, { timeout: 2000 });
    const output = await h.diag();
    assert.deepEqual(output.sourcePosition, POSITIONS[label]);
    assert.equal(output.enabled, true, 'spatial sound is always on');
    assert.equal(output.route, 'panner-only');
    assertClose(output.orientation.up, orientation.up, 1e-9, `${label} listener up`);
    const native = expectedNative(output.sourcePosition, output.orientation);
    assertClose(output.nativeSourcePosition, native, 1e-9, `${label} native source position`);
    // The PannerNode AudioParams ramp to the same listener-relative point.
    await page.waitForFunction(expected => {
      const panner = window.__JUKEBOX_AUDIO_REF__.current.spatial.panner;
      return ['x', 'y', 'z'].every(axis => Math.abs(panner[`position${axis.toUpperCase()}`].value - expected[axis]) < 1e-4);
    }, native, { timeout: 2000 });
    if (label === 'right') assert.ok(native.x > 1.5 && native.z < 0, 'right preview stays right (and ahead) while the head follows');
    if (label === 'left') assert.ok(native.x < -1.5 && native.z < 0, 'left preview stays left while the head follows');
    if (label === 'up') assert.ok(native.z < -1.5, 'up (+y, north) preview stays ahead of the listener');
    if (label === 'down') assert.ok(native.z > 1.5, 'down (-y, south) preview stays behind the listener');
    assert.ok(Date.now() - startedAt < RETURN_WINDOW_MS - 300, `harness too slow to return within the window for ${label}`);

    await h.look('forward');
    await h.waitSource(POSITIONS.forward);
    await h.waitMarker(committedAfterReturn);
    await page.waitForFunction(() => window.__JUKEBOX_AUDIO_REF__.current.spatial.getDiagnostics().orientation.forward.y === 1, null, { timeout: 2000 });
    assert.equal((await h.diag()).route, 'bypass-only');
    mapping.push({ label, sourcePosition: output.sourcePosition, native, from: region, committed: committedAfterReturn });
    region = committedAfterReturn;
  }

  // Read the counters once: the detector keeps sampling frames while the camera is on.
  const { calls, timestamps, ...counters } = await h.spy();
  assert.ok(calls > 0);
  assert.deepEqual(counters, { contexts: 1, sources: 1, decodes: 1, oscillators: 0, gum: 1, stops: 0, closes: 0 });
  assert.equal(await h.noHorizontalOverflow(), true, 'no horizontal overflow at 390px');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'passed', origin, synthetic: true, layout: 390, mapping,
    audio: { contexts: 1, sources: 1, decodes: 1, oscillators: 0 }, cameraRequests: 1,
    limitation: 'Synthetic camera frames and face matrices; no human, real-camera, HRTF localisation or speaker audibility was tested.' }, null, 2));
} finally { await browser.close(); }
