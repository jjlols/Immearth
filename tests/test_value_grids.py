"""Synthetic checks for color-to-value grids. They do not read the large map PNGs."""
from __future__ import annotations

import importlib.util
import math
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("build_value_grids", ROOT / "build_value_grids.py")
grids = importlib.util.module_from_spec(SPEC)
sys.modules["build_value_grids"] = grids
SPEC.loader.exec_module(grids)


def temperature_scale():
    return grids.load_scale("near_surface_temperature", ROOT / "color_scales" / "output")


def nitrogen_scale():
    return grids.load_scale("nitrogen_oxides", ROOT / "color_scales" / "output")


def precipitation_scale():
    return grids.load_scale("precipitation", ROOT / "color_scales" / "output")


def test_painted_scale_colors_decode_to_their_values():
    scale = temperature_scale()
    samples = grids.samples_from_scale(scale)
    # Spread across the bar so the colors are not neighbors of each other.
    chosen = [samples[8], samples[40], samples[70], samples[100]]
    image = np.zeros((8, 8, 3), dtype=np.uint8)
    image[:, :] = (255, 0, 255)  # off-palette fill
    image[1:3, 1:3] = chosen[0].rgb
    image[1:3, 5:7] = chosen[1].rgb
    image[5:7, 1:3] = chosen[2].rgb
    image[5:7, 5:7] = chosen[3].rgb

    values, palettes = grids.decode_rgb(image, samples, delta_e_threshold=8.0, overlays=[])
    assert palettes is None
    for row, col, sample in (
        (1, 1, chosen[0]),
        (1, 5, chosen[1]),
        (5, 1, chosen[2]),
        (5, 5, chosen[3]),
    ):
        assert values[row, col] == pytest.approx(sample.value)
    # The magenta fill is not on the temperature bar.
    assert np.isnan(values[0, 0])
    assert np.isnan(values[4, 4])


def test_off_palette_pixels_and_overlay_rectangles_become_null():
    scale = precipitation_scale()
    samples = grids.samples_from_scale(scale)
    liquid_yellow = next(sample for sample in samples if sample.rgb == (255, 251, 0))
    image = np.zeros((6, 6, 3), dtype=np.uint8)
    image[:, :] = liquid_yellow.rgb
    image[0:2, 0:2] = (128, 128, 128)  # the unassigned grey swatch family
    image[0:2, 4:6] = (0, 0, 40)  # dark ocean blue

    values, palettes = grids.decode_rgb(
        image,
        samples,
        delta_e_threshold=12.0,
        overlays=[(3, 3, 6, 6)],
    )
    assert np.isnan(values[0, 0])
    assert np.isnan(values[0, 5])
    assert np.isnan(values[4, 4])  # painted with a real legend color, then masked
    assert values[2, 2] == pytest.approx(liquid_yellow.value)
    assert palettes[2, 2] == "liquid"
    assert palettes[4, 4] is None


def test_log10_interpolation_is_piecewise_between_ticks():
    ticks = [
        {"position": 0.0, "value": 0.001},
        {"position": 0.5, "value": 0.1},
        {"position": 1.0, "value": 10.0},
    ]
    # Halfway from 0.001 to 0.1 in log10 space is 0.01, not the linear 0.0505.
    got = grids.position_to_value(0.25, ticks, "logarithmic")
    assert got == pytest.approx(0.01)
    assert got != pytest.approx(0.0505, abs=1e-3)
    assert grids.position_to_value(0.5, ticks, "logarithmic") == pytest.approx(0.1)
    assert grids.position_to_value(0.0, ticks, "logarithmic") == pytest.approx(0.001)

    scale = nitrogen_scale()
    assert scale["scale_type"] == "logarithmic"
    samples = grids.samples_from_scale(scale)
    # A sample between the 0.01 and 0.1 anchors must follow log10, not a straight line.
    ticks = scale["tick_labels"]
    low = next(tick for tick in ticks if tick["value"] == 0.01)
    high = next(tick for tick in ticks if tick["value"] == 0.1)
    midpoint = (float(low["position"]) + float(high["position"])) / 2
    logged = grids.position_to_value(midpoint, ticks, "logarithmic")
    linear = float(low["value"]) + 0.5 * (float(high["value"]) - float(low["value"]))
    assert logged == pytest.approx(math.sqrt(0.01 * 0.1))
    assert logged != pytest.approx(linear, rel=0.05)

    between = min(samples, key=lambda sample: abs(sample.value - logged))
    image = np.full((4, 4, 3), between.rgb, dtype=np.uint8)
    values, _ = grids.decode_rgb(image, samples, delta_e_threshold=2.0, overlays=[])
    assert values[0, 0] == pytest.approx(between.value)


def test_nonuniform_anchors_are_piecewise_linear():
    # Carbon monoxide's gaps are not equal: 40, 100, 130, 200, 500.
    ticks = [
        {"position": 0.0, "value": 40},
        {"position": 0.25, "value": 100},
        {"position": 0.5, "value": 130},
        {"position": 0.75, "value": 200},
        {"position": 1.0, "value": 500},
    ]
    assert grids.position_to_value(0.125, ticks, "nonlinear") == pytest.approx(70)
    assert grids.position_to_value(0.875, ticks, "nonlinear") == pytest.approx(350)
    # A single line from 40 to 500 would put position 0.875 at 442.5.
    assert grids.position_to_value(0.875, ticks, "nonlinear") != pytest.approx(442.5, abs=1)


def test_grid_is_north_up_and_dateline_is_on_the_left():
    scale = temperature_scale()
    samples = grids.samples_from_scale(scale)
    # Four colors far apart on the bar, one for each corner of the globe.
    northwest, northeast, southwest, southeast = samples[10], samples[45], samples[75], samples[110]
    image = np.full((10, 20, 3), (255, 0, 255), dtype=np.uint8)
    image[0, 0] = northwest.rgb
    image[0, -1] = northeast.rgb
    image[-1, 0] = southwest.rgb
    image[-1, -1] = southeast.rgb

    document, _description, grid, _palettes = grids.build_layer(
        "near_surface_temperature",
        rgb=image,
        scale=scale,
        delta_e=8.0,
        min_valid_fraction=0.30,
        grid_height=10,
        grid_width=20,
        overlays=[],
    )
    assert grid.shape == (10, 20)
    assert document["lat_lon_convention"].startswith("equirectangular")
    assert "row 0 is 90 N" in document["lat_lon_convention"]
    assert "column 0 is 180 W" in document["lat_lon_convention"]
    # One source pixel per cell, so the corner cells are the corner pixels.
    assert grid[0, 0] == pytest.approx(grids.round_for_layer(northwest.value, "near_surface_temperature"))
    assert grid[0, -1] == pytest.approx(grids.round_for_layer(northeast.value, "near_surface_temperature"))
    assert grid[-1, 0] == pytest.approx(grids.round_for_layer(southwest.value, "near_surface_temperature"))
    assert grid[-1, -1] == pytest.approx(grids.round_for_layer(southeast.value, "near_surface_temperature"))
    # The magenta sea fails the 30 percent rule, so those cells stay empty.
    assert np.isnan(grid[5, 10])
    north_lat, west_lon = grids.cell_lat_lon(0, 0, 10, 20)
    south_lat, east_lon = grids.cell_lat_lon(9, 19, 10, 20)
    assert north_lat > south_lat
    assert west_lon < east_lon
    assert north_lat > 80
    assert south_lat < -80
    assert west_lon < -160
    assert east_lon > 160


def test_cell_with_too_few_valid_pixels_is_null():
    values = np.full((4, 4), np.nan)
    values[0, 0] = 5.0  # 1 of 4 pixels in the north-west cell: 25 percent
    grid, _ = grids.downsample(values, None, grid_height=2, grid_width=2, min_valid_fraction=0.30)
    assert np.isnan(grid[0, 0])
    values[:, :] = 5.0
    grid, _ = grids.downsample(values, None, grid_height=2, grid_width=2, min_valid_fraction=0.30)
    assert grid[0, 0] == pytest.approx(5.0)


def test_precipitation_bins_follow_left_edge_ticks_and_record_palette():
    scale = precipitation_scale()
    samples = grids.samples_from_scale(scale)
    yellow = next(sample for sample in samples if sample.rgb == (255, 251, 0) and sample.palette == "liquid")
    # Tick order 0.1, 0.2, 0.3, 0.5, 1, 2, 3, ... and this yellow is the 2-to-3 block.
    assert yellow.value == pytest.approx(math.sqrt(2 * 3))
    frozen = next(sample for sample in samples if sample.rgb == (69, 255, 255))
    assert frozen.palette == "frozen"
    assert frozen.value == pytest.approx(math.sqrt(0.1 * 0.2))

    image = np.zeros((4, 4, 3), dtype=np.uint8)
    image[:, :2] = yellow.rgb
    image[:, 2:] = frozen.rgb
    values, palettes = grids.decode_rgb(image, samples, delta_e_threshold=5.0, overlays=[])
    assert values[0, 0] == pytest.approx(yellow.value)
    assert palettes[0, 0] == "liquid"
    assert palettes[0, 3] == "frozen"


def test_region_names_cover_poles_continents_and_oceans():
    assert grids.region_name(85, 0) == "the high Arctic"
    assert grids.region_name(-80, 0) == "Antarctica"
    assert "Africa" in grids.region_name(10, 20)
    assert "Pacific" in grids.region_name(0, -150)
    assert "Pacific" in grids.region_name(30, 170)
    assert "Asia" not in grids.region_name(30, 170)
    assert "Atlantic" in grids.region_name(30, -40)
