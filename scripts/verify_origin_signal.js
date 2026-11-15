import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const origin = process.env.JUKEBOX_URL || 'http://127.0.0.1:8001';
if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(origin).hostname)) throw new Error('Only a local current-source server is allowed.');
const browser = await chromium.launch({ headless: process.env.HEADED !== '1' });
try {
 const page = await browser.newPage();
 await page.goto(origin, { waitUntil: 'networkidle' });
 const result = await page.evaluate(async () => {
  const { SpatialRenderer } = await import(`./src/audio/spatialRenderer.js?origin-audit=${Date.now()}`);
  async function render(sequence) {
   const rate = 48000;
   const context = new OfflineAudioContext(2, rate, rate);
   const buffer = context.createBuffer(2, rate, rate);
   const left = buffer.getChannelData(0), right = buffer.getChannelData(1);
   for (let index = 0; index < rate; index++) {
    left[index] = 0.3 * Math.sin(2 * Math.PI * 487 * index / rate);
    right[index] = -0.15 * Math.sin(2 * Math.PI * 743 * index / rate + 0.23);
   }
   const source = context.createBufferSource();
   source.buffer = buffer; source.start();
   const splitter = context.createChannelSplitter(2), merger = context.createChannelMerger(2);
   source.connect(splitter); splitter.connect(merger, 0, 0); splitter.connect(merger, 1, 1);
   const output = context.createGain();
   const renderer = new SpatialRenderer({ transitionSeconds: 0.025 });
   renderer.attach(context, merger, output);
   renderer.setEnabled(true); output.connect(context.destination);
   for (const [seconds, sourcePosition, listenerPosition] of sequence) {
    context.suspend(seconds).then(async () => {
     renderer.setSourcePosition(sourcePosition);
     renderer.setListenerPosition(listenerPosition ?? { x: 0, y: 0, z: 0 });
     renderer.setListenerOrientation({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 });
     renderer.setEnabled(true);
     await context.resume();
    });
   }
   const rendered = await context.startRendering();
   const channels = [rendered.getChannelData(0), rendered.getChannelData(1)];
   const measured = channels.map(channel => {
    let sum = 0, peak = 0;
    for (let index = 4096; index < channel.length; index++) {
     sum += channel[index] ** 2; peak = Math.max(peak, Math.abs(channel[index]));
    }
    return { rms: Math.sqrt(sum / (channel.length - 4096)), peak };
   });
   return { left: measured[0], right: measured[1],
    nativeInputChannelCount: renderer.panner.channelCount,
    centered: sequence.length > 1 ? channels.map(channel => {
     let sum = 0, peak = 0;
     for (let index = Math.floor(rate * 0.4); index < channel.length; index++) {
      sum += channel[index] ** 2; peak = Math.max(peak, Math.abs(channel[index]));
     }
     return { rms: Math.sqrt(sum / (channel.length - Math.floor(rate * 0.4))), peak };
    }) : null,
    flow: renderer.getDiagnostics() };
  }
  return {
   origin: await render([[0, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }]]),
   right: await render([[0, { x: 2, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }]]),
   returned: await render([[0, { x: 2, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }],
    [0.3, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }]]),
  };
 });
 for (const state of ['origin', 'returned']) {
  const values = result[state];
  assert.equal(values.flow.route, 'bypass-only', 'origin restores direct stereo');
  assert.equal(values.nativeInputChannelCount, 1);
  const measured = state === 'returned' ? values.centered : [values.left, values.right];
  assert.ok(measured[0].rms > 0 && measured[1].rms > 0, 'both stereo channels are audible after settling');
  assert.ok(Math.abs(measured[0].rms / measured[1].rms - 2) < 0.1, 'unequal input channels retain their 2:1 ratio after centering');
 }
 assert.equal(result.right.flow.route, 'panner-only');
 assert.ok(result.right.right.rms > result.right.left.rms, 'nonzero right direction still pans');
 console.log(JSON.stringify({ status: 'passed', origin, ...result,
  caveat: 'Offline Web Audio RMS verifies the changed signal, not subjective listening or real head tracking.' }, null, 2));
} finally { await browser.close(); }
