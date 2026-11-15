import assert from 'node:assert/strict';import{chromium}from'playwright';
const browser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const context=await browser.newContext({permissions:['camera']});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto((process.env.JUKEBOX_URL||'http://127.0.0.1:8038')+'/?view=music',{waitUntil:'networkidle'});
 if(await page.locator('#intro-skip').count())await page.locator('#intro-skip').click();await page.locator('#intro').waitFor({state:'detached'});
 await page.locator('.head-start').click();await page.waitForSelector('[data-camera-status=active]',{timeout:45000});
 console.log('BEFORE_CAL_BUTTON',await page.locator('.head-camera-status').innerText(),await page.getByRole('button').allTextContents());
 await page.getByRole('button',{name:'Calibrate forward',exact:true}).click({force:true,timeout:60000});await page.waitForTimeout(700);
 assert.equal(errors.filter(e=>/timestamp mismatch/i.test(e)).length,0,`timestamp mismatch error persisted: ${errors.join(';')}`);
 console.log(JSON.stringify({status:'passed_no_TIMESTAMP_MISMATCH',realModel:true,appControl:'Calibrate forward',cameraStatus:await page.locator('.head-camera-status').innerText(),errorDescription:'Fake-video lacks real face; graph timestamp exception is not present. Physical pose accuracy is not verified.'},null,2));
 await page.getByRole('button',{name:'Stop tracking',exact:true}).click();
 assert.equal(await page.locator('.head-video').evaluate(v=>v.srcObject),null);
} finally{await browser.close();}
