import React,{useEffect,useMemo,useRef,useState} from 'react';
import {LAYER_OPTIONS,OPACITY_DEFAULTS} from './layerOptions.js';
import {RemixEngine} from './audio/RemixEngine.js';
import SpatialOriginMarker from './components/SpatialOriginMarker.jsx';
import './styles-origin.css';
import {featureModel,describeFeature,INSTRUMENT_INFO,TRACK} from './audio/musicMappings.js';

function GeographicCanvas({manifest,layers,settings,focus,onlySelected,showGeography,loading}){
 return <div className="geographic-canvas" role="img" aria-label="Natural Earth geographic polygons beneath independently displayed NASA scientific map fields">
 {showGeography&&<img src={`${import.meta.env.BASE_URL}assets/basemap.png`} className="geoplanes" alt="Natural Earth coastline and land polygons, without any metric data"/>}
 {layers.map(layer=><MapField key={layer.id} layer={layer} settings={settings} solo={onlySelected?focus:null}/>) }
 <SpatialOriginMarker />
 {loading&&<div className="loading-scrim" role="status">Loading geography and palette features…</div>}
 <span className="map-longitude west">180° W</span><span className="map-longitude east">180° E</span>
 <span className="map-hemisphere">Equatorial viewing plane <span>•</span> source projections remain provisional</span>
 </div>;
}

function MapField({layer,settings,solo}){
 const ref=useRef(null);const visibility=settings.visible!==false;
 useEffect(()=>{
  const canvas=ref.current;if(!canvas)return;
  const ctx=canvas.getContext('2d');const img=new Image();
  img.onload=()=>{ctx.drawImage(img,0,0);canvas.dataset.loaded='true';};
  img.onerror=()=>{canvas.dataset.error='true';};
  img.src=`${import.meta.env.BASE_URL}assets/${layer.id}.png`;
  return()=>{img.onload=null;img.onerror=null};
 },[layer.id,layer.url]);
 const visible=visibility&&!solo?solo!==layer.id:visibility;
 const opacity=!visibility?0:solo?(solo===layer.id?1:0):settings.opacity??.66;
 return <canvas ref={ref} data-checkbox={`linkulation-process`} className="map-raster" data-map-field={layer.id} aria-hidden="true" width={layer.width||4096} height={layer.height||2048} style={{opacity,zIndex:solo===layer.id?110:layer.order}}/>;
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

function RegionStudy({regions,layerLabel,selected,onSelect}){
 return <div className="region-study"><h3>Regional analysis, in context</h3>
 <p>Tap an image-relative region to change the selected palette analysis. Location is reserved for eventual spatial audio; it does not steer pitch or tempo now.</p>
 <div className="regional-grid" role="group" aria-label={`Select regional sample for ${layerLabel}`}>
 {Array.from({length:12},(_,i)=>{
 const feat=regions?.[i];const selectedState=selected===i;
 return <button key={i} type="button" aria-pressed={selectedState} aria-label={`Analyze region ${i+1}: ${feat?.classified_count||0} usable palette matches of ${feat?.sample_count||0} samples`} onClick={()=>onSelect(i)}>
 <span>{String(i+1).padStart(2,'0')}</span><i className={feat?.classified_count?'filled-region':''}/>
 </button>})}
 </div>
 {regions?.[selected]&&<div className="region-counts"><span><strong>{regions[selected].classified_count||0}</strong> matched</span><span><strong>{regions[selected].unclassified_count||0}</strong> unclassified / silent</span><span><strong>{regions[selected].sample_count||0}</strong> sampled</span><small>Estimated accepted palette comparisons, not verified geographic measurements.</small></div>}
 <div className="current-region">Sample {selected+1} of 12</div>
 </div>
}

export default function Jukebox(){
 const [manifest,setManifest]=useState(null),[features,setFeatures]=useState(null),[loadError,setLoadError]=useState(null);
 const [settings,setSettings]=useState(Object.fromEntries(LAYER_OPTIONS.map(layer=>[layer.id,{visible:true,opacity:OPACITY_DEFAULTS[layer.id]}])));
 const [focus,setFocus]=useState('nitrogen_oxides'),[mode,setMode]=useState('solo'),[onlySelected,setOnlySelected]=useState(false),[showGeography,setShowGeography]=useState(true),[chosenRegion,setChosenRegion]=useState({});
 const engine=useRef(null),modelsRef=useRef({}),visibilityRef=useRef({}),lastInteraction=useRef(null);
 const [playState,setPlayState]=useState('idle'),[audioError,setAudioError]=useState(null),[muted,setMuted]=useState(false),[volume,setVolume]=useState(.22),[progress,setProgress]=useState(0),[notes,setNotes]=useState(0),[mobileMenu,setMobileMenu]=useState(false),[scanVisible,setScanVisible]=useState(false);
 const layers=useMemo(()=>dataLayers(manifest?.layers),[manifest]);
 const featureById=features?.[focus];
 const currentLayer=layers.find(l=>l.id===focus)||layers[0]||LAYER_OPTIONS[0];
 const currentIndex=chosenRegion[focus]||0;
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
   if(divergedScientificSources(mapRecord))throw new Error('Manifest contains an invalid metric vocabulary.');
   setManifest(mapRecord);setFeatures(scales.categories);
  }).catch(err=>{if(alive)setLoadError(err.message);});
  return()=>{alive=false};
 },[]);
 /* Only field-model state transfers prior to a later gesture; context absent here. */
 const musicalModels=useMemo(()=>{
  if(!features)return {};
  return Object.fromEntries(layers.map(layer=>{
   const cell=features[layer.id]?.[chosenRegion[layer.id]||0];
   return [layer.id,featureModel(layer.id,cell)];
  }));
 },[features,layers,chosenRegion]);
 const audibleVisibilities=useMemo(()=>Object.fromEntries(layers.map(layer=>[layer.id,settings[layer.id]?.visible!==false])),[layers,settings]);
 useEffect(()=>{modelsRef.current=musicalModels;visibilityRef.current=audibleVisibilities;},[musicalModels,audibleVisibilities]);
 useEffect(()=>{if(engine.current){engine.current.setModel(modelsRef.current,{visibility:visibilityRef.current,selection:focus,mode});}},[focus,mode,modelsRef.current]);
 useEffect(()=>{const engineInstance=engine.current; return()=>engineInstance?.dispose();},[]);
 useEffect(()=>{
  const timer=setInterval(()=>{if(engine.current){setProgress(engine.current.elapsed/(engine.current.duration||177.456)*100);setNotes(engine.current.accents.size);}},250);
  return()=>clearInterval(timer);
 },[]);

 const selectMetric=(id)=>{
  setFocus(id);
  const nextFocus=id;
  setFocus(nextFocus);
  setSettings(previous=>({...previous,[id]:{...previous[id],visible:true}}));
  if(engine.current){engine.current.setModel(modelsRef.current,{visibility:{...visibilityRef.current,[id]:true},selection:id,mode});engine.current.setSelected(id);}
 };
 const navigateCards=(event,id)=>{
  const ray=layers.map(layer=>layer.id);const index=ray.indexOf(id);
  let nextIndex;
  if(['ArrowDown','ArrowRight'].includes(event.key))nextIndex=(index+1)%ray.length;
  else if(['ArrowUp','ArrowLeft'].includes(event.key))nextIndex=(index-1+ray.length)%ray.length;
  else if(event.key==='Home')nextIndex=0;else if(event.key==='End')nextIndex=ray.length-1;else return;
  event.preventDefault();document.querySelector(`[data-source-select="${ray[nextIndex]}"]`)?.focus();
 };
 async function togglePlayback(){
  if(!engine.current)engine.current=new RemixEngine();
  const player=engine.current.lastGesture=engine.current;
  player.setModel(modelsRef.current,{visibility:visibilityRef.current,selection:focus,mode});player.setMute(muted);player.setVolume(volume);
  setAudioError(null);
  if(player.isRunning){await player.pause();setPlayState('paused');return;}
  if(playState==='paused'){
   const resumedModule=new RemixEngine();engine.current=resumedModule||player;
   resumedModule.setModel(modelsRef.current,{visibility:visibilityRef.current,selection:focus,mode}); resumedModule.setMute(muted);resumedModule.setVolume(volume);
   setPlayState('loading');
   try{await resumedModule.play();setPlayState('playing');return;}catch(error){setAudioError(error.message);setPlayState('unavailable');return;}
  }
  setPlayState('loading');
  try{await player.play();setPlayState('playing');}catch(error){setAudioError(error.message);setPlayState('unavailable');}
 }
 async function resetMusic(){
  await engine.current?.reset();setProgress(0);setPlayState('idle');setMuted(false);setAudioError(null);
 }
 const loading=!manifest||!features;
 const voices=Object.values(modelsRef.current).filter(v=>!v.silent).length;
 return <div className="jukebox-shell">
 <a className="skip-link" href="#map-controls">Skip to fields</a><a className="skip-link" href="#learning">Skip to learning guide</a>
 <header className="masthead"><span className="orbit-symbol" aria-hidden="true">◎</span><span className="brand-main">EARTH INFORMATION JUKEBOX</span><span className="brand-note">NASA data · one listening canvas</span><button className="mobile-toggle" type="button" aria-expanded={mobileMenu} onClick={()=>setMobileMenu(!mobileMenu)}>{mobileMenu?'Close transport':'Music'}</button></header>
 <section className="intro-block"><div><p className="small-caps">A QUIET MUSICAL INTERPRETATION OF THE WORLD</p><h1>One planet.<br/><em>Five voices.</em></h1></div><p className="intro-aside">Bring the unseen into the foreground.<br/>Follow a single field, or meet the ensemble.</p></section>
 <section className={`${mobileMenu?'music-shortcut':''} music-console`} aria-label="Music controls">
  <div className="score-badge" aria-hidden="true"><span>∿</span></div>
  <div className="track-copy"><p className="small-caps">SOUNDS LIKE A THOUGHT, UNFOLDING</p><h2>Deliberate Thought<span>Kevin MacLeod · 69 BPM</span></h2>
   <p className="track-detail">A restrained recording modified by a living map. Music begins only when you press play.</p>
   <p aria-live="polite" className={`playback-status state-${playState}`}><span aria-hidden="true">{ws_icon(playState)}</span> {audioDescription(playState,muted)}</p>
   <div className="progress-rail" aria-label={`Music position: ${Math.round(progress)} percent`}><span style={{width:`${Math.min(100,progress)}%`}}/></div>
   <p className="source-license">Kevin MacLeod (incompetech.com) · <a href={TRACK.licenseUrl} target="_blank" rel="noreferrer">CC BY 4.0</a> · Modified, no manufactured stems.<a className="license-detail" href="#attribution">License details</a></p>
  </div>
  <div className="transport-buttons">
   <button type="button" className="main-action" onClick={togglePlayback} disabled={loading||playState==='loading'}>{playState==='playing'?'Pause':playState==='paused'?'Resume':playState==='loading'?'Loading…':playState==='unavailable'?'Retry':'Play remix'}<span aria-hidden="true">{playState==='playing'?'Ⅱ':'↗'}</span></button>
   <div className="secondary-peripherals"><button className="secondary-action" type="button" onClick={resetMusic} aria-label="Reset music playback">↻ <span>Reset</span></button>
   <button className={`secondary-action ${muted?'muted-off':''}`} type="button" onClick={()=>{setMuted(!muted);engine.current?.setMute(!muted)}}><span>{muted?'Unmute':'Mute'}</span></button></div>
   <label className="master-volume"><span>Master volume</span><input type="range" min="0" max="24" step="0.01" aria-label="Master volume" value={volume*100} onChange={event=>{const v=Number(event.target.value)/100;setVolume(v);engine.current?.setVolume(v)}}/> <span className="volume-cap">{Math.round(volume*100)}%</span></label>
   <p className="tiny-attribution">{popularCreativeVoice(playState)}</p>
  </div>
 </section>

 {audioError&&<div role="alert" className="app-alert">{audioError}<button type="button" onClick={()=>setAudioError(null)}>Dismiss</button></div>}
 {loadError&&<div role="alert" className="app-alert">{loadError}<span> Existing geographic work is unchanged.</span></div>}
 <div className="workspace-shared">
  <main className="map-workspace">
   <div className="workspace-title"><div><p className="small-caps">GEOGRAPHIC STAGE / SOURCE RASTERS</p><h2>Earth, <em>in conversation.</em></h2></div><span className="dataset-label">05 independent fields</span></div>
   <div className="map-frame"><GeographicCanvas layers={layers} settings={settings} focus={focus} onlySelected={onlySelected} showGeography={showGeography} loading={loading}/></div>
   <p className="map-explainer"><span aria-hidden="true">◎</span> Real land shapes—not a grayscale scientific screenshot—under complete source maps. Opacity changes do not choose which scientific observations are valid. <a href="#method">Why this matters</a>.</p>
  </main>
  <aside className="explorer-panel" id="map-controls" aria-label="Science field controls">
   <div className="panel-heading"><div><p className="small-caps">THE ENSEMBLE</p><h2>Pick your perspective.</h2></div><span className="metric-number">05</span></div>
   <div className="interaction-modes" role="group" aria-label="Map and sonification modes"><button type="button" aria-pressed={mode==='solo'} className={mode==='solo'?'selected-mode':''} onClick={()=>{setMode('solo'); if(!focus)setFocus('nitrogen_oxides');engine.current?.setMode('solo');}}><strong>Solo / Explore</strong><small>One voice, in focus.</small></button><button type="button" aria-pressed={mode==='composition'} className={mode==='composition'?'selected-mode':''} onClick={()=>{setMode('composition');engine.current?.setMode('composition');}}><strong>Composition</strong><small>The shared ensemble.</small></button></div>
   <p className="mode-explainer">{mode==='solo'?'Learn what a single metric contributes. The selected field stays the audible focus when is meets palette rules.': 'Each enabled field adds its character to the original recording—independently controlled.'}</p>
   <div className="source-controllers" aria-label="Geographic layers and their visibility">
   {layers.map(layer=><SourceControl key={layer.id} layer={layer} focus={focus===layer.id} visible={settings[layer.id]?.visible!==false} opacity={settings[layer.id]?.opacity ?? OPACITY_DEFAULTS[layer.id]} onSelect={selectMetric} onVisible={(id,on)=>{setSettings(current=>({...current,[id]:{...current[id],visible:on}}));engine.current?.setVisibility(id,on);}} onOpacity={(id,opacity)=>setSettings(current=>({...current,[id]:{...current[id],opacity}}))} onNavigate={navigateCards}/>)}
   </div>
   <div className="map-options"><label><input type="checkbox" checked={showGeography} onChange={e=>setShowGeography(e.target.checked)}/> Show geographic land & coasts</label><label><input type="checkbox" checked={onlySelected} onChange={e=>setOnlySelected(e.target.checked)}/> Selected field only</label>
   <button className="reset-composition" type="button" onClick={()=>{setSettings(Object.fromEntries(LAYER_OPTIONS.map(l=>[l.id,{visible:true,opacity:OPACITY_DEFAULTS[l.id]}])));setFocus(null);setOnlySelected(false);setMode('composition');setShowGeography(true);}}>↻ Reset layers</button></div>
  </aside>
 </div>
 <section className="learning-floor" id="learning" aria-live="polite">
 <section className="instrument-guide" aria-labelledby="voice-title"><div className="guide-label"><p className="small-caps">FIELD STUDY / MUSICAL VOCABULARY</p><span className={`listen-indicator ${playState==='playing'?'playing-dotted':''}`} title={playState==='playing'?'Audio is active':'No sound playing'}>{playState==='playing'?'AUDIO ACTIVE':'SILENT BY CHOICE'}</span></div>
 <h2 id="voice-title">{currentLayer.label}<span className="voice-kind"> / {INSTRUMENT_INFO[currentLayer.id]?.kind||'source mapping'}</span></h2>
 <p className="voice-description">{INSTRUMENT_INFO[currentLayer.id]?.explanation ||'You’re listening to a constrained recursive source composition. The map explains what each voice is and the limits of it.'}</p>
 <div className="value-provision"><span className="estimate-label">ESTIMATED PALETTE EVIDENCE</span><strong>{describeFeature(focus,currentFeature)}</strong></div>
 <div className="mapping-section"><h3>How this voice is derived</h3><p>{INSTRUMENT_INFO[currentLayer.id]?.caveat ||'Review the palette input accounts.'}</p></div>
 <div className="provenance"><span>RGB ≠ direct science.</span><p>Labels-to-values are supplied by previous reviewed palette <em>estimates</em>. Every musical adjustment maps from those closest legitimate classes, not luminance, not geolocation. Raw-data adapters can replace mapping later. Wrong hues, text, boundaries or disconnected pixels remain unclassified—not invented numbers.</p></div>
 </section>
 <RegionStudy layerLabel={currentLayer.label} regions={featureById||[]} selected={currentIndex} onSelect={index=>{setChosenRegion(prior=>({...prior,[focus]:index}));setScanVisible(true);}}/>
 </section>
 <section className="function-explainer" id="method"><span className="imagined-icon" aria-hidden="true">↺</span><div><h2>Hear what the data has to say—not guess what it cannot.</h2><p>The soundtrack’s role is to support guided curiosity. High on a <em>specific scientific scale</em> does not mean higher pitch automatically. NOₓ follows log₁₀ ranks while CO uses nonuniform palette anchors. Precipitation respects separate liquid/frozen groupings and fire strength respects FRP units. Temperature T2M is set in Celsius with the short-caption 3m vs detailed 2m note kept. Raw times are independent from music elapsed time.</p></div></section>
 <details id="attribution" className="license-paper"><summary>Music attribution and scientific uncertainty</summary><div><p><strong>“Deliberate Thought” — Kevin MacLeod, incompetech.com — Creative Commons Attribution 4.0 International.</strong><a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">Read the license (CC BY 4.0)</a>. The local decoding visit receives one MP3 lifetime; generic filters, gently tuned pads and exclusive small voices applied by this application are a musical modification, not official stems from an audited material article. There is a requirement for attribution, explicitly preserve as included.</p>
 <p>NASA palette stations support semantic tools not medical/population statements. The same source aspect ratio is not identical geographically verified projection or acquisition time. Continuous global fields drawn as a colored image can be inspected as whole pixels (maps) and reduced to bounded classifications (music). This is an interpretive educational listening aid, not physical truth sonification or a weather warning service. Scientific data must come from verified underlying measurement input for any absolute calibration.</p>
 <p>This sound is your architecture. Data-collected mechanics remain a reusable Audio API route corresponded with hook-level gesture activation. See companion README and `LICENSES.md` for full audit. DeepSpace static deployment is planned; no DeepSpace hosting is claimed by the localhost itself.</p></div></details>
 <footer className="notes-footer"><span>NASA Scientific Visualization Studio · Natural Earth geography · Kevin MacLeod</span><span>Built with React and Web Audio, respectfully at 69 BPM.</span></footer>
 </div>;
}

const ws_icon=state=>({playing:'▸',paused:'Ⅱ',loading:'⋯',idle:'○',unavailable:'!'})[state]||'○';
const audioDescription=(state,muted)=>({idle:'No music yet. Set the scene and listen.',loading:'Reading the shared recording and estimated feature map…',paused:'Music paused. Your map and hi-frequency analyses remain online.',playing:muted?'Muted; musical map mode stays readable.':'Playing a gentle data-led remix.',unavailable:'Audio unavailable; you can explore readably without playing.'}[state]||'Make up your own map.');
const popularCreativeVoice=(state)=>state==='playing'?`One recording. One shared clock. ${'Gentle foreground voices each cycle. '}`:'No audio until you call the musical field, card and play control.';
const divergedScientificSources=mapRecord=>{
 const known=new Set(LAYER_OPTIONS.map(l=>l.id));if(mapRecord.layers.some(layer=>!known.has(layer.id)))return true;const distinct=new Set(mapRecord.layers.map(l=>l.id));return distinct.size!==mapRecord.layers.length;
};
function dataLayers(layers){
 if(itemsShallow(layerslengthCheck(layers)))return [...layers].sort((a,b)=>(a.order??0)-(b.order??0)).map(layer=>({...baseResolve(layer.id),...layer}));
 return LAYER_OPTIONS.map((layer,order)=>({...layer,order}));
}
const baseResolve=(id)=>LAYER_OPTIONS.find(l=>l.id===id)||LAYER_OPTIONS[0];
const itemsShallow=lists=>Array.isArray(lists)&&lists.every(layer=>baseResolve(layer.id).sourceFile);
const layerslengthCheck = x=>x;
