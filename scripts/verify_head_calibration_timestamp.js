import assert from 'node:assert/strict';import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});const context=await browser.newContext({permissions:['camera'],viewport:{width:390,height:844}});const page=await context.newPage();page.on('pageerror',e=>console.log(e.stack));
await page.addInitScript(()=>{
window.__HEAD_TEST__={contexts:0,closes:0,calls:0};window.__HEAD_POSE__={yaw:0,pitch:0,missing:false};
window.DETECTOR={
 detectForVideo(v,t){(__HEAD_TEST__.timestamps??=[]).push(t);__HEAD_TEST__.calls++;const y=__HEAD_POSE__.yaw*Math.PI/180,p=__HEAD_POSE__.pitch*Math.PI/180, f=[Math.sin(y)*Math.cos(p),-Math.sin(p),Math.cos(y)*Math.cos(p)];
 return{facialTransformationMatrixes:__HEAD_POSE__.missing?[]:[{rows:4,columns:4,data:[1,0,0,0,0,1,0,0,...f,0,0,0,0,1]}]};},
 close(){__HEAD_TEST__.closes++;}};
const A=window.AudioContext;window.AudioContext=class extends A{constructor(...args){super(...args);__HEAD_TEST__.contexts++;}createOscillator(){throw Error('oscs not permitted on this tracking path');}};
});
await page.route('**/src/hooks/useHeadDirection.js*',async route=>{
 const response=await route.fetch();const html=await response.text();
 await route.fulfill({response,body:html.replace('const detectorLoader=defaultDetectorLoader,','detectorLoader=()=>Promise.resolve(window.DETECTOR),')});
});
try{
await page.goto((process.env.JUKEBOX_URL||'http://127.0.0.1:8035')+'/?view=music',{waitUntil:'networkidle'});
if(await page.locator('#intro-skip').count())await page.locator('#intro-skip').click();await page.locator('#intro').waitFor({state:'detached'});
assert.equal(await page.evaluate(()=>__HEAD_TEST__.contexts),0);
await page.locator('.head-start').click();await page.waitForSelector('[data-camera-status=active]',{timeout:15000});
await page.waitForFunction(()=>document.querySelector('[data-direction]')?.dataset.direction==='forward');
await page.getByRole('button',{name:'Calibrate forward',exact:true}).click();
 const seen=['forward'];
for(const [direction,yaw,pitch]of[['right',25,0],['left',-25,0],['up',0,25],['down',0,-25],['forward',0,0]]){
 await page.evaluate(({yaw,pitch})=>window.__HEAD_POSE__=({yaw,pitch,missing:false}),{yaw,pitch});await page.waitForFunction(d=>document.querySelector('[data-direction]')?.dataset.direction===d,direction,{timeout:5000});seen.push(direction);
}
await page.evaluate(()=>window.__HEAD_POSE__={yaw:0,pitch:0,missing:true});await page.waitForFunction(()=>document.querySelector('[data-direction]')?.dataset.direction==='uncertain',{timeout:4000});await page.getByRole('button',{name:'Stop tracking',exact:true}).click();
const outcome=await page.evaluate(()=>({...__HEAD_TEST__,src:document.querySelector('.head-video').srcObject,bodyWidth:document.documentElement.scrollWidth,viewport:innerWidth}));assert.equal(outcome.src,null);assert.equal(outcome.closes,1);assert.equal(outcome.contexts,0);assert.ok(outcome.bodyWidth<=outcome.viewport);
console.log(JSON.stringify({status:'passed',origin:process.env.JUKEBOX_URL||'http://127.0.0.1:8035',synthetic:true,seen,outcome,limitation:'Not physical pose from camera/persons/passive head tracking.'},null,2));
}finally{await browser.close();}

// Completed calibration numeric sequence in browser auto syntax asserts compiled.

console.log('TIMESTAMPS',await page.evaluate(()=>__HEAD_TEST__.timestamps));
