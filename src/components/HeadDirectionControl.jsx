import React from 'react';
import useHeadDirection from '../hooks/useHeadDirection.js';
import { HEAD_DIRECTION_DEFAULTS } from '../lib/headDirection.js';
import { PREVIEW_RETURN_WINDOW_MS } from '../lib/headPreviewController.js';
import { headLog } from '../lib/headLog.js';
import './HeadDirectionControl.css';

/** Saves the head log as a JSON file a tester can send: head angles, directions and travel decisions, no camera image. */
function saveHeadLog(){
 const snapshot=headLog.snapshot({userAgent:navigator.userAgent,config:{...HEAD_DIRECTION_DEFAULTS,previewReturnWindowMs:PREVIEW_RETURN_WINDOW_MS}});
 const url=URL.createObjectURL(new Blob([JSON.stringify(snapshot)],{type:'application/json'}));
 const link=document.createElement('a');
 link.href=url;
 link.download=`immearth-head-log-${snapshot.savedAt.replace(/[:.]/g,'-')}.json`;
 document.body.append(link);
 link.click();
 link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),10000);
}

export default function HeadDirectionControl({engineRef,onReady,headInfluence=false,onHeadInfluenceChange,onDirection,travelOnRecenter=false,onTravelOnRecenterChange,detectorLoader}){
 const tracking=useHeadDirection({engineRef,enabled:headInfluence,detectorLoader,onReady,onDirection});
 const {state}=tracking;
 const influenceRef=React.useRef(onHeadInfluenceChange);
 influenceRef.current=onHeadInfluenceChange;
 // Save head log appears once the camera has been on in this page, and stays after Stop camera.
 const [cameraUsed,setCameraUsed]=React.useState(false);
 if(state.status==='active'&&!cameraUsed)setCameraUsed(true);
 React.useEffect(()=>{
  influenceRef.current?.(state.status==='active');
 },[state.status]);
 const running=state.status==='active'||state.status==='requesting';
 return <section className="head-direction" aria-label="Head direction" data-head-test={state.status} data-direction={state.direction}>
  <button type="button" className="head-start" onClick={running?()=>tracking.stop():tracking.start} disabled={state.status==='requesting'}>{state.status==='active'?'Stop camera':state.status==='requesting'?'Requesting…':'Enable camera'}</button>
  <button type="button" className="head-start" onClick={()=>tracking.calibrate()} disabled={state.status!=='active'}>Calibrate front</button>
  {cameraUsed&&<button type="button" className="head-start head-log-save" onClick={saveHeadLog}>Save head log</button>}
  {running&&<div className="head-listening-mode"><label htmlFor="head-travel-on-recenter"><input id="head-travel-on-recenter" type="checkbox" checked={travelOnRecenter} onChange={event=>onTravelOnRecenterChange?.(event.target.checked)}/> Return with head movement</label><small>{travelOnRecenter?'Looking forward from a preview moves one region':'Head previews only listen.'}</small></div>}
  {state.error&&<p className="head-direction-error" role="alert">{state.error}</p>}
  <video ref={tracking.videoRef} className="head-video preview-off" muted playsInline aria-hidden="true"/>
 </section>;
}
