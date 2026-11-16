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
        return precipitation_library(record)
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


def precipitation_library(record):
    """One entry per distinct liquid/frozen color, from the legends' recorded bounds.

    Each NASA tick marks the left edge of its block, so block i is bins[i]..bins[i+1]
    and only the arrow is overflow (lower 50, no upper bound). A bounded class is
    stored at its interval midpoint; an unbounded one at its lower bound, never an
    invented highest value. Where NASA draws two classes in one RGB (the frozen
    20-50 block and its overflow arrow) the pixel cannot tell them apart, so they
    merge into one class: at least 20 mm/hour, no upper bound.
    """
    entries=[]
    for legend in record['legends']:
        kind=legend['name']
        if kind not in ('liquid','frozen'):continue
        by_rgb={}
        for category in legend['categories']:
            by_rgb.setdefault(tuple(category['rgb']),[]).append(category)
        for rgb,group in by_rgb.items():
            lowers=[c['lower_bound'] for c in group];uppers=[c['upper_bound'] for c in group]
            if any(value is None for value in lowers):raise ValueError('Rain class without a recorded lower bound')
            low=float(min(lowers))
            high=None if any(value is None for value in uppers) else float(max(uppers))
            value=low if high is None else (low+high)/2
            if len(group)==1:
                label=group[0]['description']
            else:
                label=f'at or above {low:g} mm/hour (NASA draws '+' and '.join(c['description'] for c in group)+' in one color)'
            entries.append({'rgb':rgb,'value':value,'interval':{'lower':low,'upper':high},'legend':kind,'label':label})
    if not entries:raise ValueError('No liquid or frozen rain classes recorded')
    return entries


def span_position_default(span,index,count):
    return span[0][0]+index*(span[-1][1]-span[0][0])/max(1,count-1)


def rgb_distance(rgb,other):
    if len(rgb)!=3:return float('inf')
    r,g,b=(int(a)-int(b) for a,b in zip(rgb,other))
    return math.sqrt(.3*r*r+.59*g*g+.11*b*b)


def nearest_palette(category,rgb,alpha=255,tolerance=62,record=None,library=None):
    if alpha<25:return {'status':'no_data'}
    if library is None:
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
    summary={'classified_count':len(accepted),'sample_count':len(results),'unclassified_count':sum(result['status'].startswith('unclassified_') for result in results),'no_data_count':sum(result['status']=='no_data' for result in results),'estimated':True}
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

from functools import lru_cache
import numpy as np


@lru_cache(maxsize=5)
def palette_arrays(category):
    entries = build_library(category)
    return (entries, np.asarray([entry['rgb'] for entry in entries], dtype=np.float64),
            np.asarray([entry['value'] for entry in entries], dtype=np.float64))


def nearest_pixels(category, rgba):
    """Per-pixel nearest-palette classification; vectorized over real raster colors."""
    shape = np.asarray(rgba).shape
    flat = np.asarray(rgba, dtype=np.float64).reshape((-1, 4))
    entries, colors, values = palette_arrays(category)
    no_data = flat[:, 3] < 25
    matched = np.zeros(len(flat), bool)
    unclassified = np.zeros(len(flat), bool)
    nearest = np.zeros(len(flat), dtype=np.int64)
    distances = np.zeros(len(flat), dtype=np.float64)
    neutral = np.ptp(flat[:, :3], axis=1) < 15
    for start in range(0, len(flat), 32768):
        stop = min(start + 32768, len(flat))
        active = np.flatnonzero(flat[start:stop, 3] >= 25) + start
        if not active.size:
            continue
        rgb = flat[active, :3]
        squared = .3 * (rgb[:, 0, None] - colors[None, :, 0]) ** 2 + \
            .59 * (rgb[:, 1, None] - colors[None, :, 1]) ** 2 + \
            .11 * (rgb[:, 2, None] - colors[None, :, 2]) ** 2
        indices = squared.argmin(axis=1)
        minimum = np.sqrt(squared[np.arange(len(rgb)), indices])
        accepted = (minimum <= 62) & (~neutral[active] | (minimum <= 10))
        matched[active[accepted]] = True
        unclassified[active[~accepted]] = True
        nearest[active] = indices
        distances[active] = minimum
    return {'matched': matched, 'unclassified': unclassified,
            'no_data': no_data, 'values': values,
            'library': entries, 'neutral': neutral,
            'distances': distances, 'indices': nearest, 'shape': shape}


def region_features(category, rgba):
    """Return summaries, not hundreds of thousands of per-pixel JSON records."""
    data = nearest_pixels(category, rgba)
    accepted = data['matched']
    entries = data['library']
    count = int(accepted.sum())
    summary = {'classified_count': count, 'sample_count': int(accepted.size),
               'unclassified_count': int(data['unclassified'].sum()),
               'no_data_count': int(data['no_data'].sum()), 'estimated': True}
    if not count:
        return {'status': 'silent', **summary}
    matched_indices = data['indices'][accepted]
    kinds = tuple(entry['legend'] for entry in entries)
    if 'liquid' in kinds or 'frozen' in kinds:
        # Overflow classes have no upper bound: count them apart and give them no value, so
        # one overflow pixel never decides the music of a region full of bounded rain.
        bounded = [entry['interval']['upper'] is not None for entry in entries]
        liquid = [index for index, entry in enumerate(entries) if entry['legend'] == 'liquid' and bounded[index]]
        frozen = [index for index, entry in enumerate(entries) if entry['legend'] == 'frozen' and bounded[index]]
        overflow = [index for index, ok in enumerate(bounded) if not ok]
        summary['rain_count'] = int(np.isin(matched_indices, liquid).sum())
        summary['snow_count'] = int(np.isin(matched_indices, frozen).sum())
        summary['overflow_count'] = int(np.isin(matched_indices, overflow).sum())
        bounded_values = data['values'][matched_indices[np.isin(matched_indices, liquid + frozen)]]
        if bounded_values.size:
            summary['max_value'] = float(bounded_values.max())
        return summary
    values = np.sort(data['values'][matched_indices])
    summary['median'] = float(values[len(values) // 2])
    summary['q20'] = float(values[int((len(values) - 1) * .2)])
    summary['q80'] = float(values[int((len(values) - 1) * .8)])
    summary['max_value'] = float(values[-1])
    return summary


def pixel_records(category, rgba):
    """Small diagnostic adapter retaining the original per-pixel vocabulary."""
    data = nearest_pixels(category, rgba)
    result = []
    for index in range(len(data['matched'])):
        if data['no_data'][index]:
            result.append({'status': 'no_data'})
        elif data['unclassified'][index]:
            distance = data['distances'][index]
            result.append({'status': 'unclassified_color' if distance > 62 else 'unclassified_neutral'})
        else:
            result.append({'status': 'matched', 'category': category,
                           **data['library'][data['indices'][index]],
                           'color_distance': float(data['distances'][index]),
                           'estimate_method': 'nearest_palette_color_estimated_reviewed_labels'})
    return result
