"""Palette lookup for music (analysis only). Nearest valid palette, not brightness science.

Use the local output records in color_scales/output. Every value derived from a
map image remains approximate; a raw measurement adapter must replace this source
when proper geospatial data is acquired. This module never creates audio.
"""
from pathlib import Path
import json,math

ROOT=Path(__file__).resolve().parents[1]
IDS=('precipitation','active_fires','carbon_monoxide','nitrogen_oxides','near_surface_temperature')


def read_palette(category):
    if category not in IDS:
        raise ValueError('Unknown category')
    record=json.loads((ROOT/'color_scales/output'/category/'scale.json').read_text())
    if not str(record.get('status','')).startswith('extracted'):
        raise ValueError('Source did not succeed palette extraction')
    return record


def linear(pixel,lo,hi,p0,p1,log=False):
    if p1<=p0:raise ValueError('Invalid palette tick spacing')
    t=max(0.,min(1.,(pixel-p0)/(p1-p0)))
    if log:return 10.**(math.log10(lo)+t*(math.log10(hi)-math.log10(lo)))
    return lo+t*(hi-lo)


def build_library(category,record=None):
    record=record or read_palette(category)
    if category=='precipitation':
        entries=[]
        for color in record['sampled_rgb_colors']:
            legend=color.get('legend')
            if legend not in ('liquid','frozen'):continue
            label=color['category']
            if label.startswith('between '):
                left,right=label.split()[1],label.split()[3];low,high=float(left),float(right)
                class_value=(low+high)/2
            elif label.startswith('below '):
                low,high,class_value=0.,.1,.05
            elif label.startswith('overflow '):
                low,high,class_value=20.,None,50.
            else:
                raise ValueError('Unknown rain class')
            entries.append({'rgb':tuple(color['rgb']),'value':class_value,'interval':{'lower':low,'upper':high},'legend':legend,'label':label})
        return entries
    if not record['numeric_interpolation_supported']:
        return []
    ticks=sorted(record['tick_labels'], key=lambda tick:float(tick['pixel_position']))
    spans=[(float(first['pixel_position']),float(second['pixel_position']),float(first['value']),float(second['value'])) for first,second in zip(ticks,ticks[1:])]
    output=[]
    palette=record['sampled_rgb_colors']
    for index,color in enumerate(palette):
        position=color.get('pixel_position',span_position_default(span=spans, index=index,count=len(palette)))
        if index==0 and ticks[0].get('qualitative_extension')=='low':position=spans[0][0]
        if index==len(palette)-1 and ticks[-1].get('qualitative_extension')=='high':position=spans[-1][1]
        choices=[candidate for candidate in spans if candidate[0]<=position<=candidate[1]]
        if not choices:raise ValueError('Color sample is not within the labeled tick extent')
        pixel0,pixel1,low,high=choices[0]
        value=linear(position,low,high,pixel0,pixel1,record.get('scale_type')=='logarithmic')
        output.append({'rgb':tuple(color['rgb']),'value':value,'legend':'continuous','label':f'about {value:g}','interval':{'lower':low,'upper':high}})
    return output


def span_position_default(span,index,count):
    return span[0][0]+index*(span[-1][1]-span[0][0])/max(1,count-1)


def rgb_distance(rgb,other):
    if len(rgb)!=3:return float('inf')
    r,g,b=(int(a)-int(b) for a,b in zip(rgb,other))
    return math.sqrt(.3*r*r+.59*g*g+.11*b*b)


def nearest_palette(category,rgb,alpha=255,tolerance=62,record=None):
    if alpha<25:return {'status':'no_data'}
    library=build_library(category,record)
    if not library:return {'status':'no_data'}
    rgb=tuple(rgb)
    match=min(library,key=lambda entry:rgb_distance(rgb,entry['rgb']))
    distance=rgb_distance(rgb,match['rgb'])
    if distance>tolerance:return {'status':'unclassified_color'}
    if max(rgb)-min(rgb)<15 and distance>10:return {'status':'unclassified_neutral'}
    return {'status':'matched','category':category,'value':match['value'],'interval':match['interval'],'legend':match['legend'],'label':match['label'],'color_distance':distance,'estimate_method':'nearest_palette_color_estimated_reviewed_labels'}


def summarize(results):
    accepted=[r for r in results if r['status']=='matched']
    summary={'classified_count':len(accepted),'sample_count':len(results),'unclassified_count':len(results)-len(accepted),'no_data_count':len(results)-len(accepted),'estimated':True}
    if not accepted:return {'status':'silent',**summary}
    kind=accepted[0]['legend']
    if kind in ('liquid','frozen'):
        summary.update(rain_count=sum(v['legend']=='liquid' for v in accepted),snow_count=sum(v['legend']=='frozen' for v in accepted),max_value=max(v['value'] for v in accepted))
        return summary
    values=sorted(v['value'] for v in accepted)
    summary.update(median=values[len(values)//2],q20=values[int((len(values)-1)*.2)],q80=values[int((len(values)-1)*.8)],max_value=values[-1])
    return summary


class RawDataAdapter:
    """A truthful placeholder for an eventual adapter that receives verified raw values."""
    def __init__(self, records):
        self.records=records
    def features(self, layer_id):
        from collections.abc import Mapping,Sequence
        records=self.records.get(layer_id)
        if not isinstance(records,Mapping):
            raise KeyError(layer_id)
        if not records.get('unit') or not records.get('values') or not isinstance(records['values'],Sequence):
            raise ValueError('Raw features require values, units and explicit provenance.')
        return {'source':records,'kind':'caller_supplied_data_frame','validated_input':bool(records.get('scientific_input_verified',False))}
