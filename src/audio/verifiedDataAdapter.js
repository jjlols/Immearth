/** Replace RGB analysis with raw recorded data without replacing remix library.
 * This module alone has source/unit validation; music has no scientific loader.
 */
export function acceptedRawSeries({units,values,provenance}){
 if(!units||!provenance||values===undefined || !(Symbol.iterator in values))throw new Error('Raw adapter needs units, iterable values and explicit provenance');
 const sorted=Array.from(values).filter(Number.isFinite).sort((a,b)=>a-b);
 if(sorted.length===0)return {status:'silent',classified_count:0};
 return {status:'available',classified_count:sorted.length,classified_fraction:1,median:sorted[Math.floor(sorted.length/2)],q20:sorted[Math.floor((sorted.length-1)*.2)],q80:sorted[Math.floor((sorted.length-1)*.8)],sample_count:sorted.length,scientific_data_verified:Boolean(provenance.verified),scientific_unit:units,scientific_provenance:provenance};
}
