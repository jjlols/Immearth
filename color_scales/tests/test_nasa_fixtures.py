"""Offline scientific-fixture checks; actual NASA assets must not be guessed."""
from __future__ import annotations

from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from extract_color_scales import base_result
from nasa_extractors import precipitation, modern, active_fires_image, ASSET_SHA256
from nasa_sources import discover_colorbars

FIXTURES = ROOT / "tests" / "fixtures"
EVIDENCE = ROOT / "source_evidence"


class NasaFixtureTests(unittest.TestCase):
    def test_precipitation_intervals_and_sha(self):
        html = (EVIDENCE / "precipitation.html").read_bytes()
        assets = discover_colorbars(html, "https://svs.gsfc.nasa.gov/4285/")
        self.assertEqual(len(assets), 4)  # white and black variants of rain + snow
        fetcher = lambda url: ((FIXTURES / url.rsplit("/", 1)[1]).read_bytes(), None)
        result = base_result("precipitation", {"source_url": "https://svs.gsfc.nasa.gov/4285/", "scientific_variable": "IMERG", "units": None})
        with tempfile.TemporaryDirectory() as directory:
            precipitation(result, assets, fetcher, Path(directory))
        self.assertEqual(len(result["legends"]), 2)
        for legend in result["legends"]:
            self.assertEqual(len(legend["categories"]), 11)
            self.assertEqual(legend["categories"][-1]["upper_bound"], None)
            self.assertEqual(legend["units"], "mm/hour")
        self.assertFalse(result["numeric_interpolation_supported"])

    def test_modern_ticks_nonlinear_log_and_temperature_sequence(self):
        html_category = [("carbon_monoxide", [40, 100, 130, 200, 500], "nonlinear"),
                         ("nitrogen_oxides", [0.001, 0.01, 0.1, 1, 10], "logarithmic"),
                         ("near_surface_temperature", [-40, -20, -10, 0, 10, 20, 30, 40], "linear")]
        for category, values, scale_type in html_category:
            filename = {"carbon_monoxide": "CO_colorbar_plain.png", "nitrogen_oxides": "NOx_colorbar_plain.png", "near_surface_temperature": "NearSurfaceTemperature_colorbar_plain.png"}[category]
            with self.subTest(category=category):
                assets = [{"url": "https://svs.gsfc.nasa.gov/vis/" + filename}]
                fetcher = lambda url, path=filename: ((FIXTURES / path).read_bytes(), None)
                result = base_result(category, {"source_url": "https://svs.gsfc.nasa.gov/1/", "scientific_variable": category, "units": None})
                with tempfile.TemporaryDirectory() as directory:
                    modern(result, assets, fetcher, Path(directory), 16)
                self.assertEqual([tick["value"] for tick in result["tick_labels"]], values)
                self.assertEqual(result["scale_type"], scale_type)
                self.assertEqual(result["verification_status"], "estimated")
                self.assertLessEqual(len(result["estimated_value_mapping"]), len(result["sampled_rgb_colors"]))
                self.assertTrue(all(sample["alpha"] == 255 for sample in result["sampled_rgb_colors"]))

    def test_actual_fire_video_frame_and_unmapped_extension(self):
        result = base_result("active_fires", {"source_url": "https://svs.gsfc.nasa.gov/5113/", "scientific_variable": "FRP", "units": None})
        with tempfile.TemporaryDirectory() as directory:
            active_fires_image(result, (FIXTURES / "fires_video_first.png").read_bytes(),
                               "https://svs.gsfc.nasa.gov/vis/fires_frp_VIIRS_2048p30.mp4",
                               Path(directory), 16, "fixture")
        self.assertEqual(result["units"], "MW")
        self.assertEqual(result["colorbar_bounding_box"], [98, 1898, 585, 1899])
        self.assertEqual([tick["value"] for tick in result["tick_labels"]], [0, 2, 4, 6, 8])
        self.assertLessEqual(max(m["value"] for m in result["estimated_value_mapping"]), 8)
        self.assertEqual(result["source_asset_sha256"] if "source_asset_sha256" in result else result["source_frame_sha256"], "fixture")

    def test_all_source_asset_hashes_are_real_and_pinned(self):
        self.assertEqual(len(ASSET_SHA256), 5)
        for filename, sha in ASSET_SHA256.items():
            import hashlib
            self.assertEqual(hashlib.sha256((FIXTURES / filename).read_bytes()).hexdigest(), sha)


if __name__ == "__main__":
    unittest.main()
