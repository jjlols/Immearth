/** Map estimator regions to one small musical state. This is NOT a raw NASA lookup. */
export const AUDIO_BPM=69;
export const TRACK=Object.freeze({title:'Deliberate Thought',artist:'Kevin MacLeod',licenseUrl:'https://creativecommons.org/licenses/by/4.0/'});
export const SCALE_NOTES=[0,2,3,5,7,9,10];
export const clamp=(x,min=0,max=1)=>Number.isFinite(x)?Math.min(max,Math.max(min,x)):min;
export const median=f=>Number.isFinite(f?.median)?f.median:NaN;
export const logRank=(x,min=.001,max=10)=>Number.isFinite(x)&&x>0?clamp((Math.log10(x)-Math.log10(min))/(Math.log10(max)-Math.log10(min))):0;
export const frequency=midi=>440*2**((midi-69)/12);
export function pitchNOx(x){const degree=Math.round(logRank(x)*9);return frequency(62+SCALE_NOTES[degree%7]+ Math.floor(degree/7)*12);}
export function coTier(x){if(x<100)return 0;if(x<130)return 1; if(x<200)return 2;if(x<500)return 3;return 4;}
export function temperatureTier(x){return x<0?0:x<20?1:2;}
export function featureModel(id,f){
 if(!f||f.classified_count<=0||f.status==='silent')return {id, silent:true,classified_count:0};
 if(id==='precipitation'){
   const rain=f.rain_count||0, snow=f.snow_count||0;
   if(rain+snow===0)return {id,silent:true,classified_count:f.classified_count};
   const highest=f.max_value||.05;
   return {id,kind:'drops',rain,snow,frozen:snow>rain,density:clamp(Math.floor(1+Math.log10(highest+.1)*3),1,5),strength:clamp(highest/50),classified_count:f.classified_count};
 }
 if(id==='active_fires')return {id,kind:'mallets',power:clamp(median(f)/8),classified_count:f.classified_count};
 if(id==='carbon_monoxide'){
   const v=median(f);return {id,kind:'pad',rank:clamp((v-40)/460),tier:coTier(v),classified_count:f.classified_count};
 }
 if(id==='nitrogen_oxides'){
   const v=median(f);
   return {id,kind:'arpeggio',rank:logRank(v),frequency:pitchNOx(v),pitches:Array.from({length:8},(_,i)=>Math.min(1700,i%2?frequency(74)*1.2:pitchNOx(v))),classified_count:f.classified_count};
 }
 if(id==='near_surface_temperature'){
   const v=median(f);return {id,kind:'texture',rank:clamp((v+40)/80),tier:temperatureTier(v),classified_count:f.classified_count};
 }
 throw new Error('Unrecognized metric');
}
export const INSTRUMENT_INFO=Object.freeze({
  precipitation:{kind:'Water and snowfall drops',explanation:'The rain and frozen palettes separately select what becomes rounded melodic water-droplet voices. Higher-rate bins bring a denser, slightly stronger rhythm, not any visual brightness.',caveat:'Discrete rainfall colors are estimated boundary groups; rain and snow never merge into one quantity. Gray, unassigned swatches and unknown pixels become silence.'},
  active_fires:{kind:'Wooden and metallic accents',explanation:'Sparse mallet accents reflect estimated FRP strength, not counts of fires or event rate. Stronger estimated labels make accents sound a little brighter rather than a continuously ringing alarm.',caveat:'Estimated 0,2,4,6,8 MW FRP anchor-label interpolation. Unclassified extensions are unmapped.'},
  carbon_monoxide:{kind:'Warm sustained pad',explanation:'The persistent estimated CO field colors select volume and spectral character for a gentle mix branch shared across the selected recording.',caveat:'CO has nonuniform 40,100,130,200,500 anchors. Global changes glide gradually; no literal chemical sound.'},
  nitrogen_oxides:{kind:'Log-register glass arpeggio',explanation:'The arpeggio follows log₁₀-scaled estimated NOₓ, raising its register as the estimate rises. There is no mapping from colors/latitude to physical pollution or a perceived latitude of pitch.',caveat:'Estimate labels 0.001–10 ppbv are logarithmic; musical register is a separate concept from physical concentration or location.'},
  near_surface_temperature:{kind:'Low harmonic texture',explanation:'Near-surface temperature influences the underlying track’s slow harmonic color. Warmer estimated layers support warmer texture; colder fields are low and open without simple heat-to-volume mapping.',caveat:'−40…+40°C labels retain both 2m and 3m legend-caption disagreement noted by the extraction.'},
});
export function describeFeature(id,f){
 const format=(v)=>Number.isFinite(v)?Math.abs(v)<.01?Number(v.toFixed(4)):Math.round(v*10)/10:'unavailable';
 if(!f||f.classified_count<=0||f.status==='silent')return 'No confident nearest-palette colors or no data. Staying silent is the correct sonification.';
 if(id==='carbon_monoxide')return `Estimated CO palette range: ${format(f.q20)}–${format(f.q80)} ppbv (nonuniform anchors).`;
 if(id==='nitrogen_oxides')return `Estimated NOₓ spread: ${format(f.q20)}–${format(f.q80)} ppbv (log₁₀ converted for register).`;
 if(id==='near_surface_temperature')return `Estimated near-surface palette range: ${format(f.q20)}–${format(f.q80)} °C (T2M; caption conflict 3m / detailed 2m).`;
 if(id==='active_fires')return `Estimated FRP accent field (0–8 MW; not a number of fire incidents).`;
 if(id==='precipitation')return `Rain classes: ${f.rain_count||0}; frozen classes: ${f.snow_count||0}. Gray/no-data/overflow-boundary semantics stay separate.`;
 return `Estimated colored-region characteristics; raw RGB is never a proxy for physical value.`;
}
