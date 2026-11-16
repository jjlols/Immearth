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


def _complete_fields():
    return [layer for layer in json.loads((ROOT/'overlay/sources.json').read_text())['layers'] if layer['type']=='complete_field']


def _assert_same_rgb(actual_path,expected_path):
    with Image.open(expected_path) as expected:expected.load()
    with Image.open(actual_path) as actual:actual.load()
    assert actual.size==expected.size
    np.testing.assert_array_equal(np.array(actual.convert('RGB')),np.array(expected.convert('RGB')))


def test_complete_geos_source_rgb_and_opaque_field_is_kept(tmp_path,monkeypatch):
    """The builder writes each complete GEOS field with its source RGB intact (built offline into a temp folder)."""
    catalog=_complete_fields()
    assert catalog
    land={'type':'FeatureCollection','features':[{'type':'Feature','geometry':{'type':'Polygon','coordinates':[[[-10,-10],[10,-10],[10,10],[-10,-10]]]}}]}
    def offline_fetch(url,target):
        assert Path(target).suffix=='.geojson','only the basemap is fetched for complete fields'
        Path(target).parent.mkdir(parents=True,exist_ok=True);Path(target).write_text(json.dumps(land));return Path(target)
    config=json.loads((ROOT/'overlay/sources.json').read_text())
    config['basemap']['size']=[200,100]
    config['layers']=[{**layer,'source':str(ROOT/layer['source'])} for layer in catalog]
    monkeypatch.setattr(geo,'ROOT',tmp_path);monkeypatch.setattr(geo,'fetch_asset',offline_fetch)
    manifest=geo.prepare_marker_layers(config,tmp_path/'site'/'assets')
    assert [layer['id'] for layer in manifest['layers']]==[layer['id'] for layer in catalog]
    for layer in catalog:
        _assert_same_rgb(tmp_path/'site'/'assets'/f"{layer['id']}.png",ROOT/layer['source'])
        assert layer['opacity']>0
    assert not list((tmp_path/'site'/'assets').glob('*_full.png'))


def test_committed_public_copies_keep_complete_source_rgb():
    """What the site serves (public/assets) is the intact source raster, not an edited copy."""
    for layer in _complete_fields():
        _assert_same_rgb(ROOT/'public/assets'/f"{layer['id']}.png",ROOT/layer['source'])


def test_precip_native_transparency_and_fire_native_float_raster_declared():
    layers=json.loads((ROOT/'overlay/sources.json').read_text())['layers']
    rain=next(l for l in layers if l['id']=='precipitation');fires=next(l for l in layers if l['id']=='active_fires')
    assert rain['type']=='transparent_png';assert fires['type']=='exr_fire'
    assert fires['url'].endswith('.exr') and fires['colormap_url'].endswith('.png')
    assert layers[0]['id']=='precipitation'
    assert not list((ROOT/'public/assets').glob('*_full.png'))


def test_no_old_peak_mask_selection_paths_in_new_builder():
    code=(ROOT/'build_geographic_overlays.py').read_text()
    assert 'def derive_field' not in code
    assert 'np.quantile' not in code
    assert 'create_peak_layer' not in code
    assert 'full_field' not in code
