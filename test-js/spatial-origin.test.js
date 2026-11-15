import test from 'node:test';
import assert from 'node:assert/strict';
import {VANCOUVER,flatEquirectangularPosition,headspaceListeningFrame} from '../src/lib/spatialOrigin.js';
import {LISTENER_LOCAL_ORIGIN} from '../src/audio/spatialRenderer.js';

test('Vancouver crosses map correctly in east-positive 180 W convention',()=>{
 const value=flatEquirectangularPosition(VANCOUVER);
 assert(Math.abs(value.xProportion-(56.8793/360)) < 1e-9, value.xProportion);
 assert(Math.abs(value.yProportion-(40.7173/180)) < 1e-8);
 assert.equal(VANCOUVER.latitude,49.2827);assert.equal(VANCOUVER.longitude,-123.1207);
 assert(value.xProportion>.15&&value.xProportion<.16);
 assert.deepEqual(LISTENER_LOCAL_ORIGIN,{x:0,y:0,z:0});
});

test('plane marker belongs only to geo spatial origin, not time scalar palette projection',()=>{
 const frame=headspaceListeningFrame();assert.deepEqual(frame.origin.x,0);assert.deepEqual(frame.modelMode,'future');
 assert.match(frame.projector||frame.coordinateSpecification,/(not verified|projection)/i);
 assert.equal(frame.origin.context.includes('inside'),true);
 assert.throws(()=>flatEquirectangularPosition({latitude:-95,longitude:0}));
 assert.throws(()=>flatEquirectangularPosition({latitude:48,longitude:400}));
});
