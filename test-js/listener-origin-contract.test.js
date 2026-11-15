import test from 'node:test';
import assert from 'node:assert/strict';
import { SpatialRenderer } from '../src/audio/spatialRenderer.js';
import { RemixEngine } from '../src/audio/RemixEngine.js';

function audioParam(value = 0) {
 return { value, events: [], cancelScheduledValues(t) { this.events.push(['cancel',t]); return this; },
  cancelAndHoldAtTime(t) { this.events.push(['hold',t]); return this; },
  setValueAtTime(v,t) { this.value=v; this.events.push(['set',v,t]); return this; },
  setTargetAtTime(v,t,s) { this.value=v; this.events.push(['target',v,t,s]); return this; },
  linearRampToValueAtTime(v,t) { this.value=v; this.events.push(['ramp',v,t]); return this; } };
}
class Node {
 constructor(name) { this.name=name; this.outputs=new Set(); this.context=null; }
 connect(node) { this.outputs.add(node); return node; }
 disconnect() { this.outputs.clear(); }
}
class Panner extends Node {
 constructor() { super('panner'); for (const axis of ['X','Y','Z']) this[`position${axis}`]=audioParam(); }
}
function createContext() {
 const context = { currentTime: 100, panners: [], listener: {}, destination: new Node('destination') };
 context.createGain=()=> { const node = new Node('gain'); node.gain=audioParam(); node.context=context; return node; };
 context.createPanner=()=> { const node=new Panner();context.panners.push(node);return node; };
 for (const prefix of ['position','forward','up']) for (const axis of ['X','Y','Z']) context.listener[`${prefix}${axis}`]=audioParam();
 return context;
}

test('right -> listener origin -> source origin -> left returns direct stereo at zero vector', () => {
 const context=createContext(), input=new Node('input'), output=new Node('output');
 input.context=context;
 const renderer=new SpatialRenderer();
 renderer.attach(context,input,output);
 renderer.settle();
 renderer.setSourcePosition({x:2,y:0,z:0});
 renderer.setEnabled(true);
 renderer.settle();
 assert.equal(renderer.getDiagnostics().route,'panner-only');
 assert.equal(pannerValue(context.panners[0],'X'),2);
 // This models the user's operation order. Listener applies first; it must also be
 // possible to hit an exact origin when source has not yet been reset.
 renderer.setListenerPosition({x:0,y:0,z:0});
 renderer.setListenerOrientation({x:0,y:1,z:0},{x:0,y:0,z:1});
 renderer.setDistanceModel({referenceDistance:1,maxDistance:10000,rolloffFactor:1});
 assert.equal(renderer.setSourcePosition({x:0,y:0,z:0}).distance,0);
 renderer.setEnabled(true);
 renderer.setListenerPosition({x:0,y:0,z:0});
 renderer.settle();
 const diagnostics=renderer.getDiagnostics();
 assert.deepEqual(diagnostics.listenerPosition,{x:0,y:0,z:0});
 assert.deepEqual(diagnostics.sourcePosition,{x:0,y:0,z:0});
 assert.deepEqual(diagnostics.nativeSourcePosition,{x:0,y:0,z:0});
 assert.equal(diagnostics.direction.directional,false);
 assert.equal(diagnostics.route,'bypass-only');
 assert.deepEqual([...input.outputs],[context.panners[0],renderer.dryGain],'nodes stay connected while direction changes');
 assert.equal(renderer.dryGain.gain.value,1,'center uses ordinary stereo');
 assert.equal(renderer.wetGain.gain.value,0,'HRTF branch is muted at center');
 assert.equal(context.panners.length,1,'returning to origin creates no new panner');
 renderer.setSourcePosition({x:-2,y:0,z:0});
 renderer.settle();
 assert.equal(renderer.getDiagnostics().route,'panner-only');
 assert.equal(pannerValue(context.panners[0],'X'),-2);
 renderer.setListenerPosition({x:-2,y:0,z:0});
 assert.equal(renderer.getDiagnostics().distance,0);
 assert.equal(renderer.getDiagnostics().route,'bypass-only');
 renderer.setListenerPosition({x:0,y:0,z:0});
 renderer.setSourcePosition({x:0,y:0,z:0});
 renderer.settle();
 assert.deepEqual([...input.outputs],[context.panners[0],renderer.dryGain]);
 renderer.dispose();
 assert.deepEqual([...input.outputs],[output]);
 assert.equal(renderer.transitionGain, undefined, 'no per-turn transition node is created');
 function pannerValue(panner,axis) { return panner[`position${axis}`].value; }
});

test('rapid direction changes reuse nodes, glide and retain exactly one audible route', () => {
 const context=createContext(), input=new Node('input'), output=new Node('output');
 input.context=context;
 const renderer=new SpatialRenderer({transitionSeconds:.06});
 renderer.attach(context,input,output);
 renderer.setSourcePosition({x:2,y:0,z:0});
 renderer.setEnabled(true);
 const routes=[...input.outputs], panner=context.panners[0];
 assert.deepEqual(routes,[panner,renderer.dryGain]);
 assert.equal(renderer.wetGain.gain.value,1);
 for (const [time,x,y] of [[100.01,-2,0],[100.02,0,2],[100.03,0,-2]]) {
  context.currentTime=time;
  renderer.setSourcePosition({x,y,z:0});
  assert.deepEqual([...input.outputs],routes,'direction edits never disconnect the shared recording');
  assert.equal(context.panners.length,1,'one existing HRTF processor is reused');
  assert.equal(renderer.wetGain.gain.value,1);
  assert.equal(renderer.dryGain.gain.value,0);
 }
 assert.deepEqual(panner.positionX.events.filter(event=>event[0]==='ramp').at(-1),['ramp',0,100.09]);
 assert.equal(panner.positionX.events.filter(event=>event[0]==='ramp').length>1,true);
 context.currentTime=100.04;
 renderer.setSourcePosition({x:0,y:0,z:0});
 assert.equal(renderer.dryGain.gain.value,1,'dry music envelopes to unity at the origin');
 assert.equal(renderer.wetGain.gain.value,0,'directional music envelopes out of the mix');
 renderer.dispose();
 assert.deepEqual([...input.outputs],[output]);
 assert.equal(renderer.transitionGain, undefined, 'no per-turn transition node is created');
 assert.equal(context.panners[0].outputs.size,0);
});

test('RemixEngine console command sequence creates no replacement source/context on origin recenter', async () => {
 const context = createContext();
  context.sources=[];
 context.state='running';
 Object.assign(context, {state:'suspended',resume:async function(){this.state='running';},suspend:async function(){this.state='suspended';},
  close:async function(){this.state='closed';},decodeAudioData:async()=>({duration:123}),
  createBufferSource(){ const node=new Node('recording');node.playbackRate=audioParam(1);node.start=()=>{};node.stop=()=>{};context.sources.push(node);return node; },
  createBiquadFilter(){ const node=new Node('filter');node.frequency=audioParam();node.Q=audioParam();return node; },
  createDynamicsCompressor(){const node=new Node('limiter');for(const p of ['threshold','knee','ratio','attack','release'])node[p]=audioParam();return node;},
  createOscillator(){throw new Error('forbidden in implementation');}
 });
 globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(2)});
 const engine=new RemixEngine({contextClass: class {constructor(){return context;}}});
 await engine.play();
 assert.equal(context.sources.length,1);
 const source=engine.original;
 const before=context.panners.length;
 engine.setSpatialEnabled(true);
 engine.setSpatialSourcePosition({x:2,y:1,z:0});
 engine.setSpatialListenerPosition({x:0,y:0,z:0});
 engine.setSpatialListenerOrientation({x:0,y:1,z:0},{x:0,y:0,z:1});
 engine.setSpatialDistanceModel({referenceDistance:1,maxDistance:10000,rolloffFactor:1});
 engine.setSpatialSourcePosition({x:0,y:0,z:0});
 assert.deepEqual(engine.spatial.getDiagnostics().distance,0);
 assert.equal(engine.original,source);
 assert.equal(context.sources.length,1);
 assert.equal(context.panners.length,before);
 assert.equal(engine.spatial.getDiagnostics().route,'bypass-only');
 engine.spatial.settle();
 assert.equal(engine.master.outputs.size,2,'same recording input feeds complementary dry and spatial gains');
assert.equal(engine.master.outputs.has(engine.limiter),false,'there is no duplicate un-gated programme route');
 await engine.dispose();
 assert.equal(engine.ctx,null);
});
