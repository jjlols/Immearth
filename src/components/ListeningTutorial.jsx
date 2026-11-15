import React, { useEffect, useRef, useState } from 'react';

const STORAGE = 'jukebox_welcome_dismissed';

/** Introduces regional exploration without starting audio or requesting location. */
export default function ListeningTutorial() {
 const modal=useRef(null);
 const [open,setOpen]=useState(()=>{try{return localStorage.getItem(STORAGE)!=='yes';}catch{return true;}});
 useEffect(()=>{if(open&&!modal.current.open)modal.current.showModal();if(!open&&modal.current.open)modal.current.close();},[open]);
 function dismiss(){try{localStorage.setItem(STORAGE,'yes');}catch{/* preference storage is optional */}setOpen(false);}
 return <>
 <nav className="map-help-nav" aria-label="Listening map help"><a href="#map-navigation">Map navigation</a><button type="button" aria-haspopup="dialog" onClick={()=>setOpen(true)}>How to use this map</button></nav>
 <dialog className="listening-tutorial" role="dialog" ref={modal} aria-labelledby="welcome-the-map" aria-modal="true" aria-describedby="welcome-explainer" onCancel={e=>{e.preventDefault();dismiss();}}>
   <p className="eyebrow">First visit</p><h2 id="welcome-the-map">Explore the listening map</h2>
   <p id="welcome-explainer">Choose a metric, explore one of 12 image regions and press Play remix when ready. Nothing starts automatically.</p>
   <ol><li><strong>Play later.</strong> Press Play remix to begin the actual recording. Pause, Reset and Mute remain available.</li><li><strong>Move across regions.</strong> Use W/A/S/D or arrow keys while the page background is focused; alternatively choose a region button. Home returns to region 1.</li><li><strong>Compose.</strong> Choose Solo / Explore for one selected metric, or Composition for all visible eligible fields.</li></ol>
   <p>Hidden maps don't sound. Colors guide estimated value labels rather than calibrated measurements. Vancouver is reserved for future spatial listening, not a live head tracker.</p>
   <div className="panel-row"><button className="button button-primary" type="button" onClick={dismiss}>Start exploring</button><button className="button button-quiet" type="button" onClick={dismiss}>Close tutorial</button></div>
 </dialog>
 </>;
}
