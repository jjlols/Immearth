import React from 'react';
import useHeadDirection from '../hooks/useHeadDirection.js';
import './HeadDirectionControl.css';

export default function HeadDirectionControl({engineRef,onReady,headInfluence=false,onHeadInfluenceChange,onDirection,detectorLoader}){
 const tracking=useHeadDirection({engineRef,enabled:headInfluence,detectorLoader,onReady,onDirection});
 const {state}=tracking;
 const influenceRef=React.useRef(onHeadInfluenceChange);
 influenceRef.current=onHeadInfluenceChange;
 React.useEffect(()=>{
  influenceRef.current?.(state.status==='active');
 },[state.status]);
 const running=state.status==='active'||state.status==='requesting';
 return <section className="head-direction" aria-label="Head direction" data-head-test={state.status}>
  <button type="button" className="head-start" onClick={running?()=>tracking.stop():tracking.start} disabled={state.status==='requesting'}>{state.status==='active'?'Stop camera':state.status==='requesting'?'Requesting…':'Enable camera'}</button>
  {state.error&&<p className="head-direction-error" role="alert">{state.error}</p>}
  <video ref={tracking.videoRef} className="head-video preview-off" muted playsInline aria-hidden="true"/>
 </section>;
}
