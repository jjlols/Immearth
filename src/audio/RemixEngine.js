import {AUDIO_BPM} from './musicMappings.js';

/** Shared Web Audio transport for a track-aware NASA map remix.
 * Math is not music data. Lat/lon is intentionally absent from scheduling.
 */
export class RemixEngine {
  constructor({contextClass, sourceUrl='/audio/deliberate-thought.mp3', maxAccents=8}={}) {
    this.contextClass=contextClass; this.sourceUrl=sourceUrl; this.maxAccents=Math.min(12,Math.max(1,maxAccents));
    this.ctx=null; this.master=null; this.buffer=null; this.loading=null; this.original=null;
    this.models=new Map(); this.hidden=new Set(); this.selection=null; this.mode='solo';
    this.gates=new Map(); this.accents=new Set(); this.timer=null; this.lastStep=-1;
    this.isRunning=false; this.muted=false; this.volume=.22; this.onChange=null;
  }
  get available(){return Boolean(this.contextClass)||(typeof window!=='undefined'&&!!(window.AudioContext||window.webkitAudioContext));}
  get currentTime(){return this.ctx?.currentTime||0;}
  get duration(){return this.buffer?.duration||177.456;}
  async play(){
    if(!this.ctx){
      if(!this.available)throw new Error('Audio is unavailable in this browser; study mode still works silently.');
      const AudioClass=this.contextClass||(window.AudioContext??window.webkitAudioContext);
      this.ctx=new AudioClass();this.master=this.ctx.createGain();
      const limiter=this.ctx.createDynamicsCompressor();
      limiter.threshold.value=-22;limiter.knee.value=16;limiter.ratio.value=10;
      limiter.attack.value=.01;limiter.release.value=.2;
      this.master.gain.value=0;this.master.connect(limiter).connect(this.ctx.destination);
    }
    await this.fetchBuffer();
    if(!this.original)this.remixRecording();
    this.isRunning=true;this.refresh();
    await this.ctx.resume();this.setVolume(this.volume);this.startClock();
    this.onChange?.(this);
  }
  async fetchBuffer(){
    if(this.buffer)return this.buffer;
    if(!this.loading)this.loading=(async()=>{
      try{const response=await fetch(this.sourceUrl);if(!response.ok)throw new Error('The original track could not load. Playback remains off.');this.buffer=await this.ctx.decodeAudioData(await response.arrayBuffer());return this.buffer;}
      finally{this.loading=null;}
    })();
    return this.loading;
  }
  remixRecording(){
    this.original=this.ctx.createBufferSource();this.original.buffer=this.buffer;this.original.loop=true;
    this.color=this.ctx.createBiquadFilter();this.color.type='lowpass';this.color.frequency.value=1450;this.color.Q.value=.6;
    this.dryGain=this.ctx.createGain();this.dryGain.gain.value=.085;
    this.original.connect(this.color).connect(this.dryGain).connect(this.master);
    this.original.start();
    // Separate generic filter/gain chains modify the same buffer, not official stems.
    for(const id of ['carbon_monoxide','near_surface_temperature']){
      const filter=this.ctx.createBiquadFilter();filter.type='lowpass';filter.Q.value=.7;
      const gain=this.ctx.createGain();gain.gain.value=0;
      this.original.connect(filter).connect(gain).connect(this.master);
      this.gates.set(id,{filter,gain});
    }
  }
  ramp(p,v,t=.2){if(!this.ctx)return;p.cancelScheduledValues(this.ctx.currentTime);p.setTargetAtTime(v,this.ctx.currentTime,t);}
  setModel(models,{visibility={},selection=this.selection,mode=this.mode}={}){
    this.models=new Map(Object.entries(models||{}));this.hidden=new Set(Object.keys(visibility).filter(id=>!visibility[id]));
    this.selection=selection;this.mode=mode==='composition'?'composition':'solo';this.refresh();
  }
  setSelected(id){this.selection=id;this.refresh();}
  setMode(mode){this.mode=mode==='composition'?'composition':'solo';this.refresh();}
  setVisibility(id,visible){visible?this.hidden.delete(id):this.hidden.add(id);this.refresh();}
  audible(id){
    const f=this.models.get(id);
    return Boolean(this.isRunning&&!this.hidden.has(id)&&f&&!f.silent&&f.classified_count!==0&&(this.mode==='composition'||this.selection===id));
  }
  refresh(){
    if(!this.ctx)return;
    for(const id of ['carbon_monoxide','near_surface_temperature']){
      const gate=this.gates.get(id);if(!gate)continue;
      const f=this.models.get(id);
      const active=this.audible(id);
      const base=id==='carbon_monoxide'?.04:.025;
      const value=active?base+(f?.rank||0)*.025:0;
      this.ramp(gate.gain.gain,value,.6);
      this.ramp(gate.filter.frequency,id==='carbon_monoxide'?850+(f?.rank||0)*1700:700+(f?.rank||0)*900,.85);
    }
    if(this.color)this.ramp(this.color.frequency,1300+(this.models.get('near_surface_temperature')?.rank||.2)*1700,.85);
    this.startClock();this.onChange?.(this);
  }
  setMute(value){this.muted=!!value;this.setVolume(this.volume);}
  setVolume(value){this.volume=Math.max(0,Math.min(.24,Number(value)||0));if(this.master)this.ramp(this.master.gain,this.muted?0:this.volume,.05);this.onChange?.(this);}
  startClock(){if(this.timer||!this.isRunning)return;this.timer=setInterval(()=>this.tick(),60000/AUDIO_BPM);this.tick();}
  tick(){
    if(!this.ctx||this.ctx.state!=='running'||!this.isRunning)return;
    const step=Math.floor(this.currentTime*AUDIO_BPM/60*2);
    if(step===this.lastStep)return;this.lastStep=step;
    for(const [id,f]of this.models){
      if(!this.audible(id))continue;
      if(id==='precipitation'&&step%Math.max(2,8-f.density)===0){
        this.accent(id,f.frozen?430:350,.04+f.strength*.025,'sine',.65);
      }
      else if(id==='active_fires'&&step%6===1){
        this.accent(id,260+f.power*190,.04+f.power*.03,'triangle',.5);
      }
      else if(id==='nitrogen_oxides'&&step%4===1){
        const notes=f.pitches?.length?f.pitches:[f.frequency];this.accent(id,notes[(step>>2)%notes.length],.07,'triangle',.78);
      }
      else if(id==='near_surface_temperature'&&step%16===1){
        this.accent(id,f.tier===0?58.27:f.tier===1?65.41:73.42,.15,'sine',1.7);
      }
    }
    this.onChange?.(this);
  }
  accent(id,hertz,amplitude,type='sine',duration=.8){
    if(!this.ctx||this.ctx.state!=='running'||!this.audible(id)||this.muted||this.accents.size>=this.maxAccents)return;
    const osc=this.ctx.createOscillator();
    osc.type=type;
    osc.frequency.value=Math.max(45,Math.min(1800,hertz));
    const gain=this.ctx.createGain();gain.gain.value=0;
    osc.connect(gain).connect(this.master);
    const t=this.currentTime;
    gain.gain.setValueAtTime(0,t);
    gain.gain.linearRampToValueAtTime(Math.min(.12,amplitude),t+.012);
    gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
    osc.start(t);osc.stop(t+duration+.03);
    const record={osc,gain};this.accents.add(record);
    osc.onended=()=>{this.accents.delete(record);osc.disconnect();gain.disconnect();};
  }
  async pause(){
    this.isRunning=false;clearInterval(this.timer);this.timer=null;
    if(this.master)this.ramp(this.master.gain,0,.04);
    if(this.ctx&&this.ctx.state==='running')await this.ctx.suspend();
    this.onChange?.(this);
  }
  async reset(){
    this.isRunning=false;clearInterval(this.timer);this.timer=null;this.lastStep=-1;
    for(const item of this.accents){try{item.osc.stop()}catch{}item.osc.disconnect();item.gain.disconnect();}
    this.accents.clear();
    if(this.original){try{this.original.stop()}catch{}this.original.disconnect();this.original=null;}
    for(const {filter,gain}of this.gates.values()){filter.disconnect();gain.disconnect();}
    this.gates.clear();this.color?.disconnect();this.dryGain?.disconnect();
    if(this.ctx&&this.ctx.state==='running')await this.ctx.suspend();
    this.onChange?.(this);
  }
  async dispose(){await this.reset();this.master?.disconnect();if(this.ctx)await this.ctx.close();this.ctx=null;this.master=null;this.buffer=null;this.loading=null;this.onChange=null;}
}
