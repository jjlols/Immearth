import React from 'react';
import useHeadDirection from '../hooks/useHeadDirection.js';
import './HeadDirectionControl.css';

export default function HeadDirectionControl({engineRef,onReady,headInfluence=false,onHeadInfluenceChange,onDirection,travelOnRecenter=false,onTravelOnRecenterChange,detectorLoader}){
 const tracking=useHeadDirection({engineRef,enabled:headInfluence,detectorLoader,onReady,onDirection});
 const {state}=tracking;
 const influenceRef=React.useRef(onHeadInfluenceChange);
 influenceRef.current=onHeadInfluenceChange;
 React.useEffect(()=>{
  influenceRef.current?.(state.status==='active');
 },[state.status]);
 const running=state.status==='active'||state.status==='requesting';
 return <section className="head-direction" aria-label="Look around with the camera" data-head-test={state.status} data-direction={state.direction}>
  <button type="button" className="head-start" onClick={running?()=>tracking.stop():tracking.start} disabled={state.status==='requesting'}>{state.status==='active'?'Stop camera':state.status==='requesting'?'Requesting…':'Enable camera'}</button>
  <button type="button" className="head-start" onClick={()=>tracking.calibrate()} disabled={state.status!=='active'}>Calibrate front</button>
  {running&&<div className="head-listening-mode"><label htmlFor="head-travel-on-recenter"><input id="head-travel-on-recenter" type="checkbox" checked={travelOnRecenter} onChange={event=>onTravelOnRecenterChange?.(event.target.checked)}/> Return with head movement</label><small>{travelOnRecenter?'Looking forward from a preview moves one region':'Head previews only listen.'}</small></div>}
  {state.error&&<p className="head-direction-error" role="alert">{state.error}</p>}
  <video ref={tracking.videoRef} className="head-video preview-off" muted playsInline aria-hidden="true"/>
 </section>;
}
