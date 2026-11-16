import assert from 'node:assert/strict';
import {openHeadPage,origin,POSITIONS} from './lib/headHarness.js';
const {browser,page,errors,...h}=await openHeadPage();
try {
 await h.enableCamera();
 const toggle=page.getByLabel('Return with head movement',{exact:true});
 assert.equal(await toggle.isChecked(),false,'listening-only must be the default');
 await h.play();await h.look('right');await h.waitSource(POSITIONS.right);
 assert.equal(await h.marker(),'1','head preview may show adjacent region');
 await h.look('forward');await h.waitSource(POSITIONS.forward);await h.frames();
 assert.equal(await h.marker(),'0','listening recenter returns without moving');
 await toggle.check();await h.look('right');await h.waitSource(POSITIONS.right);await h.look('forward');await h.waitSource(POSITIONS.forward);await h.frames();
 assert.equal(await h.marker(),'1','explicit travel can commit exactly one step');
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({status:'passed',origin,defaultListening:true,defaultReturnRegion:0,optInReturnRegion:1,note:'Synthetic camera callback exercises actual hook/hook mode switch, stationary listening and opt-in one-step. No human-HRTF or face accuracy claim.'},null,2));
}finally{await browser.close();}
