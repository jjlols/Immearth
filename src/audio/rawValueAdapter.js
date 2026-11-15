/** Drop-in future adapter for real scientific inputs; clients still fulfill numeric provenance. */
export function rawMusicalValues({unit,values,source,verified=false}){
 if(!unit||!source||!Array.isArray(values))throw new Error('Raw data requires units, iterable numeric values, and source provenance');
 const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
 if(!sorted.length)return {classified_count:0,status:'silent',source};
 return {classified_count:sorted.length,estimated:!verified,median:sorted[Math.floor(sorted.length/2)],q20:sorted[Math.floor((sorted.length-1)*.2)],q80:sorted[Math.floor((sorted.length-1)*.8)],unit,source,scientific_value_verified:verified};
}
