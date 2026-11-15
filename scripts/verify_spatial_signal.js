import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = process.env.JUKEBOX_URL || 'http://127.0.0.1:8001';
if (!/^(127\.0\.0\.1|localhost|\[::1\])$/.test(new URL(origin).hostname)) throw new Error('The stereo audit may only target a local current-source server.');
const browser = await chromium.launch({ headless: process.env.HEADED !== '1' });
try {
  const page = await browser.newPage();
  await page.goto(origin, { waitUntil: 'networkidle' });
  const result = await page.evaluate(async () => {
    let sourcesCreated = 0;
    const { SpatialRenderer, inverseDistanceGain, sphericalDirection } =
      await import(`./src/audio/spatialRenderer.js?stereo-audit=${Date.now()}`);
    // Different, opposite-polarity buffer waveforms: half the nominal input
    // amplitude on the right. Their nonzero sum is the renderer's mono input.
    // Neither the input nor metrics provide a second graph-to-destination route.
    let configuredChannelCount = null;
    let configuredChannelCountMode = null;
    async function render(position, panningModel = 'HRTF') {
      const context = new OfflineAudioContext({ numberOfChannels: 2, length: 48000, sampleRate: 48000 });
      const source = context.createBufferSource();
      sourcesCreated++;
      const buffer = context.createBuffer(2, context.length, context.sampleRate);
      const inputLeft = new Float32Array(context.length), inputRight = new Float32Array(context.length);
      for (let i = 0; i < context.length; i++) {
        inputLeft[i] = 0.3 * Math.sin(2 * Math.PI * 1230 * i / context.sampleRate);
        inputRight[i] = -0.15 * Math.sin(2 * Math.PI * 2875 * i / context.sampleRate + 0.37);
      }
      buffer.copyToChannel(inputLeft, 0);
      buffer.copyToChannel(inputRight, 1);
      source.buffer = buffer;
      const splitter = context.createChannelSplitter(2);
      const merger = context.createChannelMerger(2);
      source.connect(splitter);
      splitter.connect(merger, 0, 0);
      splitter.connect(merger, 1, 1);
      const output = context.createGain();
      const renderer = new SpatialRenderer({ panningModel, transitionSeconds: 0 });
      renderer.attach(context, merger, output);
      configuredChannelCount = renderer.panner?.channelCount ?? null;
      configuredChannelCountMode = renderer.panner?.channelCountMode ?? null;
      if (position) {
        renderer.setEnabled(true);
        renderer.setSourcePosition(position);
      }
      output.connect(context.destination);
      renderer.reset();
      if (position) {
        renderer.setSourcePosition(position);
        renderer.setEnabled(true);
      }
      source.start();
      const rendered = await context.startRendering();
      const left = rendered.getChannelData(0), right = rendered.getChannelData(1);
      const measure = samples => {
        let sum = 0, peak = 0;
        for (let i = 4096; i < samples.length; i++) {
          sum += samples[i] ** 2;
          peak = Math.max(peak, Math.abs(samples[i]));
        }
        return { rms: Math.sqrt(sum / (samples.length - 4096)), peak };
      };
      const lte = measure(left), rte = measure(right);
      const differentSigns = [...inputLeft].some((value, i) => Math.sign(value) === -Math.sign(inputRight[i]) && value && inputRight[i]);
      const correlation = (a, b) => {
        let ab = 0, aa = 0, bb = 0;
        for (let i = 4096; i < a.length; i++) { ab += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2; }
        return ab / Math.sqrt(aa * bb);
      };
      renderer.dispose();
      return { left: lte, right: rte, differentSigns, correlation: correlation(left, right),
        panningModel: renderer.panningModel, routes: output.numberOfInputs };
    }
    const [center, right, left, coincident, equalpowerCenter] = await Promise.all([
      render({ x: 0, y: 1, z: 0 }),
      render({ x: 2, y: 0, z: 0 }),
      render({ x: -2, y: 0, z: 0 }),
      render({ x: 0, y: 0, z: 0 }),
      render({ x: 0, y: 1, z: 0 }, 'equalpower'),
    ]);
    return {
      center, right, left, coincident,
      centerChannelRmsRatio: center.left.rms / center.right.rms,
      rightLeftEnergyRatio: right.right.rms / right.left.rms,
      leftRightEnergyRatio: left.left.rms / left.right.rms,
      finiteCoincident: [coincident.left, coincident.right].every(v => Number.isFinite(v.rms) && Number.isFinite(v.peak)),
      coLocatedDirection: sphericalDirection({ x: 0, y: 0, z: 0 }),
      inverseGainAtZero: inverseDistanceGain(0),
      input: { leftAmplitude: 0.3, oppositePolarityRightAmplitude: 0.15, frequenciesHz: [1230, 2875], sourceEvents: 1, generatedOscillators: 0 },
      sourcesCreated,
      nativeInputConfiguration: { channelCount: configuredChannelCount, channelCountMode: configuredChannelCountMode },
      equalpowerCenter: { panningModel: equalpowerCenter.panningModel, left: equalpowerCenter.left, right: equalpowerCenter.right },
    };
  });
  console.log('STEREO_SIGNAL_MEASUREMENTS', JSON.stringify(result));
  assert.equal(result.center.differentSigns, true);
  assert.ok(Math.abs(result.center.left.rms / result.center.right.rms - 1) < 0.01, 'the one centered source produces correlated, balanced channels');
  assert.ok(result.center.correlation > 0.9999, 'centered mono-mixed input stays correlated, not inverted');
  assert.ok(result.rightLeftEnergyRatio > 1.2, 'right source must deliver more right-ear energy');
  assert.ok(result.leftRightEnergyRatio > 1.2, 'left source must deliver more left-ear energy');
  assert.equal(result.finiteCoincident, true);
  assert.equal(result.coLocatedDirection.directional, false);
  assert.equal(result.inverseGainAtZero, 1);
  assert.equal(result.equalpowerCenter.panningModel, 'equalpower');
  assert.equal(result.sourcesCreated, 5, 'one prerecorded buffer per independent offline case; no new source during panning');
  assert.deepEqual(result.nativeInputConfiguration, { channelCount: 1, channelCountMode: 'explicit' });
  console.log(JSON.stringify({ status: 'passed', origin, ...result,
    caveat: 'Numerical OfflineAudioContext channel-RMS/peak checks, not subjective listening, speaker audibility, CIPIC data, or geographic source measurements. HRTF is browser-generic; manual stereo-headphone localization verification is still needed.' }, null, 2));
} finally {
  await browser.close();
}
