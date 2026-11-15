/** Canonical presentation settings using the same IDs as map and musical mixers. */
export const LAYER_OPTIONS=Object.freeze([
 {id:'precipitation',label:'Precipitation',short:'Liquid rain / frozen snow',mark:'P',sourceFile:'precipitation.png',color:'#6ccce7'},
 {id:'active_fires',label:'Active fires',short:'VIIRS fire radiative power',mark:'F',sourceFile:'active_fires.png',color:'#e8bd70'},
 {id:'carbon_monoxide',label:'Carbon monoxide',short:'Estimated CO atmospheric model',mark:'CO',sourceFile:'carbon_monoxide.png',color:'#d9a96f'},
 {id:'nitrogen_oxides',label:'Nitrogen oxides',short:'Estimated near-surface NOₓ',mark:'NOₓ',sourceFile:'nitrogen_oxides.png',color:'#a4d8ab'},
 {id:'near_surface_temperature',label:'Temperature',short:'Near-surface temperature T2M',mark:'T',sourceFile:'near_surface_temperature.png',color:'#d5c58a'},
]);
export const METRIC_IDS=LAYER_OPTIONS.map(layer=>layer.id);
export function getLayer(id){return LAYER_OPTIONS.find(option=>option.id===id)|| null;}
export const OPACITY_DEFAULTS={precipitation:.90,active_fires:.98,carbon_monoxide:.40,nitrogen_oxides:.44,near_surface_temperature:.40};
