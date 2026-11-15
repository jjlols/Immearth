import React, {useId,useState} from 'react';
import {VANCOUVER,headspaceListeningFrame} from '../lib/spatialOrigin.js';

export default function SpatialOriginMarker(){
 const [expanded,setExpanded]=useState(false);
 const coordinates={left:`${((VANCOUVER.longitude+180)/360)*100}%`,top:`${((90-VANCOUVER.latitude)/180)*100}%`};
 const id=useId();
 const space=headspaceListeningFrame();
 return <div className="spatial-origin" data-spatial-origin="vancouver_bc_canada" style={coordinates}>
 <button className="origin-target" aria-label="Show future spatial audio origin, Vancouver, BC" aria-expanded={expanded} aria-controls={id} type="button" onClick={()=>setExpanded(!expanded)}>
 <span className="origin-mark" aria-hidden="true"><span className="range-ring"/><span className="crosshair"/></span><span className="origin-name" aria-hidden="true">Vancouver, BC</span>
 </button>
 {expanded&&<div className="origin-description" id={id} role="note">
 <div className="beacon-label">FUTURE LISTENING REFERENCE</div>
 <h3>{VANCOUVER.label}</h3>
 <p><strong>{VANCOUVER.latitude.toFixed(4)}° N, {Math.abs(VANCOUVER.longitude).toFixed(4)}° W</strong></p>
 <p>Decimal WGS84 geographic coordinates (EPSG:4326). Destination source center if and when physical listening model is available.</p>
 <p className="head-reserved">Reserved future headspace ({space.origin.x}, {space.origin.y}, {space.origin.z}) at Vancouver. Sound sourced exactly at the listener can sound “inside the listener’s head” using a modeled, proper spatial-audio projection. This is artwork-tech diagram now, not actual output panning or invention of a listening receiver.</p>
 <p className="origin-caveat">No musical playback is initiated by clicking this latitude-longitude token. Current maps are normalized flat displays without fully shared NASA geotransforms, so automatic geo-panning cannot honestly be derived from field appearance. A future audio adapter requires verified projection+source locations, human-relative HRTF, distance/attenuation policy, and independent scientific data ownership beyond this CSS symbol.</p>
 </div>}
 </div>;
}
