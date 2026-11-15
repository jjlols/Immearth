import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {LAYER_OPTIONS,OPACITY_DEFAULTS} from './layerOptions.js';
import {RemixEngine} from './audio/RemixEngine.js';
import SpatialOriginMarker from './components/SpatialOriginMarker.jsx';
import HeadDirectionControl from './components/HeadDirectionControl.jsx';
import './styles-origin.css';
import {featureModel,describeFeature,INSTRUMENT_INFO,TRACK} from './audio/musicMappings.js';
import {explorerPosition,useExplorer,EXPLORER_SIZE,EXPLORER_COLUMNS} from './hooks/useExplorer.js';
import useHeadPreviewTravel from './hooks/useHeadPreviewTravel.js';
import SiteChrome from './SiteChrome.jsx';
import './listening.css';

function GeographicCanvas({layers,settings,focus,onlySelected,showGeography,loading,explorerIndex}){
 return <div className="geographic-canvas" role="group" aria-label="Natural Earth polygons and NASA fields with image-region exploration">
 {showGeography&&<img src={`${import.meta.env.BASE_URL}assets/basemap.png`} className="geoplanes" alt="Natural Earth coastline and land polygons, without any metric data"/>}
 {layers.filter(layer=>settings[layer.id]?.visible!==false).map(layer=><MapField key={layer.id} layer={layer} settings={settings} solo={onlySelected?focus:null}/>) }
 <div className="exploration-marker" data-exploration-region={explorerIndex} style={explorerPosition(explorerIndex)} aria-hidden="true"><span>↗</span><small>Sample {explorerIndex+1}/{EXPLORER_SIZE}</small></div>
 <SpatialOriginMarker />
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

function SourceControl({layer,visible,opacity,focus,onSelect,onVisible,onOpacity,onNavigate}){
 return <article className={`source-card ${focus?'is-focused':''}`} style={{'--layer-accent':layer.color}} data-source-card={layer.id}>
 <button type="button" className="source-select" data-source-select={layer.id} aria-pressed={focus} aria-label={`Explore ${layer.label} musical mapping`} tabIndex={focus?0:-1} onClick={()=>onSelect(layer.id)} onKeyDown={(event)=>onNavigate(event,layer.id)}>
 <span className="metric-symbol" aria-hidden="true">{layer.mark}</span>
 <span className="metric-text"><strong>{layer.label}</strong><small>{layer.short}</small></span>
 <span className="select-indicator" aria-hidden="true">{focus?'↗':'↙'}</span>
 </button>
 <div className="source-ctls">
 <label className="visibility-toggle"><input type="checkbox" checked={visible} onChange={event=>onVisible(layer.id,event.target.checked)} aria-label={`Show ${layer.label} on map and enable its musical layer`}/><span>In view</span></label>
 <input type="range" aria-label={`${layer.label} opacity`} min="0" max="1" step="0.05" value={opacity} onChange={e=>onOpacity(layer.id,Number(e.target.value))}/>
 <span className="opacity-readout">{Math.round(opacity*100)}%</span>
 </div>
 </article>;
}

function RegionStudy({regions,layerLabel,selected,onSelect,announcement}){
 return <div className="region-study compact"><h3 id="region-title" className="sr-only">Select region for {layerLabel}</h3>
 <div className="regional-grid" role="group" aria-label={`Select regional sample for ${layerLabel}`}>
 {Array.from({length:EXPLORER_SIZE},(_,i)=>{
 const feat=regions?.[i];const selectedState=selected===i;
 return <button key={i} type="button" aria-pressed={selectedState} aria-label={regionButtonLabel(i,feat)} onClick={()=>onSelect(i)}>
 <span>{String(i+1).padStart(2,'0')}</span><i className={feat?.classified_count?'filled-region':''}/>
 </button>})}
 </div>
 {regions?.[selected]&&<div className="region-counts" aria-label="Palette sample counts"><span><strong>{regions[selected].classified_count||0}</strong> matched</span><span><strong>{regions[selected].unclassified_count||0}</strong> unclassified</span><span><strong>{regions[selected].sample_count||0}</strong> sampled</span></div>}
 <div className="current-region" role="status" aria-live="polite">{announcement}</div>
 </div>
}

function SoundMeter({playState,engineRef}){
 const [level,setLevel]=useState(0);
 useEffect(()=>{
  if(playState!=='playing'){setLevel(0);return undefined;}
  const timer=setInterval(()=>{
   const metrics=engineRef.current?.getOutputMetrics();
   setLevel(metrics?Math.min(1,metrics.rms/0.05):0);
  },200);
  return()=>clearInterval(timer);
 },[playState,engineRef]);
 const words=playState!=='playing'?'silent':level<0.12?'very quiet':level<0.28?'quiet':level<0.6?'medium':'strong';
 return <div className="sound-meter"><span className="sound-meter-label">Sound level: {words}.</span><span className="sound-meter-bars" aria-hidden="true">{[0.12,0.28,0.45,0.6,0.8].map(step=><i key={step} className={level>=step?'is-on':''}/>)}</span></div>;
}

export default function Jukebox(){
 const [manifest,setManifest]=useState(null),[features,setFeatures]=useState(null),[loadError,setLoadError]=useState(null);
 const [settings,setSettings]=useState(Object.fromEntries(LAYER_OPTIONS.map(layer=>[layer.id,{visible:true,opacity:OPACITY_DEFAULTS[layer.id]}])));
 const [focus,setFocus]=useState('nitrogen_oxides'),[mode,setMode]=useState('composition'),[onlySelected,setOnlySelected]=useState(false),[showGeography,setShowGeography]=useState(true);
 const {index:explorerIndex,choose:chooseExplorerRegion}=useExplorer();
 const engine=useRef(null),modelsRef=useRef({}),visibilityRef=useRef({});
 const headSyncRef=useRef(()=>{});
 const [spatialEnabled,setSpatialEnabled]=useState(false),[headInfluence,setHeadInfluence]=useState(false);
 const [playState,setPlayState]=useState('idle'),[audioError,setAudioError]=useState(null),[muted,setMuted]=useState(false),[volume,setVolume]=useState(.48),[progress,setProgress]=useState(0);
 const layers=useMemo(()=>dataLayers(manifest?.layers),[manifest]);
 const featureById=features?.[focus];

 const chooseExplorer=useCallback(index=>{chooseExplorerRegion(index);},[chooseExplorerRegion]);
 const travel=useHeadPreviewTravel({index:explorerIndex,choose:chooseExplorer,enabled:spatialEnabled && headInfluence,engineRef:engine});

 const currentLayer=layers.find(l=>l.id===focus)||layers[0]||LAYER_OPTIONS[0];
 const currentIndex=travel.previewing?travel.regionIndex:explorerIndex;
 const currentFeature=featureById?.[currentIndex];

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
 useEffect(()=>{const engineInstance=engine.current; return()=>engineInstance?.dispose();},[]);
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
 function setModeSpatial(value){onHeadDirection({enabled:value,spatial:true});}
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
  if(!engine.current){engine.current=new RemixEngine();headSyncRef.current();}
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
 <a className="skip-link" href="#music-player">Skip to the music player</a><a className="skip-link" href="#map-controls">Skip to fields</a><a className="skip-link" href="#learning">Skip to learning guide</a>
 <SiteChrome current="music" part="header" />
 <div className="jukebox-shell">
 <header className="masthead"><h1 className="brand-main" id="music-title" tabIndex={-1}>Listening map. Music begins only when you press Play remix.</h1></header>
 <section className="intro-block"><div><p className="eyebrow">Earth Information Center / 3D listening</p><h1>Hear your place.<br/><em>Feel the world.</em></h1></div><p className="intro-aside">Choose one map or combine eligible layers in the shared recording. Explore its regions with your keyboard.</p></section>
 <section className="music-console" id="music-player" tabIndex={-1} aria-label="Music controls">
  <div className="score-badge" aria-hidden="true"><span>∿</span></div>
  <div className="track-heading"><p className="small-caps">SOUNDS LIKE A THOUGHT, UNFOLDING</p><h2>Deliberate Thought<span>Kevin MacLeod · 69 BPM</span></h2></div>
  <div className="transport-buttons">
   <button type="button" className="main-action" onClick={togglePlayback} disabled={loading||playState==='loading'}>{playState==='playing'?'Pause':playState==='paused'?'Resume':playState==='loading'?'Loading…':playState==='unavailable'?'Retry':'Play remix'}<span aria-hidden="true">{playState==='playing'?'Ⅱ':'↗'}</span></button>
   <div className="secondary-peripherals"><button className="secondary-action" type="button" onClick={resetMusic} aria-label="Reset music playback">↻ <span>Reset</span></button>
   <button className={`secondary-action ${muted?'muted-off':''}`} type="button" onClick={()=>{setMuted(!muted);engine.current?.setMute(!muted)}}><span>{muted?'Unmute':'Mute'}</span></button></div>
   <label className="master-volume"><span>Master volume</span><input type="range" min="0" max="50" step="0.01" aria-label="Master volume" value={volume*100} onChange={event=>{const v=Number(event.target.value)/100;setVolume(v);engine.current?.setVolume(v)}}/> <span className="volume-cap">{Math.round(volume*100)}%</span></label>
   <p className="tiny-attribution">{popularCreativeVoice(playState)}</p>
  </div>
  <div className="track-copy">
   <p className="track-detail">A restrained recording modified by a living map. Music begins only when you press play. W, A, S, D or the arrow keys move between 48 regions, and only while the music is already playing. Those keys do nothing while you are on a button, link, or slider.</p>
   <p role="status" aria-live="polite" className={`playback-status state-${playState}`}><span aria-hidden="true">{ws_icon(playState)}</span> {audioDescription(playState,muted)}</p>
   <p className="hearing-caption">{playbackCaption(playState, muted)}</p>
   <SoundMeter playState={playState} engineRef={engine}/>
   <div className="progress-wrap">
    <div className="progress-rail" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(100,progress))} aria-label="Music position"><span style={{width:`${Math.min(100,progress)}%`}}/></div>
    <span className="progress-percent">{Math.round(Math.min(100,progress))}%</span>
   </div>
   <p className="source-license">Kevin MacLeod (incompetech.com) · <a href={TRACK.licenseUrl} target="_blank" rel="noreferrer">CC BY 4.0 (opens in a new tab)</a> · Modified, no manufactured stems.<a className="license-detail" href="#attribution">License details</a></p>
  </div>
 </section>
 <HeadDirectionControl engineRef={engine} onReady={callback=>{headSyncRef.current=callback;}} spatialEnabled={spatialEnabled} headInfluence={headInfluence} onDirection={onHeadDirection} onSpatialChange={setModeSpatial} onHeadInfluenceChange={onHeadInfluence}/>

 {audioError&&<div role="alert" className="app-alert">{audioError}<button type="button" onClick={()=>setAudioError(null)}>Dismiss</button></div>}
 {loadError&&<div role="alert" className="app-alert">{loadError}<span> Existing geographic work is unchanged.</span></div>}
 <div className="workspace-shared">
  <main className="map-workspace">
   <div className="workspace-title"><div><p className="small-caps">GEOGRAPHIC STAGE / SOURCE RASTERS</p><h2>Earth, <em>in conversation.</em></h2></div><span className="dataset-label">05 independent fields</span></div>
   <div className="map-frame"><GeographicCanvas explorerIndex={explorerIndex} layers={layers} settings={settings} focus={focus} onlySelected={onlySelected} showGeography={showGeography} loading={loading}/></div>
   <p className="map-explainer"><span aria-hidden="true">◎</span> Real land shapes—not a grayscale scientific screenshot—under complete source maps. Opacity changes do not choose which scientific observations are valid. <a href="#method">Why this matters</a>.</p>
  </main>
  <aside className="explorer-panel" id="map-controls" aria-label="Science field controls">
   <div className="panel-heading"><div><p className="small-caps">THE ENSEMBLE</p><h2>Pick your perspective.</h2></div><span className="metric-number">05</span></div>
   <div className="interaction-modes" role="group" aria-label="Map and sonification modes"><button type="button" aria-pressed={mode==='solo'} className={mode==='solo'?'selected-mode':''} onClick={()=>{setMode('solo'); if(!focus)setFocus('nitrogen_oxides');engine.current?.setMode('solo');}}><strong>Solo / Explore</strong><small>One map at a time.</small></button><button type="button" aria-pressed={mode==='composition'} className={mode==='composition'?'selected-mode':''} onClick={()=>{setMode('composition');engine.current?.setMode('composition');}}><strong>Ensemble</strong><small>All maps together.</small></button></div>
   <p className="mode-explainer">{mode==='solo'?'Learn what a single metric contributes. The selected field stays the audible focus when it meets palette rules.': 'Each enabled field adds its character to the original recording—independently controlled.'}</p>
   <div className="source-controllers" aria-label="Geographic layers and their visibility">
   {layers.map(layer=><SourceControl key={layer.id} layer={layer} focus={focus===layer.id} visible={settings[layer.id]?.visible!==false} opacity={settings[layer.id]?.opacity ?? OPACITY_DEFAULTS[layer.id]} onSelect={selectMetric} onVisible={(id,visible)=>{setSettings(current=>({...current,[id]:{...current[id],visible}}));engine.current?.setVisibility(id,visible);}} onOpacity={(id,opacity)=>setSettings(current=>({...current,[id]:{...current[id],opacity}}))} onNavigate={navigateCards}/>)}
   </div>
   <div className="map-options"><label><input type="checkbox" checked={showGeography} onChange={e=>setShowGeography(e.target.checked)}/> Show geographic land & coasts</label><label><input type="checkbox" checked={onlySelected} onChange={e=>setOnlySelected(e.target.checked)}/> Selected field only</label>
   <button className="reset-composition" type="button" onClick={()=>{setSettings(Object.fromEntries(LAYER_OPTIONS.map(l=>[l.id,{visible:true,opacity:OPACITY_DEFAULTS[l.id]}])));setFocus(null);setOnlySelected(false);setMode('composition');setShowGeography(true);}}>↻ Reset layers</button></div>
  </aside>
 </div>
 <section className="map-navigation" id="map-navigation" aria-labelledby="map-navigation-title">
  <h2 id="map-navigation-title" className="sr-only">Map navigation</h2>
  <p><a href="/?view=guide#move-title">Map controls & details <span aria-hidden="true">↗</span></a></p>
 </section>
 <section className="compact-region-panel" aria-labelledby="region-title">
  <RegionStudy layerLabel={currentLayer.label} regions={featureById||[]} selected={currentIndex} onSelect={chooseExplorerRegion} announcement={regionStatus(currentIndex,currentLayer.label,describeFeature(focus,currentFeature))}/>
 </section>
 <section className="sr-only" id="learning" aria-labelledby="voice-title">
  <h2 id="voice-title">Hearing {currentLayer.label}</h2>
  <p>{INSTRUMENT_INFO[currentLayer.id]?.explanation || 'Estimated palette positions reshape this field’s part of the recording.'}</p>
  <p>{describeFeature(focus,currentFeature)}</p>
 </section>

 <details id="attribution" className="license-paper"><summary>Details & attribution</summary><div><p><strong>“Deliberate Thought” — Kevin MacLeod, incompetech.com — Creative Commons Attribution 4.0 International.</strong><a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">Read the license (CC BY 4.0, opens in a new tab)</a>. The local recording is decoded once per engine lifetime. Generic filters, playback-rate changes and gain envelopes modify the original recording; no oscillator or generated guide tone exists. No official stems are claimed. Attribution is preserved in the interface and project license files.</p>
 <p>NASA palette stations support semantic tools not medical/population statements. The same source aspect ratio is not identical geographically verified projection or acquisition time. Continuous global fields drawn as a colored image can be inspected as whole pixels (maps) and reduced to bounded classifications (music). This is an interpretive educational listening aid, not physical truth sonification or a weather warning service. Scientific data must come from verified underlying measurement input for any absolute calibration.</p>
 <p>Navigation and map inspection stay silent before Play. Source values remain nearest-palette estimates with the recorded uncertainty. See README.md and LICENSES.md for full implementation and verification notes. DeepSpace deployment is not configured or claimed.</p></div></details>
 <footer className="sr-only"><span>NASA Scientific Visualization Studio · Natural Earth geography · Kevin MacLeod</span><span>Built with React and Web Audio, respectfully at 69 BPM.</span></footer>
 <SiteChrome current="music" part="footer" />
 </div>
 </>;
}

function applyPreviewPosition(engine, position) {
 if (!engine) return;
 engine.spatial.setSourcePosition(position ?? { x: 0, y: 0, z: 0 });
}
function regionButtonLabel(index,features){
 const count=features?.classified_count||0;
 const total=features?.sample_count||0;
 const plain=count===0?'no confident match, this region stays silent':count/Math.max(total,1)<0.25?'few confident matches':'several confident matches';
 return `Analyze region ${index+1}: ${count} usable palette matches of ${total} samples, ${plain}`;
}
function regionStatus(selected,layerLabel,featureSentence){
 const row=Math.floor(selected/EXPLORER_COLUMNS)+1;
 const column=(selected%EXPLORER_COLUMNS)+1;
 return `Region ${selected+1} of ${EXPLORER_SIZE}, row ${row}, column ${column}. ${layerLabel}. ${featureSentence}`;
}

function playbackCaption(playState, muted) {
 if (playState === 'loading') return 'Loading the recording.';
 if (playState === 'unavailable') return 'Audio unavailable. The map and text descriptions remain available.';
 if (playState === 'paused') return 'Music paused.';
 if (playState === 'playing' && muted) return 'Music muted.';
 return '';
}

const ws_icon=state=>({playing:'▸',paused:'Ⅱ',loading:'⋯',idle:'○',unavailable:'!'})[state]||'○';
const audioDescription=(state,muted)=>({idle:'No music yet. Set the scene and listen.',loading:'Reading the shared recording and estimated feature map…',paused:'Music paused. Your map and estimated palette analyses remain readable.',playing:muted?'Muted; musical map mode stays readable.':'Playing a gentle data-led remix.',unavailable:'Audio unavailable; you can explore readably without playing.'}[state]||'Make up your own map.');
const popularCreativeVoice=(state)=>state==='playing'?`One recording. One shared clock. ${'Gentle foreground voices each cycle. '}`:'No audio until you call the musical field, card and play control.';
const divergedScientificSources=mapRecord=>{
 const known=new Set(LAYER_OPTIONS.map(l=>l.id));if(mapRecord.layers.some(layer=>!known.has(layer.id)))return true;const distinct=new Set(mapRecord.layers.map(l=>l.id));return distinct.size!==mapRecord.layers.length;
};
function dataLayers(layers){
 if(itemsShallow(layers))return [...layers].sort((a,b)=>(a.order??0)-(b.order??0)).map(layer=>({...baseResolve(layer.id),...layer}));
 return LAYER_OPTIONS.map((layer,order)=>({...layer,order}));
}
const baseResolve=(id)=>LAYER_OPTIONS.find(l=>l.id===id)||LAYER_OPTIONS[0];
const itemsShallow=lists=>Array.isArray(lists)&&lists.every(layer=>baseResolve(layer.id).sourceFile);
