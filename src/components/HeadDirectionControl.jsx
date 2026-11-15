import React from 'react';
import useHeadDirection from '../hooks/useHeadDirection.js';
import './HeadDirectionControl.css';

const LABELS={forward:'Forward',up:'Up',left:'Left',right:'Right',down:'Down',uncertain:'Uncertain'};
const ARROWS={forward:'●',up:'↑',left:'←',right:'→',down:'↓',uncertain:'?'};
const STATUS={off:'Off',requesting:'Requesting camera…',active:'Camera active · local',error:'Camera or inference error',unsupported:'Not supported'};

export default function HeadDirectionControl({engineRef,onReady,spatialEnabled=false,headInfluence=false,onSpatialChange,onHeadInfluenceChange,onDirection,detectorLoader}){
 const [spatialError,setSpatialError]=React.useState(null);
 const enabled=spatialEnabled,follow=headInfluence;
 const tracking=useHeadDirection({engineRef,enabled:follow,detectorLoader,onReady,onDirection});
 const {state,manualDirection}=tracking;
 function onEnabled(event){
  const value=event.target.checked;
  try{
   if(engineRef.current)engineRef.current.setSpatialEnabled(value);
   onSpatialChange?.(value);
   if(!value)onHeadInfluenceChange?.(false);
   setSpatialError(value&&!engineRef.current?'Spatial sound is pending; the next explicit Play remix will apply it. Music was not started.':null);
  }catch(error){onSpatialChange?.(false);onHeadInfluenceChange?.(false);setSpatialError(error.message);}
 }
 function onFollow(event){
  const value=event.target.checked;
  if(value)setSpatialError(engineRef.current?'':'Head following is pending; an explicit Play remix will apply it. Music was not started.');
  if(!value){onDirection?.({direction:"stop",source:"head-optout"});onSpatialChange?.(true);}
  onHeadInfluenceChange?.(value);
 }
 return <section className="head-direction" aria-labelledby="head-direction-title" data-head-test={state.status}>
  <div className="head-direction-heading"><div><p className="small-caps">OPTIONAL / LOCAL INPUT</p><h2 id="head-direction-title">Head direction <span>(optional)</span></h2></div><output aria-label="Detected head direction" data-direction={state.direction}>{ARROWS[state.direction]} {LABELS[state.direction]}</output></div>
  <p className="head-direction-privacy">Optional coarse head direction estimated from camera-frame face geometry—not eye gaze, exact orientation, compass or geography. Local browser inference uses one face and discards its estimates; no recording, saving or frame upload.</p>
  <div className="head-tracking-toolbar">
   <button type="button" className="head-start" onClick={tracking.start} disabled={state.status==='requesting'||state.status==='active'}>{state.status==='active'?'Tracking enabled':state.status==='requesting'?'Requesting…':'Enable camera'}</button>
   <button type="button" onClick={tracking.stop} disabled={!['requesting','active'].includes(state.status)}>Stop tracking</button>
   <button type="button" onClick={tracking.calibrate} disabled={state.status!=='active'} aria-label="Calibrate forward from the current centered head">Calibrate forward</button>
   <button type="button" onClick={tracking.recenter}>Reset direction</button>
  </div>
  <div className="head-camera-status" role={['error','unsupported'].includes(state.status)?'alert':'status'} data-camera-status={state.status}>
   <span className={`camera-dot ${state.status==='active'?'camera-live':''}`} aria-hidden="true"/>
   <strong>{STATUS[state.status]||state.status}</strong><span>{state.status==='active'?(state.calibrated?'Hold to preview; recenter to travel one step.':'Center your face; first valid frame sets forward, or press Calibrate forward.'):(['error','unsupported'].includes(state.status)?'Camera stopped; choose manual directions below.':'No camera access until Enable camera.')}</span>
  </div>
  {state.error&&<p className="head-direction-error">{state.error}</p>}
  {['active','requesting'].includes(state.status)&&<label className="head-preview-choice"><input type="checkbox" checked={tracking.preview} onChange={e=>tracking.setPreview(e.target.checked)}/> Show local preview</label>}
  <video ref={tracking.videoRef} className={`head-video ${tracking.preview?'':'preview-off'}`} muted playsInline aria-label="Optional local camera preview, visually mirrored only; listener left and right follow your actual head, not the preview"/>
  {tracking.preview&&<p className="preview-label">Mirrored preview only · your right = listener/source right</p>}
  <details className="manual-direction" open={['error','unsupported'].includes(state.status)||undefined}>
   <summary>No camera? Choose a head direction</summary>
   <div className="manual-direction-grid" role="group" aria-label="Manual head direction">
    {['up','left','forward','right','down'].map(direction=><button type="button" key={direction} data-direction-button={direction} aria-pressed={manualDirection===direction} onClick={()=>tracking.manual(direction)}><span aria-hidden="true">{ARROWS[direction]}</span> {LABELS[direction]}</button>)}
    <button type="button" onClick={tracking.clearManual}>Reset manual</button>
   </div>
   <p>Buttons change listening direction only when both opt-ins below are on. They never start music.</p>
  </details>
  <div className="head-audio-optins">
   <label><input type="checkbox" checked={enabled} onChange={onEnabled}/> <span><strong>Spatial sound (headphones)</strong><small>Uses the single recording at (0,0,0) when centered; directional previews use a fixed artistic 2 m offset. Bypassed by default; no physical location or HRIR dataset is claimed.</small></span></label>
   <label><input type="checkbox" checked={follow} onChange={onFollow} disabled={!enabled}/> <span><strong>Head travel</strong><small>{enabled?'When spatial sound is also enabled, preview a neighbor; recenter to move one region. No camera action starts music.':'Enable spatial sound first. Music and this control remain independent.'}</small></span></label>
  </div>
  {spatialError&&<p className="head-direction-error">{spatialError}</p>}
  <p className="head-direction-footnote">Face briefly missing: retain the last direction for 0.8 s, then cancel the preview. Stop closes camera resources and restores neutral orientation, never stopping or starting music. Reduced-motion mode uses static, thresholded updates.</p>
 </section>;
}
