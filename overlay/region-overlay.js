import { OverlayController } from './layer-controller.js';
const $=selector=>document.querySelector(selector);const items=new Map();let controller,rovingId;
const node=(tag,className,value='')=>{const el=document.createElement(tag);el.className=className;el.textContent=value;return el;};
function setOpacity(id,opacity){controller.setLayerOpacity(id,opacity);}
function render(state){
  for(const layer of state.layers){
    const item=items.get(layer.id);if(!item)continue;
    const selected=layer.id===state.focusedId;
    item.canvas.style.opacity=layer.visible?(state.onlySelected?(selected?'1':'0'):(selected?'1':layer.opacity)):'0';
    item.canvas.style.zIndex=selected?'100':String(layer.order);
    item.row.classList.toggle('selected',selected);item.button.setAttribute('aria-pressed',String(selected));item.checkbox.checked=layer.visible;item.slider.value=String(layer.opacity);
    item.percent.textContent=selected?'full field':`${Math.round(layer.opacity*100)}% opacity`;
  }
  $('#mode-toggle').checked=state.onlySelected;$('#base-toggle').checked=state.basemapVisible;
  const selected=state.focusedId?controller.layers.get(state.focusedId):null;
  $('#focus-label').textContent=selected?selected.label:'One geographic canvas';
  if(selected){$('#active-disclaimer').textContent=`${selected.description} The complete field has its native source colors above Natural Earth geographic coastlines.`;}
  else{$('#active-disclaimer').textContent='Geography comes from Natural Earth polygons alone. NASA atmospheric fields stay complete—not a remaining sparse top-percentile patch. Adjust opacity or select one to isolate it above the geography.';}
  const main=document.querySelector('.geographic-map');main.classList.toggle('focused',Boolean(selected));
}
function loadRaster(layer,item){
  return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>{item.ctx.drawImage(image,0,0);resolve()};image.onerror=()=>reject(new Error(`${layer.label}: unavailable ${layer.url}`));image.src=layer.url;});
}
function makeControl(layer){
  const frame=node('div','metric-frame');frame.style.setProperty('--layer-color',layer.color);
  const select=node('button','metric-button');select.dataset.layerId=layer.id;select.type='button';select.setAttribute('aria-label',`View ${layer.label}`);select.setAttribute('aria-pressed','false');select.tabIndex=layer.id===rovingId?0:-1;
  const words=node('span','metric-caption');words.append(node('span','metric-label',layer.label),node('span','metric-subtitle',layer.shortLabel));select.append(node('span','metric-mark',layer.mark),words);
  const options=node('div','metric-options');
  const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=layer.visible;checkbox.setAttribute('aria-label',`Include ${layer.label} in composite`);
  const label=document.createElement('label');label.append(checkbox,node('span','','Display'));const slider=document.createElement('input');slider.type='range';slider.min='0';slider.max='1';slider.step='.05';slider.value=String(layer.opacity);slider.setAttribute('aria-label',`${layer.label} opacity`);
  const percent=node('span','opacity-percent','original RGB');options.append(label,slider,percent);frame.append(select,options);$('#layer-list').append(frame);
  const canvas=document.createElement('canvas');canvas.width=layer.width;canvas.height=layer.height;canvas.className='map-layer';canvas.dataset.layerId=layer.id;canvas.setAttribute('aria-hidden','true');canvas.style.zIndex=String(layer.order);$('#map-layers').append(canvas);
  const item={frame,row:frame,button:select,checkbox,slider,percent,canvas,ctx:canvas.getContext('2d')};items.set(layer.id,item);
  select.addEventListener('click',()=>{controller.select(controller.focusedId===layer.id?null:layer.id);rovingId=layer.id;updateTabStops()});
  checkbox.addEventListener('change',()=>{controller.setVisibility(layer.id,checkbox.checked)});
  slider.addEventListener('input',()=>setOpacity(layer.id,slider.value));
  return loadRaster(layer,item);
}
function updateTabStops(){for(const [id,item] of items)item.button.tabIndex=id===rovingId?0:-1;}
function turnError(error){$('#loading').hidden=true;$('#error').textContent=error.message;$('#error').hidden=false;}
async function start(){
  const response=await fetch('markers.json');if(!response.ok)throw new Error(`Sources cannot be loaded (${response.status})`);
  const manifest=await response.json();controller=new OverlayController(manifest);rovingId=manifest.layers[0].id;
  await Promise.all(controller.sortedLayers.map(makeControl));
  controller.addEventListener('change',event=>render(event.detail));render(controller.getState());
  $('#loading').classList.add('is-ready');document.body.dataset.ready='true';
  window.eicOverlay=Object.freeze({getState:()=>controller.getState(),select:id=>controller.select(id),setVisibility:(id,value)=>controller.setVisibility(id,value),setLayerOpacity:(id,value)=>controller.setLayerOpacity(id,value),setOnlySelected:value=>controller.setOnlySelected(value),setBasemapVisible:value=>controller.setBasemapVisible(value),reset:()=>controller.reset()});
}
function center(offset){
  const list=controller.sortedLayers;
  const focusedId=document.activeElement?.dataset.layerId || rovingId;
  rovingId=list[(list.findIndex(layer=>layer.id===focusedId)+offset+list.length)%list.length].id;
  rovingId=rovingId;
  updateTabStops();items.get(rovingId).button.focus();
}
$('#layer-list').addEventListener('keydown',event=>{if(!event.target.matches('.metric-button')||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();if(event.key==='Home'){rovingId=controller.sortedLayers[0].id;updateTabStops();items.get(rovingId).button.focus();}else if(event.key==='End'){rovingId=controller.sortedLayers.at(-1).id;updateTabStops();items.get(rovingId).button.focus();}else center(['ArrowDown','ArrowRight'].includes(event.key)?1:-1);});
$('#base-toggle').addEventListener('change',event=>{const visible=event.target.checked;$('.shared-basemap').style.opacity=visible?'1':'0';controller.setBasemapVisible(visible)});
$('#mode-toggle').addEventListener('change',event=>{controller.setOnlySelected(event.target.checked)});$('#reset-all').addEventListener('click',()=>controller.reset());document.addEventListener('keydown',event=>{if(event.key==='Escape'&&controller){controller.select(null);rovingId=controller.sortedLayers[0].id;updateTabStops()}});
start().catch(turnError);
