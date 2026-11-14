import importlib.util
import json
from pathlib import Path
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('geo_builder',ROOT/'build_geographic_overlays.py')
geo=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(geo)


def test_background_is_geographic_geometry_not_a_metric_visualization():
    config=json.loads((ROOT/'overlay/sources.json').read_text())
    polygon={'type':'FeatureCollection','features':[{'type':'Feature','geometry':{'type':'Polygon','coordinates':[[[-10,-10],[10,-10],[10,10],[-10],[-10,-10]]]}}]}
    # A valid boundary; distinct composed field never is gray humidity.
    polygon['features'][0]['geometry']['coordinates']=[[[-10,-10],[10,-10],[10,10],[-10,-10]]]
    result=geo.draw_geography(polygon,200,100,config['basemap'])
    valid={tuple(config['basemap'][key]) for key in ('land','coastline','ocean')}|{(123,171,163,45)}
    normalized=result.get_flattened_data() if hasattr(result,"get_flattened_data") else result.getdata()
    assert set(normalized) <= valid
    assert (0,0,0,0) not in set(normalized)


def test_complete_geos_source_rgb_and_opaque_field_is_kept():
    catalog=json.loads((ROOT/'overlay/sources.json').read_text())['layers']
    for layer in catalog:
        if layer['type']!='complete_field':continue
        with Image.open(ROOT/layer['source']) as expected:expected.load()
        with Image.open(ROOT/'overlay-site/assets'/f"{layer['id']}.png") as actual:actual.load()
        assert actual.size==expected.size
        np.testing.assert_array_equal(np.array(actual.convert('RGB')),np.array(expected.convert('RGB')))
        assert layer['opacity']>0


def test_precip_native_transparency_and_fire_native_float_raster_declared():
    layers=json.loads((ROOT/'overlay/sources.json').read_text())['layers']
    rain=next(l for l in layers if l['id']=='precipitation');fires=next(l for l in layers if l['id']=='active_fires')
    assert rain['type']=='transparent_png';assert fires['type']=='exr_fire'
    assert fires['url'].endswith('.exr') and fires['colormap_url'].endswith('.png')
    assert layers[0]['id']=='precipitation'
    assert not list((ROOT/'overlay-site/assets').glob('*_full.png'))


def test_no_old_peak_mask_selection_paths_in_new_builder():
    code=(ROOT/'build_geographic_overlays.py').read_text()
    assert 'def derive_field' not in code
    assert 'np.quantile' not in code
    assert 'create_peak_layer' not in code
    assert 'full_field' not in code
