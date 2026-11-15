import React from 'react';

export default function Regions({layerId,regions,value,onChange}) {
 return <div className="region-controls">
 <h3>Sample the map’s regional classes</h3>
 <p>Image-relative groups used for bounded inputs only. Pitch and pulse timing never read latitude/longitude.</p>
 <div className="region-grid" role="group" aria-label={`${layerId} regional feature selection`}>
 {Array.from({length:12},(_,i)=>{
  const features=regions?.[i];const selected=value===i;
  return <button key={`region-player-${i}`} aria-label={`Select image region ${i+1}`} aria-pressed={selected} className={selected?'region-cell selected':'region-cell'} onClick={()=>onChange(i)}>
   <span>{String(i+1).padStart(2,'0')}</span><i className={`region-status ${features?.classified_count>0?'filled':''}`} />
   <span className="sr-only">{features?`${features.classified_count} direct palette-matched examples, ${features.unclassified_count} others`:'Partly critical area'}</span>
  </button>
 })}
 </div>
 {value!==undefined && regions[value] && <p className="lower-provenance">Region {value+1}: {regions[value].classified_count} matched; ${regions[value].sample_count || 0} in-group samples; morphology does not sound automatically.</p>}
 </div>;
}
