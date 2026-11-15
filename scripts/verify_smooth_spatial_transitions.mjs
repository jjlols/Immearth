import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = process.env.JUKEBOX_URL || 'http://127.0.0.1:8001';
if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(origin).hostname)) {
  throw new Error('Only a local current-source server is allowed.');
}
const browser = await chromium.launch({ headless: process.env.HEADED !== '1' });
try {
  const page = await browser.newPage();
  await page.goto(origin, { waitUntil: 'networkidle' });
  const report = await page.evaluate(async () => {
    const { SpatialRenderer } = await import('/src/audio/spatialRenderer.js');
    async function render(sequence) {
      const sampleRate = 48000;
      const context = new OfflineAudioContext({ numberOfChannels: 2, length: sampleRate, sampleRate });
      const buffer = context.createBuffer(1, context.length, sampleRate);
      const samples = buffer.getChannelData(0);
      for (let index = 0; index < samples.length; index++) {
        const time = index / sampleRate;
        samples[index] = 0.12 * Math.sin(2 * Math.PI * 173 * time) +
          0.06 * Math.sin(2 * Math.PI * 391 * time);
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.start();
      const output = context.createGain();
      const renderer = new SpatialRenderer({ transitionSeconds: 0.06 });
      renderer.attach(context, source, output);
      const panner = renderer.panner;
      renderer.setEnabled(true);
      output.connect(context.destination);
      for (const [seconds, x, y, z] of sequence) {
        context.suspend(seconds).then(() => {
          renderer.setSourcePosition({ x, y, z });
          return context.resume();
        });
      }
      const rendered = await context.startRendering();
      const channels = [rendered.getChannelData(0), rendered.getChannelData(1)];
      let peak = 0, maxSampleJump = 0, nonFiniteSamples = 0;
      for (const channel of channels) {
        for (let index = 0; index < channel.length; index++) {
          if (!Number.isFinite(channel[index])) nonFiniteSamples++;
          peak = Math.max(peak, Math.abs(channel[index]));
          if (index) maxSampleJump = Math.max(maxSampleJump, Math.abs(channel[index] - channel[index - 1]));
        }
      }
      const movementWindow = sequence.map(([seconds]) => {
        const start = Math.round(seconds * sampleRate);
        const finish = Math.round((seconds + 0.04) * sampleRate);
        let jump = 0;
        for (const channel of channels) {
          for (let index = start + 1; index < finish; index++) {
            jump = Math.max(jump, Math.abs(channel[index] - channel[index - 1]));
          }
        }
        return { seconds, maxSampleJump: jump };
      });
      return {
        peak, maxSampleJump, nonFiniteSamples, movementWindow,
        unchangedPanner: panner === renderer.panner,
        route: renderer.getDiagnostics().route,
      };
    }
    return {
      directionChanges: await render([[0.2, 2, 0, 0], [0.35, -2, 0, 0], [0.5, 0, 2, 0], [0.65, 0, -2, 0]]),
      interruptedChanges: await render([[0.2, 2, 0, 0], [0.22, -2, 0, 0], [0.24, 0, 2, 0], [0.26, 0, 0, 0], [0.28, -2, 0, 0]]),
    };
  });
  for (const [name, measurement] of Object.entries(report)) {
    assert.equal(measurement.nonFiniteSamples, 0, `${name} stays finite`);
    assert.equal(measurement.unchangedPanner, true, `${name} never replaces the HRTF panner`);
    assert.ok(measurement.peak > 0.01 && measurement.peak < 0.9, `${name} remains audible and bounded`);
    assert.ok(measurement.maxSampleJump < 0.1, `${name} has no large single-sample discontinuity`);
  }
  console.log(JSON.stringify({ status: 'passed', origin, ...report,
    caveat: 'Offline full-buffer signal checks measure continuity, not subjective speaker audibility or HRTF quality.' }, null, 2));
} finally {
  await browser.close();
}
