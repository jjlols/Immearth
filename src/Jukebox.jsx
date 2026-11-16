import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {LAYER_OPTIONS,OPACITY_DEFAULTS} from './layerOptions.js';
import {RemixEngine} from './audio/RemixEngine.js';
import HeadDirectionControl from './components/HeadDirectionControl.jsx';
import './styles-origin.css';
import {featureModel,describeFeature,INSTRUMENT_INFO,TRACK} from './audio/musicMappings.js';
import {explorerPosition,useExplorer,EXPLORER_SIZE,regionAtPoint,regionWords} from './hooks/useExplorer.js';
import useHeadPreviewTravel from './hooks/useHeadPreviewTravel.js';
import LiveTour from './components/LiveTour.jsx';
import SiteChrome from './SiteChrome.jsx';
import ListenSpeak from './guide/ListenSpeak.jsx';
import './listening.css';

/* A tap or click picks the grid cell under it with the same choose() the keys use, and
 * hands over the spot (0..1 across and down) so the marker can sit where the user pointed.
 * The music still reads the whole cell. Only a primary pointer that barely moved counts as
 * a tap, so scrolling, wheel, pinch and two-finger swipes stay with the browser.
 * Nothing here touches audio. */
const TAP_SLOP_PX=10;
function useMapPointer(onChooseRegion){
 const press=useRef(null);
 return {handlers:{
  onPointerDown:event=>{
   if(!event.isPrimary||(event.pointerType==='mouse'&&event.button!==0)){press.current=null;return;}
   press.current={id:event.pointerId,x:event.clientX,y:event.clientY};
  },
  onPointerMove:event=>{
   const start=press.current;
   if(start&&start.id===event.pointerId&&Math.hypot(event.clientX-start.x,event.clientY-start.y)>TAP_SLOP_PX)press.current=null;
  },
  onPointerUp:event=>{
   const start=press.current;press.current=null;
   if(!start||start.id!==event.pointerId||Math.hypot(event.clientX-start.x,event.clientY-start.y)>TAP_SLOP_PX)return;
   const rect=event.currentTarget.getBoundingClientRect();
   const x=event.clientX-rect.left,y=event.clientY-rect.top;
   const index=regionAtPoint(x,y,rect.width,rect.height);
   if(index!==null)onChooseRegion(index,{x:Math.min(1,Math.max(0,x/rect.width)),y:Math.min(1,Math.max(0,y/rect.height))});
  },
  onPointerCancel:()=>{press.current=null;},
 }};
}

function GeographicCanvas({layers,settings,focus,onlySelected,showGeography,loading,explorerIndex,markerPoint,onChooseRegion}){
 const pointer=useMapPointer(onChooseRegion);
 const markerStyle=markerPoint?{left:`${markerPoint.x*100}%`,top:`${markerPoint.y*100}%`}:explorerPosition(explorerIndex);
 return <div className="geographic-canvas" id="map-navigation" tabIndex={-1} role="group" aria-label="Earth map. Click or tap a place to move there, or press W, A, S or D. Your place is read out in words." {...pointer.handlers}>
{showGeography&&<img src={`${import.meta.env.BASE_URL}assets/basemap.png`} className="geoplanes" alt="Natural Earth coastline and land polygons, without any metric data"/>}
 {layers.filter(layer=>settings[layer.id]?.visible!==false).map(layer=><MapField key={layer.id} layer={layer} settings={settings} solo={onlySelected?focus:null}/>) }
 <div className="exploration-marker" data-exploration-region={explorerIndex} style={markerStyle} aria-hidden="true"><span className="target-ring"/><span className="target-cross"/></div>
 {loading&&<div className="loading-scrim" role="status">Loading geography and palette features…</div>}
 <span className="map-longitude west">180° W</span><span className="map-longitude east">180° E</span>
 <span className="map-hemisphere">Equatorial viewing plane <span>•</span> source projections remain provisional</span>
 </div>;
}

function MapField({layer,settings,solo}){
 const ref=useRef(null);
 useEffect(()=>{
  const canvas=ref.current;if(!canvas)return;
  const ctx=canvas.getContext('2d');const img=new Image();
  img.onload=()=>{ctx.drawImage(img,0,0);canvas.dataset.loaded='true';};
  img.onerror=()=>{canvas.dataset.error='true';};
  img.src=`${import.meta.env.BASE_URL}assets/${layer.id}.png`;
  return()=>{img.onload=null;img.onerror=null};
 },[layer.id,layer.url]);
 const opacity=solo?(solo===layer.id?1:0):settings.opacity??.66;
 return <canvas ref={ref} className="map-raster" data-map-field={layer.id} aria-hidden="true" width={layer.width||4096} height={layer.height||2048} style={{opacity,zIndex:solo===layer.id?110:layer.order}}/>;
}

function SourceControl({layer,visible,focus,onSelect,onVisible,onNavigate}){
 return <article className={`source-card ${focus?'is-focused':''} ${visible?'':'is-off'}`} style={{'--layer-accent':layer.color}} data-source-card={layer.id}>
 <label className="visibility-toggle"><input type="checkbox" checked={visible} onChange={event=>onVisible(layer.id,event.target.checked)} aria-label={`Show ${layer.label} on map and enable its musical layer`}/><span>{visible?'Included':'Left out'}</span></label>
 <button type="button" className="source-select" data-source-select={layer.id} aria-pressed={focus} aria-label={`Explore ${layer.label} musical mapping`} tabIndex={focus?0:-1} onClick={()=>onSelect(layer.id)} onKeyDown={(event)=>onNavigate(event,layer.id)}>
 <span className="metric-symbol" aria-hidden="true">{layer.mark}</span>
 <span className="metric-text"><strong>{layer.label}</strong>{focus&&<span className="chosen-tag">Chosen</span>}</span>
 </button>
 </article>;
}

export default function Jukebox(){
 const [manifest,setManifest]=useState(null),[features,setFeatures]=useState(null),[loadError,setLoadError]=useState(null);
 const [settings,setSettings]=useState(Object.fromEntries(LAYER_OPTIONS.map(layer=>[layer.id,{visible:true,opacity:OPACITY_DEFAULTS[layer.id]}])));
 const [focus,setFocus]=useState('nitrogen_oxides'),[mode,setMode]=useState('composition'),[onlySelected,setOnlySelected]=useState(false),[showGeography,setShowGeography]=useState(true);
 const {index:explorerIndex,choose:chooseExplorerRegion,move:moveExplorerRegion}=useExplorer();
 const engine=useRef(null),modelsRef=useRef({}),visibilityRef=useRef({});
 const headSyncRef=useRef(()=>{});
 const [spatialEnabled,setSpatialEnabled]=useState(true),[headInfluence,setHeadInfluence]=useState(false),[headTravelOnRecenter,setHeadTravelOnRecenter]=useState(false);
 const [playState,setPlayState]=useState('idle'),[audioError,setAudioError]=useState(null),[muted,setMuted]=useState(false),[volume,setVolume]=useState(.32),[progress,setProgress]=useState(0);
 const layers=useMemo(()=>dataLayers(manifest?.layers),[manifest]);
 const featureById=features?.[focus];

 /* The spot of the last click or tap, kept only while its cell is still the current region. */
 const [clickPoint,setClickPoint]=useState(null);
 const chooseExplorer=useCallback(index=>{chooseExplorerRegion(index);},[chooseExplorerRegion]);
 const chooseByPointer=useCallback((index,point)=>{setClickPoint({index,...point});chooseExplorerRegion(index);},[chooseExplorerRegion]);
 /* Keys, voice or head travel moved to another cell: forget the old spot (React's adjust-state-on-change pattern). */
 if(clickPoint&&clickPoint.index!==explorerIndex)setClickPoint(null);
 const travel=useHeadPreviewTravel({index:explorerIndex,choose:chooseExplorer,enabled:spatialEnabled && headInfluence,travelOnRecenter:headTravelOnRecenter,engineRef:engine});

 const currentLayer=layers.find(l=>l.id===focus)||layers[0]||LAYER_OPTIONS[0];
 const currentIndex=travel.previewing?travel.regionIndex:explorerIndex;
 const currentFeature=featureById?.[currentIndex];
 const regionStatus=`${regionWords(explorerIndex)}. ${currentLayer.label} is chosen.`;

 /* Load local data side-effects only. Music not fetched here, let alone starts. */
 useEffect(()=>{
  let alive=true;
  Promise.all([fetch(`${import.meta.env.BASE_URL}data/markers.json`),fetch(`${import.meta.env.BASE_URL}scales/features.json`)]).then(async ([mapResponse,paletteResponse])=>{
   if(!mapResponse.ok)throw new Error('NASA geographic manifest missing; regenerate geographic assets.');
   if(!paletteResponse.ok)throw new Error('Derived palette records are missing or incomplete.');
   return Promise.all([mapResponse.json(),paletteResponse.json()]);
  }).then(([mapRecord,scales])=>{
   if(!mapRecord.layers?.length)throw new Error('Source map manifest has zero layers.');
  if(Object.values(scales.categories).some(regions=>regions.length!==EXPLORER_SIZE))throw new Error('Expected 48 estimated analysis regions for the six-by-eight grid; regenerate palette features.');
   if(divergedScientificSources(mapRecord))throw new Error('Manifest contains an invalid metric vocabulary.');
   setManifest(mapRecord);setFeatures(scales.categories);
  }).catch(err=>{if(alive)setLoadError(err.message);});
  return()=>{alive=false};
 },[]);
 /* Only field-model state transfers prior to a later gesture; context absent here. */
 const musicalModels=useMemo(()=>{
  if(!features)return {};
  return Object.fromEntries(layers.map(layer=>{
   const cell=features[layer.id]?.[travel.regionIndex];
   return [layer.id,featureModel(layer.id,cell)];
  }));
 },[features,layers,travel.regionIndex]);
 const audibleVisibilities=useMemo(()=>Object.fromEntries(layers.map(layer=>[layer.id,settings[layer.id]?.visible!==false])),[layers,settings]);
 useEffect(()=>{applyPreviewPosition(engine.current, travel.position);},[travel.position,engine]);
 useEffect(()=>{modelsRef.current=musicalModels;visibilityRef.current=audibleVisibilities;},[musicalModels,audibleVisibilities]);
 useEffect(()=>{if(engine.current){engine.current.setModel(musicalModels,{visibility:audibleVisibilities,selection:focus,mode});}},[focus,mode,musicalModels,audibleVisibilities]);
 /* Read engine.current at unmount: the engine is created later, by Play. */
 useEffect(()=>()=>{engine.current?.dispose();engine.current=null;},[]);
 useEffect(()=>{if(typeof window!=='undefined')window.__JUKEBOX_AUDIO_REF__=engine;return()=>{if(window.__JUKEBOX_AUDIO_REF__===engine)delete window.__JUKEBOX_AUDIO_REF__;};},[]);
 useEffect(()=>{
  const timer=setInterval(()=>{if(engine.current){setProgress(engine.current.elapsed/(engine.current.duration||177.456)*100);}},250);
  return()=>clearInterval(timer);
 },[]);

 const onHeadDirection=event=>{if(event?.spatial){
  const value=event.enabled;
  setSpatialEnabled(value);
  if(!value){setHeadInfluence(false);travel.cancel();}
  return;
 }
 if(event?.browser){setHeadInfluence(event.enabled);return;}
 travel.onDirectionChange(event);
 };
 function onHeadInfluence(value){setHeadInfluence(value);if(!value)travel.onDirectionChange({direction:'stop'});}
 const selectMetric=(id)=>{
  setFocus(id);
  // Active focus is not visual visibility. Keep each checkbox's chosen hidden state.
  if(engine.current){engine.current.setModel(musicalModels,{visibility:audibleVisibilities,selection:id,mode});engine.current.setSelected(id);}
 };
 const navigateCards=(event,id)=>{
  const ray=layers.map(layer=>layer.id);const index=ray.indexOf(id);
  let nextIndex;
  if(['ArrowDown','ArrowRight'].includes(event.key))nextIndex=(index+1)%ray.length;
  else if(['ArrowUp','ArrowLeft'].includes(event.key))nextIndex=(index-1+ray.length)%ray.length;
  else if(event.key==='Home')nextIndex=0;else if(event.key==='End')nextIndex=ray.length-1;else return;
  event.preventDefault();document.querySelector(`[data-source-select="${ray[nextIndex]}"]`)?.focus();selectMetric(ray[nextIndex]);
 };
 async function togglePlayback(){
  if(!engine.current){engine.current=new RemixEngine({sourceUrl:`${import.meta.env.BASE_URL}${TRACK.file}`});headSyncRef.current();}
  const player=engine.current;
  player.setModel(musicalModels,{visibility:audibleVisibilities,selection:focus,mode});
  player.setMute(muted);player.setVolume(volume);player.setSpatialEnabled(spatialEnabled);
  applyPreviewPosition(engine.current, travel.position);
  setAudioError(null);
  if(player.isRunning){
   try{await player.pause();setPlayState('paused');}catch(error){setAudioError(error.message);setPlayState('unavailable');}
   return;
  }
  setPlayState('loading');
  try{await player.play();setPlayState('playing');}catch(error){setAudioError(error.message);setPlayState('unavailable');}
 }
 async function resetMusic(){
  try{await engine.current?.reset();setPlayState('idle');setAudioError(null);}catch(error){setAudioError(error.message);setPlayState('unavailable');}
  setProgress(0);setMuted(false);
 }

 const loading=!manifest||!features;
 const voices=Object.values(modelsRef.current).filter(v=>!v.silent).length;
 return <>
 <a className="skip-link" href="#music-player">Skip to the music player</a><a className="skip-link" href="#map-controls">Skip to map layers</a><a className="skip-link" href="#learning">Skip to what you hear</a>
 <SiteChrome current="music" part="header" />
 <ListenSpeak />
 <div className="jukebox-shell live-page">
 <h1 className="live-title" id="music-title" tabIndex={-1}>Live Map</h1>
 <LiveTour />
 <section className="music-console live-transport" id="music-player" tabIndex={-1} aria-label="Music controls">
  <div className="transport-buttons">
   <button type="button" className="main-action" onClick={togglePlayback} disabled={loading||playState==='loading'}>{playState==='playing'?'Pause':playState==='paused'?'Resume':playState==='loading'?'Loading…':playState==='unavailable'?'Retry':'Play remix'}<span aria-hidden="true">{playState==='playing'?'❚❚':'▶'}</span></button>
   <div className="secondary-peripherals"><button className="secondary-action" type="button" onClick={resetMusic}>Start over</button>
   <button className={`secondary-action ${muted?'muted-off':''}`} type="button" aria-pressed={muted} onClick={()=>{setMuted(!muted);engine.current?.setMute(!muted)}}><span>{muted?'Unmute':'Mute'}</span></button></div>
   <label className="master-volume"><span>Volume</span><input type="range" min="0" max="50" step="1" aria-label="Volume. Loudest is 50 percent." value={Math.round(volume*100)} onChange={event=>{const v=Number(event.target.value)/100;setVolume(v);engine.current?.setVolume(v)}}/> <span className="volume-cap">{Math.round(volume*100)}%</span></label>
  </div>
  <div className="progress-wrap">
   <span id="song-position">Song position</span>
   <div className="progress-rail" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(100,progress))} aria-valuetext={`${Math.round(Math.min(100,progress))} percent`} aria-labelledby="song-position"><span style={{width:`${Math.min(100,progress)}%`}}/></div>
   <span className="progress-percent">{Math.round(Math.min(100,progress))}%</span>
  </div>
  <p role="status" aria-live="polite" className={`playback-status state-${playState}`}><span aria-hidden="true">{ws_icon(playState)}</span> {audioDescription(playState,muted)}</p>
  <p className="source-license">“Deliberate Thought” · Kevin MacLeod · <a href={TRACK.licenseUrl} target="_blank" rel="noreferrer">CC BY 4.0 (opens in a new tab)</a> · <a className="license-detail" href="#attribution">License details</a></p>
 </section>

 {audioError&&<div role="alert" className="app-alert">{audioError}<button type="button" onClick={()=>setAudioError(null)}>Dismiss</button></div>}
 {loadError&&<div role="alert" className="app-alert">{loadError}<span> Existing geographic work is unchanged.</span></div>}
 <div className="workspace-shared live-board">
  <main className="map-workspace">
   <div className="map-frame"><GeographicCanvas explorerIndex={travel.regionIndex} markerPoint={clickPoint&&clickPoint.index===travel.regionIndex&&clickPoint.index===explorerIndex?clickPoint:null} onChooseRegion={chooseByPointer} layers={layers} settings={settings} focus={focus} onlySelected={onlySelected} showGeography={showGeography} loading={loading}/></div>
   {/* Screen readers hear each region change; sighted users see the marker move. The step buttons are
       for screen readers whose keys never reach the page (NVDA/JAWS browse mode, phones): hidden on
       screen and skipped by Tab, so the bar Jerry removed stays gone for everyone else. */}
   <div className="map-move sr-only" role="group" aria-label="Move between regions">
    <button type="button" tabIndex={-1} aria-label="Move north" onClick={()=>moveExplorerRegion('w')}/>
    <button type="button" tabIndex={-1} aria-label="Move west" onClick={()=>moveExplorerRegion('a')}/>
    <button type="button" tabIndex={-1} aria-label="Move south" onClick={()=>moveExplorerRegion('s')}/>
    <button type="button" tabIndex={-1} aria-label="Move east" onClick={()=>moveExplorerRegion('d')}/>
   </div>
   <p className="current-region sr-only" role="status" aria-live="polite">{regionStatus} <span className="current-region-hint">Use W, A, S and D or the arrow keys, or click the map to move.</span></p>
  </main>
  <div className="live-toolbar">
   <aside className="explorer-panel" id="map-controls" aria-label="Map layers">

    <div className="source-controllers" aria-label="Geographic layers and their visibility">
    {layers.map(layer=><SourceControl key={layer.id} layer={layer} focus={focus===layer.id} visible={settings[layer.id]?.visible!==false} onSelect={selectMetric} onVisible={(id,visible)=>{setSettings(current=>({...current,[id]:{...current[id],visible}}));engine.current?.setVisibility(id,visible);}} onNavigate={navigateCards}/>)}
    </div>
    <div className="interaction-modes" role="group" aria-label="Map and sonification modes"><button type="button" aria-pressed={mode==='solo'} className={mode==='solo'?'selected-mode':''} onClick={()=>{setMode('solo'); if(!focus)setFocus('nitrogen_oxides');engine.current?.setMode('solo');}}><strong>Solo / Explore</strong></button><button type="button" aria-pressed={mode==='composition'} className={mode==='composition'?'selected-mode':''} onClick={()=>{setMode('composition');engine.current?.setMode('composition');}}><strong>Ensemble</strong></button></div>
    <div className="map-options"><label><input type="checkbox" checked={showGeography} onChange={e=>setShowGeography(e.target.checked)}/> Show land and coasts</label><label><input type="checkbox" checked={onlySelected} onChange={e=>setOnlySelected(e.target.checked)}/> Selected map only</label>
    <button className="reset-composition" type="button" onClick={()=>{setSettings(Object.fromEntries(LAYER_OPTIONS.map(l=>[l.id,{visible:true,opacity:OPACITY_DEFAULTS[l.id]}])));setFocus(null);setOnlySelected(false);setMode('composition');setShowGeography(true);}}>↻ Reset layers</button></div>
    <HeadDirectionControl travelOnRecenter={headTravelOnRecenter} onTravelOnRecenterChange={setHeadTravelOnRecenter} engineRef={engine} onReady={callback=>{headSyncRef.current=callback;}} headInfluence={headInfluence} onDirection={onHeadDirection} onHeadInfluenceChange={onHeadInfluence}/>
   </aside>
  </div>
 </div>
 <details className="hearing-card" id="learning">
  <summary id="voice-title">What you are hearing: {currentLayer.label}</summary>
  <p>{INSTRUMENT_INFO[currentLayer.id]?.explanation || 'Estimated palette positions reshape this field’s part of the recording.'}</p>
  <p>{INSTRUMENT_INFO[currentLayer.id]?.caveat}</p>
  <p>{describeFeature(focus,currentFeature)}</p>
 </details>

 <details id="attribution" className="license-paper"><summary>Details & attribution</summary><div><p><strong>“Deliberate Thought” — Kevin MacLeod, incompetech.com — Creative Commons Attribution 4.0 International.</strong><a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">Read the license (CC BY 4.0, opens in a new tab)</a>. The local recording is decoded once per engine lifetime. Generic filters, playback-rate changes and gain envelopes modify the original recording; no oscillator or generated guide tone exists. No official stems are claimed. Attribution is preserved in the interface and project license files.</p>
 <p>NASA palette stations support semantic tools not medical/population statements. The same source aspect ratio is not identical geographically verified projection or acquisition time. Continuous global fields drawn as a colored image can be inspected as whole pixels (maps) and reduced to bounded classifications (music). This is an interpretive educational listening aid, not physical truth sonification or a weather warning service. Scientific data must come from verified underlying measurement input for any absolute calibration.</p>
 <p>Navigation and map inspection stay silent before Play. Source values remain nearest-palette estimates with the recorded uncertainty. See README.md and LICENSES.md for full implementation and verification notes. DeepSpace deployment is not configured or claimed.</p></div></details>
 <footer className="sr-only"><span>NASA Scientific Visualization Studio · Natural Earth geography · Kevin MacLeod</span><span>Built with React and Web Audio, respectfully at 69 BPM.</span></footer>
 </div>
 <SiteChrome current="music" part="footer" />
 </>;
}

function applyPreviewPosition(engine, position) {
 if (!engine) return;
 engine.spatial.setSourcePosition(position ?? { x: 0, y: 0, z: 0 });
}

function playbackCaption(playState, muted) {
 if (playState === 'loading') return 'Loading the recording.';
 if (playState === 'unavailable') return 'Audio unavailable. The map and text descriptions remain available.';
 if (playState === 'paused') return 'Music paused.';
 if (playState === 'playing' && muted) return 'Music muted.';
 return '';
}

const ws_icon=state=>({playing:'▸',paused:'Ⅱ',loading:'⋯',idle:'○',unavailable:'!'})[state]||'○';
const audioDescription=(state,muted)=>({idle:'Music is off. Press Play remix when you are ready.',loading:'Loading the music.',paused:'Music is paused. Press Resume to continue.',playing:muted?'Music is muted. Press Unmute to hear it.':'Music is playing.',unavailable:'Music is not available. You can still look at the map and read the descriptions.'}[state]||'Music is off. Press Play remix when you are ready.');
const divergedScientificSources=mapRecord=>{
 const known=new Set(LAYER_OPTIONS.map(l=>l.id));if(mapRecord.layers.some(layer=>!known.has(layer.id)))return true;const distinct=new Set(mapRecord.layers.map(l=>l.id));return distinct.size!==mapRecord.layers.length;
};
function dataLayers(layers){
 if(itemsShallow(layers))return [...layers].sort((a,b)=>(a.order??0)-(b.order??0)).map(layer=>({...baseResolve(layer.id),...layer}));
 return LAYER_OPTIONS.map((layer,order)=>({...layer,order}));
}
const baseResolve=(id)=>LAYER_OPTIONS.find(l=>l.id===id)||LAYER_OPTIONS[0];
const itemsShallow=lists=>Array.isArray(lists)&&lists.every(layer=>baseResolve(layer.id).sourceFile);
