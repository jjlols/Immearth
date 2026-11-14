// Optional dev-only browser QA. Run `npm install --no-save playwright`.
const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage({viewport:{width:1440,height:1150}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(process.env.EIC_OVERLAY_URL||'http://127.0.0.1:8000');
await page.waitForFunction(()=>document.body.dataset.ready==='true');
const geos= await page.evaluate(()=>eicOverlay.getState().layers.filter(l=>['carbon_monoxide','nitrogen_oxides','near_surface_temperature'].includes(l.id)).map(l=>l.url));
assert.equal(geos.length,3);
for(const id of ['carbon_monoxide','nitrogen_oxides','near_surface_temperature']){
  const matches=await page.evaluate(async id=>{const layer=eicOverlay.getState().layers.find(l=>l.id===id);const input=new Image();input.src=layer.url;await input.decode();const source=document.createElement('canvas');source.width=input.naturalWidth;source.height=input.naturalHeight;const context=source.getContext('2d');context.drawImage(input,0,0);const canvas=document.querySelector(`[data-layer-id="${id}"]`);for(let y=10;y<canvas.height;y+=300)for(let x=10;x<canvas.width;x+=400){const a=canvas.getContext('2d').getImageData(x,y,1,1).data,b=context.getImageData(x,y,1,1).data;if(a.some((v,i)=>v!==b[i]))return false;}return true;},id);
  assert.ok(matches,`Original pixels modified in ${id}`);
}
await page.getByRole('button',{name:'View Nitrogen oxides',exact:true}).click();await page.getByRole('checkbox',{name:'Show only the selected field',exact:true}).check();
assert.equal(await page.evaluate(()=>eicOverlay.getState().focusedId),'nitrogen_oxides');
await page.waitForTimeout(500);
assert.equal(await page.locator('canvas[data-layer-id="nitrogen_oxides"]').evaluate(el=>getComputedStyle(el).opacity),'1');
await page.getByRole('slider',{name:'Nitrogen oxides opacity',exact:true}).fill('0.2');assert.equal(await page.evaluate(()=>eicOverlay.getState().layers.find(l=>l.id==='nitrogen_oxides').opacity),0.2);
await page.getByRole('checkbox',{name:'Include Carbon monoxide in composite',exact:true}).uncheck();assert.equal(await page.evaluate(()=>eicOverlay.getState().layers.find(l=>l.id==='carbon_monoxide').visible),false);
await page.getByRole('button',{name:'Reset composition',exact:true}).click();assert.equal(await page.evaluate(()=>eicOverlay.getState().focusedId),null);
await page.getByRole('button',{name:'View Precipitation',exact:true}).focus();await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'View Active fires');
await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=390));
await page.screenshot({path:'/tmp/genuine-geographic-map.png',fullPage:true});assert.deepEqual(errors,[]);
console.log('PASS original pixels, one basemap, focus, solo, opacity, visibility, reset, keyboard, mobile');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
