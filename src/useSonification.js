import {useEffect, useRef, useCallback, useState} from 'react';
import {RemixEngine} from './audio/RemixEngine.js';

/** React's only bridge to lazy Web Audio. No audio on mount or data-load. */
export function useSonification(models, visibilities, selectedId, mode) {
 const engine=useRef(null);
 const [state,setState]=useState('idle'),[error,setError]=useState(null);
 const [volume,setVolumeState]=useState(.22),[muted,setMutedState]=useState(false),[elapsed,setElapsed]=useState(0);
 const [voiceCount,setVoiceCount]=useState(0),[realtime,setRealtime]=useState(0);
 useEffect(()=>{engine.current?.setModel(models||{}, {visibility:visibilities,selection:selectedId,mode});},[models,visibilities,selectedId,mode]);
 useEffect(()=>{
  const timer=setInterval(()=>{
   const e=engine.current;
   if(e){setElapsed(e.elapsed||0);setVoiceCount(e.accents?.size||0);}
  },250);
  return()=>clearInterval(timer);
 },[]);
 useEffect(()=>()=>{engine.current?.dispose();engine.current=null},[]);
 const play=useCallback(async ()=>{
  const instance=engine.current || (engine.current=new RemixEngine());
  setError(null);
  instance.setModel(models||{}, {visibility:visibilities,selection:selectedId,mode});
  instance.setMute(muted);
  instance.setVolume(volume);
  if(instance.isRunning){instance.pause();setState('paused');return;};
  setState('loading');
  try{await instance.play();setState('playing');}catch(error){setState('unavailable');setError(error.message);}
 },[models,visibilities,selectedId,mode,volume,muted,realtime]);
 const reset=useCallback(async()=>{await engine.current?.reset().catch(()=>{});setElapsed(0);setVoiceCount(0);setMutedState(false);setState('idle');},[]);
 const changeVolume=useCallback(value=>{const next=Math.max(0,Math.min(.24,Number(value)||0));setVolumeState(next);engine.current?.setVolume(next)},[]);
 const toggleMute=useCallback(()=>{const next=!muted;setMutedState(next);engine.current?.setMute(next)},[muted]);
 return {engine,play,reset,state,error,muted,changeMuted:toggleMute,volume,changeVolume,elapsed,voiceCount,setRealtime};
}
