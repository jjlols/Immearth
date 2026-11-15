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
        self.assertTrue(rain['interval']['upper']==.2)
        overflow=nearest_palette('precipitation',[145,0,0]);self.assertIsNone(overflow['interval']['upper'])
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


if __name__=='__main__':
    unittest.main()
