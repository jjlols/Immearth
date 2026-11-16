from pathlib import Path
import unittest
from sonification.palette_library import (read_palette, build_library, nearest_palette, summarize, rgb_distance, RawDataAdapter)
from sonification.build_sonification_assets import analyze

ROOT=Path(__file__).resolve().parents[1]

class ScaleTests(unittest.TestCase):
    def load(self,name):
        return read_palette(name)


class Tests(ScaleTests):
    def test_nonlinear_CO_anchor_value_and_tier_position(self):
        cache=build_library('carbon_monoxide')
        mapping=read_palette('carbon_monoxide')
        for c in cache:
            if all(abs(a-b)<3 for a,b in zip(c['rgb'],[160,90,0])):
                self.assertGreater(c['value'],100)
                self.assertLess(c['value'],500)
                # RGB progression preserves 40-100-130-200-500 physical spacing,
                # not 500*percentage of raw image width.
        v1=nearest_palette('carbon_monoxide',mapping['sampled_rgb_colors'][0]['rgb'])
        v2=nearest_palette('carbon_monoxide',mapping['sampled_rgb_colors'][20]['rgb'])
        self.assertGreaterEqual(v2['value'],40)
        self.assertLess(v2['value'],200)
        self.assertNotEqual(v1['status'],'no_data')
        errs=[]
        for index in (0,42,56,71,76,97,111):
            rgb=mapping['sampled_rgb_colors'][index]['rgb']
            decoded=nearest_palette('carbon_monoxide',rgb,tolerance=0)
            self.assertNotIn(decoded['status'],['no_data'])
            if index==42:
                self.assertTrue(100<=decoded['value']<=130)

    def test_log_NOx(self):
        colors=build_library('nitrogen_oxides')
        first=colors[0]['value'];last=colors[-1]['value']
        self.assertAlmostEqual(first,.001)
        import math
        self.assertTrue(4.99<last<10.01,last)
        previous=colors[0]['value']
        for color in colors[1:]:
            self.assertGreater(color['value'],previous)
            previous=color['value']
        self.assertAlmostEqual(math.log10(colors[-1]['value'])-math.log10(colors[0]['value']),4,places=1)

    def test_rain_snow_discrete_and_overflow(self):
        nox=nearest_palette('nitrogen_oxides',[2,65,1])
        self.assertNotEqual(nox['status'],'no_data')
        rain=nearest_palette('precipitation',[0,139,82]);snow=nearest_palette('precipitation',[82,93,255])
        self.assertEqual(rain['legend'],'liquid');self.assertEqual(snow['legend'],'frozen')
        self.assertFalse(snow['value']==rain['value'])
        # Each NASA tick marks the LEFT edge of its block (0.1 at x=40, 0.2 at x=76, ... 50 at x=400).
        self.assertEqual(rain['interval'],{'lower':.2,'upper':.3})
        first=nearest_palette('precipitation',[0,129,20]);self.assertEqual(first['interval'],{'lower':.1,'upper':.2})
        yellow=nearest_palette('precipitation',[255,251,0]);self.assertEqual(yellow['interval'],{'lower':2.,'upper':3.})
        top=nearest_palette('precipitation',[200,0,0]);self.assertEqual(top['interval'],{'lower':20.,'upper':50.})
        overflow=nearest_palette('precipitation',[145,0,0]);self.assertIsNone(overflow['interval']['upper'])
        self.assertEqual(overflow['interval']['lower'],50.);self.assertEqual(overflow['value'],50.)
        # NASA's snow bar draws 20-50 and the overflow arrow in one RGB: one class, no invented upper value.
        shared=[e for e in build_library('precipitation') if e['rgb']==(140,20,156)]
        self.assertEqual(len(shared),1);self.assertEqual(shared[0]['interval'],{'lower':20.,'upper':None});self.assertEqual(shared[0]['value'],20.)
        muted=nearest_palette('precipitation',[128,128,128]);self.assertEqual(muted['status'],'unclassified_neutral')

    def test_no_data_and_text(self):
        no_data=nearest_palette('carbon_monoxide',[255,255,255],0)
        self.assertEqual(no_data['status'],'no_data')
        unmatch=nearest_palette('nitrogen_oxides',[255,151,1]);self.assertNotEqual(unmatch['status'],'matched')
        neutral=nearest_palette('near_surface_temperature',[160,160,160]);self.assertNotEqual(neutral['status'],'matched')
        info=summarize([nearest_palette('precipitation',[145,0,0]),nearest_palette('precipitation',[82,93,255])])
        self.assertEqual(info['snow_count'],1)
        self.assertEqual(info['rain_count'],1)

    def test_binary_adapter_maintains_described_regions(self):
        all_layers=('precipitation','active_fires','carbon monoxide'.replace(' ','_'),'nitrogen_oxides','near_surface_temperature')
        for method in all_layers:
            with self.subTest(method=method):
                feature=analyze(method,ROOT/'data/images'/f'{method}.png',grid=(1,1))
                self.assertEqual(len(feature),1)
                self.assertIn('region',feature[0])

    def test_vectorized_pixel_equivalence(self):
        from sonification.palette_library import pixel_records
        for category in ('precipitation','active_fires','carbon_monoxide','nitrogen_oxides','near_surface_temperature'):
            with self.subTest(category=category):
                library=build_library(category)
                rgba=[[[17,170,34,255],[128,128,128,255],[255,255,255,0],[250,249,248,255],[5,30,110,255]]]
                for pixel,actual in zip(rgba[0],pixel_records(category,rgba)):
                    expected=nearest_palette(category,pixel[:3],pixel[3],tolerance=62,library=library)
                    self.assertEqual(actual['status'],expected['status'])
                    if expected['status']=='matched':
                        self.assertEqual(actual['value'],expected['value'])
                        self.assertAlmostEqual(actual['color_distance'],expected['color_distance'])

    def test_rain_features_read_nasa_transparent_layer(self):
        from PIL import Image
        from sonification.build_sonification_assets import source_for, RAIN_SOURCE
        path,masks=source_for('precipitation')
        self.assertEqual(path,RAIN_SOURCE);self.assertEqual(masks,[])
        with Image.open(path) as image:self.assertIn('A',image.getbands())
        # Land and ocean are transparent there, so a desert brown can never read as heavy rain.
        feature=analyze('precipitation',path,grid=(1,1))[0]
        self.assertEqual(feature['unclassified_count'],0)
        self.assertGreater(feature['no_data_count'],feature['classified_count'])

    def test_legend_masks_shared_by_both_builders_are_no_data(self):
        import importlib.util,sys
        from sonification.image_masks import LEGEND_MASKS,boxes_for
        from sonification.build_sonification_assets import source_for
        spec=importlib.util.spec_from_file_location('build_value_grids_masks',ROOT/'build_value_grids.py')
        grids=importlib.util.module_from_spec(spec);sys.modules[spec.name]=grids;spec.loader.exec_module(grids)
        self.assertEqual(grids.OVERLAYS,{layer:list(record['boxes']) for layer,record in LEGEND_MASKS.items()})
        path,masks=source_for('near_surface_temperature')
        self.assertEqual(masks,LEGEND_MASKS['near_surface_temperature']['boxes'])
        plain=analyze('near_surface_temperature',path,grid=(6,8))[0]
        masked=analyze('near_surface_temperature',path,grid=(6,8),masks=masks)[0]
        # Region 0 holds the logo plaque (0..348 x 0..74 of the 256x170 cell): those pixels become no data.
        self.assertEqual(masked['no_data_count']-plain['no_data_count'],256*74)
        self.assertEqual(masked['region']['id'],plain['region']['id'])
        with self.assertRaises(ValueError):boxes_for('active_fires',2048,1024)

    def test_current_assets_six_rows_eight_columns(self):
        import json
        from sonification.build_sonification_assets import build_assets
        # The committed copy the site serves, and a fresh build (in memory, so a clean clone needs no overlay-site/).
        built=build_assets()
        committed=json.loads((ROOT/'public/scales/features.json').read_text())
        # The committed copy must be what the pipeline builds now (rebuild with: python -m sonification.build_sonification_assets --output public/scales/features.json).
        self.assertEqual(committed,json.loads(json.dumps(built)))
        for record in (committed,built):
            self.assertEqual(record['grid'],{'rows':6,'columns':8})
            self.assertEqual(set(record['categories']),{'precipitation','active_fires','carbon_monoxide','nitrogen_oxides','near_surface_temperature'})
            self.assertTrue(all(len(cells)==48 for cells in record['categories'].values()))
            for cells in record['categories'].values():
                self.assertEqual([(cell['region']['row'],cell['region']['column']) for cell in cells],[(row,column) for row in range(6) for column in range(8)])


if __name__=='__main__':
    unittest.main()
