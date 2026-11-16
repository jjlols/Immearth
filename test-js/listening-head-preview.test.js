import test from 'node:test';
import assert from 'node:assert/strict';
import './dom-globals.mjs';
const React = await import('react');
const { renderHook, act, cleanup } = await import('@testing-library/react');
const { default: useHeadPreviewTravel } = await import('../src/hooks/useHeadPreviewTravel.js');

function harness(options = {}) {
 const travelOnRecenter = options.travelOnRecenter === true;
 const movements=[],positions=[];
 const engineRef={current:{spatial:{setSourcePosition(value){positions.push(value);}}}};
 const {result,rerender,unmount}=renderHook(props=>useHeadPreviewTravel({index:0,choose:index=>movements.push(index),enabled:true,engineRef,...props}),{initialProps:{...options}});
 look('right');assert.equal(positions.at(-1).x,2);assert.deepEqual(movements,[],"directional preview must not move the grid");
 look('forward');
 assert.deepEqual(movements,travelOnRecenter?[1]:[],travelOnRecenter?"explicit opt-in makes one step":"normal listening cannot commit a step on recenter");
 assert.equal(positions.at(-1).x,0,'forward listener hears current region centered');
 assert.equal(result.current?.previewing,false,'Committed display returns normally');
 assert.equal(result.current.regionIndex,0);
 assert.equal(result.current.previewing,false, travelOnRecenter?'explicitly returned to committed row':'listening returns to baseline');
 return {result,rerender,unmount,movements,positions};
 function look(direction){act(()=>{result.current.onDirectionChange({direction,now:performance.now()});});}
}

// Hooks run against a minimal isolated JSX-free DOM. Not a human-camera or HRTF test.
try {
 test('listening-only head previews return without moving the committed map or changing music source architecture',()=>{
  harness({});
 });
 test('explicit return-to-travel opt-in keeps one-step original behavior but does not share listening default',()=>{
  const {rerender,movements,unmount}=harness({travelOnRecenter:true});
  assert.deepEqual(movements,[1]);
  rerender({travelOnRecenter:false});
  unmount();
 });
} finally {
 cleanup();
}
