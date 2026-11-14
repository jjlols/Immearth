"""Offline tests. No NASA access or downloader implementation is required."""
from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from legend import (Box, decode_image, detect_categorical_legend, find_gradient_regions,
                    infer_numeric_scale, parse_crop, sample_gradient)
from nasa_sources import discover_colorbars, page_title
from extract_color_scales import image_fallback, base_result, run


def horizontal_image() -> Image.Image:
    a = np.full((100, 240, 4), 255, dtype=np.uint8)
    for x in range(20, 220):
        a[40:60, x, :3] = [(x - 20) * 255 // 199, 200, 100]
    return Image.fromarray(a)


def vertical_image() -> Image.Image:
    a = np.full((240, 100, 4), 255, dtype=np.uint8)
    for y in range(20, 220):
        a[y, 40:60, :3] = [100, 200, (y - 20) * 255 // 199]
    return Image.fromarray(a)


class DetectorTests(unittest.TestCase):
    def test_official_standalone_colorbar_discovery(self):
        html = b"""<meta property='og:title' content='NASA Scientific Visualization Studio | CO'>
        <section id='media_group_1'><a href='/vis/example/CO_colorbar_plain.png'>Download</a><p>CO concentration colorbar</p></section>
        <section id='media_group_2'><a href='/vis/example/not_a_legend.png'>Map frame</a></section>"""
        found = discover_colorbars(html, "https://svs.gsfc.nasa.gov/5153/")
        self.assertEqual([x["url"] for x in found], ["https://svs.gsfc.nasa.gov/vis/example/CO_colorbar_plain.png"])
        self.assertEqual(page_title(html), "CO")

    def test_horizontal_gradient_on_white(self):
        result = find_gradient_regions(horizontal_image())
        self.assertTrue(result)
        best = max(result, key=lambda c: c["long"])
        self.assertEqual(best["orientation"], "horizontal")
        self.assertAlmostEqual(best["start"], 20)
        self.assertAlmostEqual(best["end"], 220)

    def test_horizontal_gradient_samples(self):
        image = horizontal_image()
        samples = sample_gradient(image, Box(20, 40, 220, 60), "horizontal", 11)
        self.assertEqual(samples[0]["rgb"], [0, 200, 100])
        self.assertEqual(samples[5]["rgb"], [128, 200, 100])
        self.assertEqual(samples[-1]["rgb"], [255, 200, 100])
        self.assertEqual(samples[-1]["position"], 1)

    def test_vertical_gradient_samples(self):
        image = vertical_image()
        found = find_gradient_regions(image)
        self.assertTrue(any(c["orientation"] == "vertical" for c in found))
        samples = sample_gradient(image, Box(40, 20, 60, 220), "vertical", 3)
        self.assertEqual(samples[0]["rgb"], [100, 200, 255])
        self.assertEqual(samples[-1]["rgb"], [100, 200, 0])

    def test_discrete_swatches_are_not_continuous(self):
        a = np.full((60, 160, 4), 255, dtype=np.uint8)
        for i, color in enumerate(([200, 20, 0], [255, 220, 0], [0, 150, 60])):
            a[10:40, i * 50:(i + 1) * 50, :3] = color
        image = Image.fromarray(a)
        swatches = detect_categorical_legend(image, Box(0, 10, 150, 40))
        self.assertEqual([s["rgb"] for s in swatches], [[200, 20, 0], [255, 220, 0], [0, 150, 60]])
        with self.assertRaises(ValueError):
            sample_gradient(image, Box(0, 10, 150, 40), "horizontal")

    def test_white_center_is_valid_gradient_color(self):
        # A neutral zero-chroma center must survive sampling, not be split off.
        data = np.full((100, 260, 4), 255, dtype=np.uint8)
        for x in range(30, 230):
            fraction = abs(x - 130) / 100
            data[40:60, x, :3] = [255 - 200 * fraction, 255 - 180 * fraction, 255 - 20 * fraction]
        image = Image.fromarray(data)
        self.assertEqual(image.getpixel((130, 50)), (255, 255, 255, 255))
        samples = sample_gradient(image, Box(30, 40, 230, 60), "horizontal", 3)
        self.assertEqual(len(samples), 3)
        self.assertEqual(samples[1]["rgb"], [255, 255, 255])

    def test_crop_validation(self):
        self.assertEqual(parse_crop("2,3,20,8", (100, 100)).as_list(), [2, 3, 22, 11])
        for crop in ["2,3,20", "-1,2,10,8", "90,3,20,8", "1,2,0,8"]:
            with self.assertRaises(ValueError):
                parse_crop(crop, (100, 100))

    def test_discrete_runs_have_exact_boundaries(self):
        row = np.asarray([[[255, 0, 0, 255]] * 4 + [[0, 255, 0, 255]] * 5,], dtype=np.uint8)
        from legend import rgb_runs
        self.assertEqual(rgb_runs(row), [(0, 4, [255, 0, 0]), (4, 9, [0, 255, 0])])

    def test_numeric_scale_inference(self):
        ticks = lambda values: [{"value": value} for value in values]
        self.assertEqual(infer_numeric_scale(ticks([1, 10, 100])), "logarithmic")
        self.assertEqual(infer_numeric_scale(ticks([-20, 0, 20])), "linear")
        self.assertEqual(infer_numeric_scale(ticks([40, 100, 130, 200, 500])), "nonlinear")
        self.assertEqual(infer_numeric_scale(ticks([0])), "unknown")


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.directory = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def test_embedded_legend_detection_and_unknown_mapping(self):
        image_dir = self.directory / "images"
        image_dir.mkdir()
        horizontal_image().save(image_dir / "precipitation.png")
        output = self.directory / "output"
        result = base_result("precipitation", {"source_url": "https://svs.gsfc.nasa.gov/4285/", "scientific_variable": "test", "units": "incorrect"})
        result["_output"] = output
        output.mkdir()
        image_fallback("precipitation", result, image_dir / "precipitation.png", None, 16, False)
        self.assertEqual(result["status"], "uncalibrated_palette_extracted")
        self.assertIsNone(result["numerical_range"])
        self.assertEqual(result["value_mapping"], [])
        self.assertFalse(result["numeric_interpolation_supported"])

    def test_missing_image_and_corrupt_image(self):
        for contents in (None, b"not an image"):
            with self.subTest(contents=contents):
                output = self.directory / ("empty" if contents is None else "corrupt")
                with patch("extract_color_scales.fetch", side_effect=OSError("offline")):
                    args = type("Args", (), {"config": ROOT / "config.json", "category": "carbon_monoxide",
                        "image_dir": self.directory / "images", "output_dir": output, "crop": None,
                        "force": False, "verbose": False, "ocr": False, "max_samples": 16,
                        "timeout": 1, "probe_timeout": 1, "video_probe_bytes": 100})()
                    self.directory.joinpath("images").mkdir(exist_ok=True)
                    if contents is not None:
                        self.directory.joinpath("images", "carbon_monoxide.png").write_bytes(contents)
                    self.assertEqual(run(args), 0)
                data = json.loads((output / "carbon_monoxide" / "scale.json").read_text())
                self.assertEqual(data["status"], "failed")
                self.assertIsNone(data["units"])
                self.assertEqual(data["value_mapping"], [])
                self.assertIn("SVS 5115", data["warnings"][0])

    def test_manual_crop(self):
        image = self.directory / "legend.png"
        horizontal_image().save(image)
        result = base_result("nitrogen_oxides", {"source_url": "https://svs.gsfc.nasa.gov/5154/", "scientific_variable": "NOx", "units": None})
        result["_output"] = self.directory
        image_fallback("nitrogen_oxides", result, image, "20,40,200,20", 16, False)
        self.assertEqual(result["extraction_method"], "source_image_manual_crop")
        self.assertEqual(result["status"], "uncalibrated_palette_extracted")


    def test_missing_labels_and_units_remain_unknown(self):
        image = self.directory / "no_labels.png"
        horizontal_image().save(image)
        self.assertTrue(find_gradient_regions(Image.open(image)))
        result = base_result("near_surface_temperature", {"source_url": "https://svs.gsfc.nasa.gov/5147/",
                              "scientific_variable": "temperature", "units": None})
        result["_output"] = self.directory
        image_fallback("near_surface_temperature", result, image, None, 16, False)
        result["units"] = None
        self.assertIsNone(result["units"])
        self.assertIsNone(result["numerical_range"])
        self.assertEqual(result["scale_type"], "unknown")
        self.assertFalse(result["numeric_interpolation_supported"])
        self.assertEqual(result["verification_status"], "unknown")

    def test_fake_downloader_must_never_be_called(self):
        # Independence is structural: even a working downloader must not be imported.
        self.assertNotIn("download_eic", sys.modules)
        self.assertFalse(list(ROOT.rglob("download_eic.py")))
        with patch("extract_color_scales.fetch", side_effect=OSError("offline")):
            args = type("Args", (), {"config": ROOT / "config.json", "category": "active_fires",
                "image_dir": self.directory / "missing", "output_dir": self.directory / "out", "crop": None,
                "force": False, "verbose": False, "ocr": False, "max_samples": 16,
                "timeout": 1, "probe_timeout": 1, "video_probe_bytes": 100})()
            run(args)
        self.assertNotIn("download_eic", sys.modules)

    def test_corrupt_raster_decoder(self):
        with self.assertRaises(ValueError):
            decode_image(b"not a raster")


if __name__ == "__main__":
    unittest.main()
