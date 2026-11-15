import test from 'node:test';
import assert from 'node:assert/strict';
import {
 cartesian,distanceBetween,toWebAudioPosition,fromWebAudioPosition,sphericalDirection,sphericalToPosition,
 wrapAngle,headRadiusITD,inverseDistanceGain,listenerRelativePosition,SpatialRenderer,
} from '../src/audio/spatialRenderer.js';
const close=(a,b,e=1e-9)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);

test('native coordinate conversion and invalid geographic/nonfinite inputs are distinct',()=>{
 const point={x:0,y:2,z:3};
 assert.deepEqual(toWebAudioPosition(point),{x:0,y:3,z:-2});
 assert.deepEqual(fromWebAudioPosition(toWebAudioPosition(point)),point);
 assert.throws(()=>cartesian({x:0,y:1}),/finite/);
 assert.throws(()=>cartesian({x:Infinity,y:0,z:0}),/finite/);
 assert.throws(()=>cartesian({latitude:49.2827,longitude:-123.1207}),/finite/);
});
test('front/back/right/left/up and origin have explicit directions',()=>{
 close(sphericalDirection({x:2,y:4,z:3}).distance,Math.sqrt(29));
 close(sphericalDirection({x:1,y:0,z:0}).azimuth,Math.PI/2);
 close(sphericalDirection({x:-1,y:0,z:0}).azimuth,-Math.PI/2);
 close(sphericalDirection({x:0,y:1,z:0}).azimuth,0);
 close(Math.abs(sphericalDirection({x:0,y:-1,z:0}).azimuth),Math.PI);
 close(sphericalDirection({x:0,y:0,z:2}).elevation,Math.PI/2);
 assert.equal(sphericalDirection({x:0,y:0,z:0}).directional,false);
 assert.equal(listenerRelativePosition({x:1,y:0,z:0},{x:0,y:0,z:0},{x:1,y:0,z:0}).z,-1);
 assert.throws(()=>listenerRelativePosition({x:1,y:0,z:0},{x:0,y:0,z:0},{x:0,y:0,z:0}),/nonzero/);
 assert.throws(()=>listenerRelativePosition({x:1,y:0,z:0},{x:0,y:0,z:0},{x:0,y:1,z:0},{x:0,y:2,z:0}),/parallel/);
});
test('spherical seam and zero radius wrap continuously',()=>{
 close(wrapAngle(3*Math.PI),-Math.PI);
 close(sphericalDirection(sphericalToPosition(Math.PI-1e-6,0),sphericalToPosition(-Math.PI+1e-6,0)).distance,0,2e-5);
 assert.deepEqual(sphericalToPosition(0,0,0,{x:1,y:2,z:3}),{x:1,y:2,z:3});
 assert.throws(()=>sphericalToPosition(0,0,-1),/non-negative/);
 assert.throws(()=>wrapAngle(NaN),/finite/);
});
test('distance and head radius bounded ITD remain finite and explicit',()=>{
 assert.equal(inverseDistanceGain(0),1);
 assert.equal(inverseDistanceGain(1,{rolloffFactor:0}),1);
 close(inverseDistanceGain(2),.5);
 assert.throws(()=>inverseDistanceGain(-1),/non-negative/);
 assert.throws(()=>inverseDistanceGain(2,{referenceDistance:0}),/non-negative/);
 assert.throws(()=>inverseDistanceGain(NaN),/finite/);
 assert.ok(headRadiusITD(Math.PI/2)>0);
 assert.ok(headRadiusITD(-Math.PI/2)<0);
 assert.equal(headRadiusITD(0),0);
 assert.equal(headRadiusITD(Math.PI/2,0),0);
 assert.throws(()=>headRadiusITD(0,-1),/non-negative/);
});
function parameter(){return {value:0,cancelScheduledValues(){return this},cancelAndHoldAtTime(){return this},setValueAtTime(v){this.value=v;return this},linearRampToValueAtTime(v){this.value=v;return this},setTargetAtTime(v){this.value=v;return this}}}
function node(name){return {name,connections:new Set(),connect(destination){this.connections.add(destination);return destination},disconnect(){this.connections.clear()}}}
class Context {
 constructor(){this.currentTime=20;this.listener={};this.panners=[];Context.count++;}
 createGain(){const n=node('gain');n.gain=parameter();return n}
 createPanner(){this.panner=node('panner');for(const a of ['X','Y','Z'])this.panner[`position${a}`]=parameter();this.panners.push(this.panner);return this.panner;}
 get listenerParams(){for(const p of ['position','forward','up'])for(const a of ['X','Y','Z'])this.listener[`${p}${a}`]=parameter();return this.listener;}
}
Context.count=0;
test('constructor/time/context/allocation is lazy; no new panner in renderer reset/replacement directions',()=>{
 const renderer=new SpatialRenderer();
 assert.equal(renderer.ctx,undefined);
 assert.equal(renderer.referenceDistance,2,'the 2 m artistic preview should not halve its recording level');
 assert.equal(inverseDistanceGain(2,{referenceDistance:renderer.referenceDistance}),1);
 for(const position of [{x:2,y:0,z:0},{x:-2,y:0,z:0},{x:0,y:2,z:0},{x:0,y:-2,z:0}]) {
  assert.equal(inverseDistanceGain(distanceBetween(position),{referenceDistance:renderer.referenceDistance}),1,'all four direction previews preserve the source level');
 }
 assert.ok(inverseDistanceGain(4,{referenceDistance:renderer.referenceDistance})<1,'farther sources still attenuate');
 const ctx=new Context(),input=node('input'),output=node('output');
 renderer.attach(ctx,input,output);
 renderer.setEnabled(true);
 renderer.setSourcePosition({x:2,y:0,z:0});
 assert.equal(ctx.panners[0].positionX.value,2);
 renderer.setSourcePosition({x:0,y:0,z:0});
 assert.equal(renderer.getDiagnostics().route,'bypass-only');
 assert.equal(renderer.dryGain.gain.value,1);
 assert.equal(renderer.wetGain.gain.value,0);
 assert.equal(ctx.panners.length,1);
 renderer.dispose();
 assert.equal(renderer.getDiagnostics().enabled,false);
});
