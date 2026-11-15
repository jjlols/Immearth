import test from 'node:test';
import assert from 'node:assert/strict';
import {featureModel, coTier, pitchNOx, logRank} from '../src/audio/musicMappings.js';
import {RemixEngine} from '../src/audio/RemixEngine.js';

function createParams(){
 return {value:0,events:[],cancelScheduledValues(){return this},setTargetAtTime(v){this.value=v;this.events.push(['target',v]);return this},setValueAtTime(v){this.value=v;return this},linearRampToValueAtTime(v){this.value=v;return this},exponentialRampToValueAtTime(v){this.value=v;return this}};
}
class ParamNode {connect(node){this.connect_type=node;return node;}disconnect(){this.closed=true;}}
class MockOscillator extends ParamNode {constructor(){super();this.frequency=createParams();this.type='sine';this.started=0;this.ended=0;}start(){this.started++;}stop(){this.ended++}}
class MockContext {
 constructor(){this.state='suspended';this.currentTime=0;MockContext.instances++;}
 createGain(){const node = new ParamNode();node.gain=createParams();return node;}
 createOscillator(){const osc=new MockOscillator();(this.oscillators ||= []).push(osc);return osc;}
 createBiquadFilter(){const b=new ParamNode();b.frequency=createParams();b.Q=createParams();return b;}
 createDynamicsCompressor(){const c=new ParamNode(); for(const key of ['threshold','knee','ratio','attack','release'])c[key]=createParams();return c;}
 createBufferSource(){const node=new MockOscillator();node.loop=false;return node;}
 get destination(){return {};}
 async resume(){this.state='running'}
 async suspend(){this.state='suspended'}
 async close(){this.state='closed'}
 async decodeAudioData(buffer){this.getTrackLabels={};this.decodeCount=(this.decodeCount||0)+1;return {duration:177.456};}
}
MockContext.instances=0;

test('NOₓ musical register projects log order, not concentration or height',()=>{
 assert(pitchNOx(.001)<pitchNOx(.01));assert(pitchNOx(.01)<pitchNOx(10));assert(pitchNOx(10)<1800);assert.equal(logRank(0),0);
});
test('CO uses nonuniform anchor edges, not linear sensor brightness',()=>{
 assert.equal(coTier(40),0);assert.equal(coTier(100),1);assert.equal(coTier(129),1);assert.equal(coTier(130),2);assert.equal(coTier(200),3);assert.equal(coTier(500),4);
});
test('rain/frozen bins are independent and empty palette result is silent',()=>{
 assert.equal(featureModel('precipitation',{rain_count:0,snow_count:3,classified_count:3,max_value:1}).frozen,true);
 assert.equal(featureModel('precipitation',{rain_count:0,snow_count:0,classified_count:20}).silent,true);
});
test('explicit play-only context, bounded notes, audio source union, mute, lifecycle',async()=>{
 const engine=new RemixEngine({contextClass:MockContext});
 assert.equal(engine.ctx,null);
 engine.setModel({carbon_monoxide:{rank:.5,tier:2,classified_count:3},nitrogen_oxides:{rank:.5,pitches:[290,390,400],classified_count:3},precipitation:{density:2,snow_count:2,rain_count:1,classified_count:7,strength:.2}},{selectedId:'nitrogen_oxides',mode:'solo'});
 assert.equal(MockContext.instances,0);
 globalThis.fetch=()=>Promise.resolve({ok:true,arrayBuffer:async()=>new Int8Array(8).buffer});
 await engine.play(); assert.equal(MockContext.instances,1);await engine.play(); assert.equal(MockContext.instances,1);
 assert.equal(engine.isRunning,true);
 for(let n=0;n<7;n++)engine.setSelected?.('carbon_monoxide');
 engine.setMode('composition');engine.tick();
 for(let n=0;n<200;n++)engine.accent('active_fires',440,.03);assert(engine.accents.size<=engine.maxAccents);
 engine.setVolume(12);assert(engine.master.gain.value<=.24);engine.setMute(true);assert.equal(engine.master.gain.value,0);engine.setMute(false);
 engine.setVisibility('carbon_monoxide',false);assert.equal(engine.audible('carbon_monoxide'),false);
 engine.setMode('solo');assert.equal(engine.audible('carbon_monoxide'),false);
 await engine.pause();assert.equal(engine.isRunning,false);await engine.reset();assert.equal(engine.accents.size,0);
 await engine.dispose();assert.equal(engine.ctx,null);
});
test('asset invalid errors do not fake playback data',async()=>{
 const engine=new RemixEngine({contextClass:MockContext});
 globalThis.fetch=()=>Promise.resolve({ok:false,status:503});
 await assert.rejects(()=>engine.play(),/original track/);
});
