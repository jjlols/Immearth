/** Addressable composite layer state. Raw NASA rasters are not reproduced/modified. */
export class OverlayController extends EventTarget {
  constructor(manifest) {
    super(); this.layers=new Map(manifest.layers.map(l=>[l.id,{...l}]));
    this.focusedId=null;this.basemapVisible=true;this.onlySelected=false;
    this.basemap=manifest.basemap;this.projection=manifest.projection;this.limitations=manifest.limitations;
  }
  get sortedLayers(){return [...this.layers.values()].sort((a,b)=>a.order-b.order)}
  get visibleLayers(){return this.sortedLayers.filter(l=>l.visible)}
  getState(){return {layers:this.sortedLayers,focusedId:this.focusedId,basemapVisible:this.basemapVisible,onlySelected:this.onlySelected,basemap:this.basemap,projection:this.projection,limitations:this.limitations}}
  changed(){this.dispatchEvent(new CustomEvent('change',{detail:this.getState()}))}
  select(id){if(id!==null){if(!this.layers.has(id))throw new Error('Unknown source field');this.layers.get(id).visible=true}this.focusedId=id;this.changed()}
  setVisibility(id,visible){const layer=this.layers.get(id);if(!layer)throw new Error('Unknown source field');layer.visible=Boolean(visible);if(!visible&&this.focusedId===id){this.focusedId=null;this.onlySelected=false}this.changed()}
  setLayerOpacity(id,value){const layer=this.layers.get(id);if(!layer)throw new Error('Unknown source field');layer.opacity=Math.min(1,Math.max(0,Number(value)));this.changed()}
  setOnlySelected(value){this.onlySelected=Boolean(value);if(this.onlySelected && !this.focusedId)this.focusedId=this.sortedLayers.find(l=>l.visible)?.id || this.sortedLayers[0].id;this.changed()}
  setBasemapVisible(value){this.basemapVisible=Boolean(value);this.changed()}
  reset(){for(const layer of this.layers.values()){layer.visible=layer.defaultSelected;layer.opacity=layer.defaultOpacity}this.focusedId=null;this.basemapVisible=true;this.onlySelected=false;this.changed()}
}
