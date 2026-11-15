import{chromium}from'playwright';import assert from'node:assert/strict';
const b=await chromium.launch({headless:true});const p=await b.newPage({viewport:{width:390,height:844}});const errors=[],requests=[];p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>requests.push([r.url(),r.status()]));
try{
 await p.addInitScript(()=>{
  window.__V={contexts:0,gum:0,streams:[],stops:0,detached:0};const A=AudioContext;window.AudioContext=class extends A{constructor(...args){super(...args);window.__V.contexts++;}};
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async c=>{__V.gum++;const track={stop(){__V.stops++;},addEventListener(){},get readyState(){return __V.stops?'ended': 'live';}};const stream={getTracks(){return[track];}};__V.streams.push(stream);return stream;}}});
  Object.defineProperty(HTMLMediaElement.prototype,'readyState',{configurable:true,get(){return 4;}});
  Object.defineProperty(HTMLMediaElement.prototype,'srcObject',{configurable:true,get(){return this._src;},set(v){this._src=v;if(!v)__V.detached++;}});
  HTMLMediaElement.prototype.play=function(){return Promise.resolve();};HTMLMediaElement.prototype.pause=function(){};HTMLMediaElement.prototype.load=function(){};
 });
 await p.goto((process.env.JUKEBOX_URL||'http://127.0.0.1:8001')+'/?view=music');await p.locator('#intro-skip').click();await p.locator('#intro').waitFor({state:'detached'});await p.waitForSelector('.head-direction');await p.waitForFunction(()=>__V.contexts===0&&__V.gum===0);
 console.log('before',await p.evaluate(()=>__V));assert.equal(requests.filter(([u])=>u.includes('head-tracking')).length,0);
 await p.locator('.head-start').click();await p.waitForSelector('[data-camera-status=error]',{timeout:15000});
 const stopped=await p.evaluate(()=>({...__V,src:document.querySelector('.head-video').srcObject}));console.log('after synthetic model-init/cleanup',stopped);assert.equal(stopped.gum,1);assert.equal(stopped.stops,1);assert.equal(stopped.detached,1);assert.equal(stopped.src,null);assert.equal(stopped.contexts,0);
 // Navigate without waiting: React unmount must cancel a second allowed attempt.
 await p.locator('.head-start').click();
 await p.getByRole('navigation',{name:'Main'}).getByRole('link',{name:'Home',exact:true}).click();
 await p.waitForTimeout(500);
 const unmounted=await p.evaluate(()=>({...__V,src:document.querySelector('.head-video')?.srcObject}));console.log('unmount cleanup',unmounted);assert.equal(unmounted.gum,2);assert.equal(unmounted.stops,2);assert.equal(unmounted.detached,2);assert.equal(unmounted.contexts,0);
 console.log(JSON.stringify({status:'passed',statusUI:await p.locator('.head-camera-status').count()?await p.locator('.head-camera-status').innerText():'Unmounted as requested',requests:requests.filter(([url])=>url.includes('head-tracking')),errors,viewport:await p.evaluate(()=>[innerWidth,document.documentElement.scrollWidth])},null,2));
}finally{await b.close();}
