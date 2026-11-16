import assert from 'node:assert/strict';import{chromium}from'playwright';
const browser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const context=await browser.newContext({permissions:['camera']});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto((process.env.JUKEBOX_URL||'http://127.0.0.1:8001')+'/?view=music',{waitUntil:'networkidle'});
 if(await page.locator('#intro-skip').count())await page.locator('#intro-skip').click();await page.locator('#intro').waitFor({state:'detached'});
 await page.getByRole('button',{name:'Enable camera',exact:true}).click();await page.waitForSelector('[data-head-test=active]',{timeout:45000});
 const cameraStatus=()=>page.locator('[data-head-test]').getAttribute('data-head-test');
 console.log('BEFORE_CAL_BUTTON',await cameraStatus());
 await page.getByRole('button',{name:'Calibrate front',exact:true}).click({force:true,timeout:60000});await page.waitForTimeout(700);
 assert.equal(errors.filter(e=>/timestamp mismatch/i.test(e)).length,0,`timestamp mismatch error persisted: ${errors.join(';')}`);
 console.log(JSON.stringify({status:'passed_no_TIMESTAMP_MISMATCH',realModel:true,appControl:'Calibrate front',cameraStatus:await cameraStatus(),errorDescription:'Fake-video lacks real face; graph timestamp exception is not present. Physical pose accuracy is not verified.'},null,2));
 await page.getByRole('button',{name:'Stop camera',exact:true}).click();
 assert.equal(await page.locator('.head-video').evaluate(v=>v.srcObject),null);
} finally{await browser.close();}
