"""Estimate bounded regional features for the React audio layer from actual source images.

Rows/columns describe image-relative samples only. Source geography or latitude
cannot ever directly determine this preprocessing's frequency or playback clock.
"""
from __future__ import annotations
import argparse,json
from pathlib import Path
from PIL import Image
from .palette_library import nearest_palette,summarize,read_palette,IDS

ROOT=Path(__file__).resolve().parents[1]


def analyze(category,source:Path,grid=(3,4)):
    with Image.open(source) as image:
        image.load()
        pixels=image.convert('RGBA').resize((80,48),Image.Resampling.BILINEAR)
    rows,columns=grid
    original_timestamps=read_palette(category)
    batches=[]
    for row in range(rows):
        for column in range(columns):
            decoded=[]
            for y in range(row*pixels.height//rows,(row+1)*pixels.height//rows):
                for x in range(column*pixels.width//columns,(column+1)*pixels.width//columns):
                    r,g,b,a=pixels.getpixel((x,y))
                    decoded.append(nearest_palette(category,(r,g,b),a))
            source_record=read_palette(category)
            batches.append({
                **summarize(decoded),
                'region':{
                    'id':f'{category}-region-{row}-{column}',
                    'row':row,'column':column,
                    'bounds_relative':[column/columns,row/rows,(column+1)/columns,(row+1)/rows],
                    'width':image.width,'height':image.height,
                },
                'source':{'url':source_record['source_url'],'asset_url':source_record.get('source_asset_url'),'scale_extraction_time':original_timestamps.get('extraction_timestamp'),'ticks_status':source_record.get('verification_status')},
            })
    # The current fire PNG distributes dots largely into a few regions. Avoid silently dropping silent regions IDs the UI relies on.
    return batches


def build_assets(image_dir=ROOT/'data/images'):
    return {'schema_version':1,'categories':{category:analyze(category,image_dir/f'{category}.png') for category in IDS},'caption':'nearest palette interpreted voxel estimates only ─ never a backend'}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--image-dir',type=Path,default=ROOT/'data/images')
    parser.add_argument('--output',type=Path,default=ROOT/'overlay-site/scales/features.json')
    args=parser.parse_args()
    directory=args.output.parent
    directory.mkdir(exist_ok=True,parents=True)
    args.output.write_text(json.dumps(build_assets(args.image_dir),indent=2) + '\n')
    print(f'Wrote estimated regional inputs to {args.output}')


if __name__=='__main__':
    main()
