"""Create a true Natural Earth geographic base and intact NASA scientific field layers.

No top-percentile/quantile quantification or generic brightness threshold is applied
to the CO, NOx, or temperature fields. Opacity is performed in the client uniformly;
RGB data remains complete. Native rain alpha and NASA float fire intensity are provided.
"""
from __future__ import annotations
import argparse,json,shutil
from pathlib import Path
import cv2
import numpy as np
import requests
from PIL import Image,ImageDraw

ROOT=Path(__file__).resolve().parent


def fetch_asset(url: str, target: Path) -> Path:
    path=Path(target);path.parent.mkdir(parents=True,exist_ok=True)
    with requests.get(url,timeout=60) as response:
        response.raise_for_status();raw=response.content
    if target.suffix=='.geojson':
        decoded=json.loads(raw);assert decoded.get('type')=='FeatureCollection','Expected natural earth geometry';path.write_bytes(raw)
    elif target.suffix=='.exr':
        temporary=path.with_suffix('.exr.download');temporary.write_bytes(raw)
        assert cv2.imread(str(temporary),cv2.IMREAD_UNCHANGED) is not None,'EXR corrupt';temporary.replace(target)
    else:
        import io
        with Image.open(io.BytesIO(raw)) as image:
            image.load();image.save(path)
    return path


def draw_geography(geojson:dict,width:int,height:int,options:dict)->Image.Image:
    """No climate data here: only public-domain geometry and geographic/grid lines."""
    def coordinates(ring):return [((x+180)*width/360,(90-y)*height/180) for x,y in ring]
    result=Image.new('RGBA',(width,height),tuple(options['ocean']));draw=ImageDraw.Draw(result)
    for feature in geojson.get('features',[]):
        g=feature.get('geometry',{})
        if g.get('type')=='Polygon': polygons=[g['coordinates']]
        elif g.get('type')=='MultiPolygon': polygons=g['coordinates']
        else:continue
        for polygon in polygons:
            for i,ring in enumerate(polygon):
                pts=coordinates(ring)
                if not i:draw.polygon(pts,fill=tuple(options['land']))
                else:draw.polygon(pts,fill=tuple(options['ocean']))
                draw.line(pts,fill=tuple(options['coastline']),width=1)
    for lon in range(0,360,60):
        x=lon*width/360;draw.line([(x,0),(x,height)],fill=(123,171,163,45),width=1)
    for lat in range(0,180,30):
        y=lat*height/180;draw.line([(0,y),(width,y)],fill=(123,171,163,45),width=1)
    return result


def decode_fire(source:Path,color_source:Path)->Image.Image:
    data=cv2.imread(str(source),cv2.IMREAD_UNCHANGED)
    if data is None or data.ndim!=3 or data.shape[2]!=4:raise RuntimeError('Missing/corrupt NASA fire raster')
    colors=np.asarray(Image.open(color_source).convert('RGBA'))
    if colors.shape[:2]!=data.shape[:2]:raise RuntimeError('Changed NASA fire resolution without geometry review')
    baseline=float(data[data.shape[0]//2,data.shape[1]//2,0])
    signal=np.maximum(np.max(data[:,:,:3],axis=2)-baseline,0)
    support=(colors[:,:,0]>colors[:,:,2]+25)&(colors[:,:,0]>140)
    # No blue ocean; retain actual dots present in reliable same-variable current asset.
    alpha=np.where((signal>0.0018)&support,245,0).astype(np.uint8)
    # Add per-source footprint so ground-res fire/cells don't alias to zero at browser scale.
    fire=Image.fromarray(np.dstack((colors[:,:,:3],alpha)),'RGBA')
    return fire


def prepare_marker_layers(config:dict,output:Path,force:bool=False,inputs:Path|None=None)->dict:
    del force
    output = Path(output).resolve()
    # Downloaded build inputs (Natural Earth land, NASA's transparent rain PNG) are kept
    # in overlay/inputs, never in the served site; only finished layers go to output.
    inputs = Path(inputs) if inputs is not None else ROOT/'overlay'/'inputs'
    if output in (ROOT,(ROOT/'overlay').resolve(),(ROOT/'data').resolve()) or not output.is_relative_to(ROOT):raise RuntimeError('Output must stay in owned subdirectory')
    # Preview artifact must not retain removed peak-mask raster variants.
    for asset in output.glob('*_full.png'):
        asset.unlink()
    for source in output.glob('*-source.png'):
        source.unlink()
    output.mkdir(parents=True,exist_ok=True)
    geojson=fetch_asset(config['basemap']['url'],inputs/'natural-earth-land.geojson')
    w,h=config['basemap']['size'];draw_geography(json.loads(geojson.read_text()),w,h,config['basemap']).save(output/'basemap.png')
    manifest={'version':4,'basemap':{'url':'assets/basemap.png','width':w,'height':h,'source':config['basemap']['credit'],'license':config['basemap']['license']},'projection':config['projection'],'limitations':['Flat 2:1 source field aspect ratios are used for display; common longitude extent does not imply a verified identical geotransform.','Different scientific variables, palettes, spatial coverage and acquisition times cannot be merged numerically here. The map is exploratory composition.','Intact CO/NOx/temperature source fields retain their colors and pixel scope; uniform user-selectable opacity does not drop scientific subregions.'], 'layers':[]}
    for layer in config['layers']:
        identity=layer['id'];kind=layer['type']
        if kind=='complete_field':
            with Image.open(ROOT/layer['source']) as source:
                source.load(); field=source.convert('RGBA');field.load()
            method='complete scientific RGB; no quantile or spatial clipping'
        elif kind=='transparent_png':
            with Image.open(fetch_asset(layer['url'],inputs/f'{identity}-source.png')) as source:
                source.load()
                if 'A' not in source.getbands():raise RuntimeError('NASA alpha required')
                field=source.convert('RGBA');field.load()
            method='official current NASA alpha'
        elif kind=='exr_fire':
            raw=fetch_asset(layer['url'],output/'latest-fires.exr')
            color=fetch_asset(layer['colormap_url'],output/'sources-approved-active-fire-color.png')
            field=decode_fire(raw,color);method='NASA float EXR positive above ocean background, source preview exact RGB'
        else:raise ValueError(f'Unsupported source kind {kind}')
        field.save(output/f'{identity}.png',optimize=True)
        manifest['layers'].append({**layer,'url':f'assets/{identity}.png','width':field.width,'height':field.height,'extraction_method':method,'analysis':{'quantile_mask_applied':False,'global_field_pixels_preserved':kind!='exr_fire'}})
    return manifest


def main()->int:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config',type=Path,default=ROOT/'overlay/sources.json')
    parser.add_argument('--output',type=Path,default=ROOT/'overlay-site')
    args=parser.parse_args();manifest=prepare_marker_layers(json.loads(args.config.read_text()),args.output/'assets')
    ui=json.loads((ROOT/'overlay/layers.json').read_text())['layers']
    for layer in manifest['layers']:
        style=next(l for l in ui if l['id']==layer['id'])
        layer.update({key:style[key] for key in ('label','shortLabel','mark','color','description','order')})
        layer['visible']=layer['defaultSelected']
    for file in ('index.html','overlay.css','region-overlay.js','layer-controller.js'):
        shutil.copyfile(ROOT/'overlay'/file,args.output/file)
    (args.output/'markers.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print('Geographic base: Natural Earth only. Intact all-layer color rasters. Old quantitative masks are disabled.')
    return 0


if __name__=='__main__':raise SystemExit(main())
