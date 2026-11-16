"""Estimate 1-degree value grids from NASA Earth Information Center map images.

Each pixel is matched to the nearest color in that layer's reviewed colorbar
(color_scales/output/<layer>/scale.json) in CIELAB, using CIE76 Delta-E.
Colors farther than a threshold, and pixels inside measured label rectangles,
become empty. The map is then reduced to a 360 by 180 equirectangular grid.

These grids are estimated from NASA's published colorbars. They are not
official scientific data products.
"""
from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

from sonification.image_masks import LEGEND_MASKS

ROOT = Path(__file__).resolve().parent
IMAGE_DIR = ROOT / "data" / "images"
SCALE_DIR = ROOT / "color_scales" / "output"
GRID_DIR = ROOT / "data" / "grids"

GRID_WIDTH = 360
GRID_HEIGHT = 180
DEFAULT_MIN_VALID_FRACTION = 0.30

# CIE76 distances. Video frames are compressed, so the continuous layers allow
# a wider match than the flat PNG precipitation swatches. Tunable from the CLI.
DEFAULT_DELTA_E = {
    "precipitation": 12.0,
    "active_fires": 16.0,
    "carbon_monoxide": 18.0,
    "nitrogen_oxides": 18.0,
    "near_surface_temperature": 18.0,
}

# Legend, logo and date-badge rectangles live in sonification/image_masks.py,
# shared with the music feature builder.
OVERLAYS = {layer: list(record["boxes"]) for layer, record in LEGEND_MASKS.items()}

LAYER_TITLES = {
    "precipitation": "Precipitation rate",
    "active_fires": "Active fire radiative power",
    "carbon_monoxide": "Near-surface carbon monoxide",
    "nitrogen_oxides": "Near-surface nitrogen oxides",
    "near_surface_temperature": "Near-surface temperature",
}

OVERLAY_SENTENCES = {
    "precipitation": (
        "This precipitation image has no legend drawn on the map. "
        "Ocean, land, ice, and the grey swatch stay empty when their colors are far from the rain and snow palettes."
    ),
    "active_fires": (
        "The colorbar, the date, and the legend text in the lower left are masked out. "
        "Those colors belong to the legend, not to fires on the map."
    ),
    "near_surface_temperature": (
        "This temperature frame has no colorbar drawn on the map. "
        "The NASA and GMAO logo in the upper left and the date badge in the lower left are masked out. "
        "The logo's blues and whites would otherwise look like cold temperatures, and the grey date badge is close to the hot end of the legend."
    ),
    "carbon_monoxide": (
        "The NASA and GMAO logo and the date badge are masked out so they are not read as carbon monoxide."
    ),
    "nitrogen_oxides": (
        "The NASA and GMAO logo and the date badge are masked out so they are not read as nitrogen oxides."
    ),
}

LAT_LON_CONVENTION = (
    "equirectangular 1-degree cells; row 0 is 90 N and column 0 is 180 W; "
    "cell (row, col) is centered at latitude 90 - (row + 0.5) and longitude -180 + (col + 0.5)"
)

# sRGB D65 to CIE XYZ, then CIE L*a*b*.
_RGB_TO_XYZ = np.array(
    [
        [0.4124564, 0.3575761, 0.1804375],
        [0.2126729, 0.7151522, 0.0721750],
        [0.0193339, 0.1191920, 0.9503041],
    ],
    dtype=np.float64,
)
_D65 = np.array([0.95047, 1.0, 1.08883], dtype=np.float64)
_DELTA = 6.0 / 29.0


@dataclass(frozen=True)
class ColorSample:
    rgb: tuple[int, int, int]
    value: float
    palette: str | None = None


def srgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    """Convert an array of sRGB colors (..., 3), 0-255 or 0-1, to CIELAB."""
    x = np.asarray(rgb, dtype=np.float64)
    if x.size and np.nanmax(x) > 1.5:
        x = x / 255.0
    linear = np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)
    xyz = linear @ _RGB_TO_XYZ.T
    t = xyz / _D65
    f = np.where(t > _DELTA ** 3, np.cbrt(t), t / (3 * _DELTA ** 2) + 4.0 / 29.0)
    lab = np.empty(x.shape, dtype=np.float64)
    lab[..., 0] = 116.0 * f[..., 1] - 16.0
    lab[..., 1] = 500.0 * (f[..., 0] - f[..., 1])
    lab[..., 2] = 200.0 * (f[..., 1] - f[..., 2])
    return lab


def position_to_value(position: float, ticks: list[dict], scale_type: str) -> float:
    """Map a colorbar position to a value using the labeled tick anchors.

    Linear and nonlinear scales are piecewise linear between anchors, so
    unequal gaps (carbon monoxide, and the uneven Celsius steps) are kept.
    Logarithmic scales are piecewise linear in log10 between anchors.
    """
    points = sorted((float(tick["position"]), float(tick["value"])) for tick in ticks)
    if position <= points[0][0]:
        return points[0][1]
    if position >= points[-1][0]:
        return points[-1][1]
    for (p0, v0), (p1, v1) in zip(points, points[1:]):
        if position <= p1 or math.isclose(position, p1):
            span = p1 - p0
            fraction = 0.0 if span == 0 else (position - p0) / span
            if scale_type == "logarithmic":
                if v0 <= 0 or v1 <= 0:
                    raise ValueError("log10 interpolation needs positive tick values")
                log_v = math.log10(v0) + fraction * (math.log10(v1) - math.log10(v0))
                return 10.0 ** log_v
            return v0 + fraction * (v1 - v0)
    return points[-1][1]


def _dedupe_samples(samples: list[ColorSample]) -> list[ColorSample]:
    """Keep the first sample for an exact RGB (and palette). First is the lower value."""
    kept: list[ColorSample] = []
    seen: set[tuple] = set()
    for sample in samples:
        key = (sample.rgb, sample.palette)
        if key in seen:
            continue
        seen.add(key)
        kept.append(sample)
    return kept


def samples_from_scale(scale: dict) -> list[ColorSample]:
    """Build nearest-color samples and the value each sample stands for."""
    if scale["category"] == "precipitation":
        return _dedupe_samples(_precipitation_samples(scale))
    return _dedupe_samples(_continuous_samples(scale))


def _precipitation_samples(scale: dict) -> list[ColorSample]:
    """Discrete rain and snow blocks.

    scale.json marks tick_is_at_bin_left_edge, and the tick positions fall on
    the left edge of each colored run (the grey swatch to the left of 0.1 is
    not one of these colors). Color i therefore covers the bin from tick i to
    the next tick. The stored value is the geometric mean of that bin, because
    the edges are irregular and roughly logarithmic. The last color starts at
    the 50 mm/hour tick and is unbounded, so it is stored as 50.

    The ticks are what this grid uses. (Until 2026-11-15 the category
    description strings in the same file were shifted one bin; the extractor
    now writes them from the same tick-at-left-edge reading.)
    """
    samples: list[ColorSample] = []
    for legend in scale["legends"]:
        edges = [float(tick["value"]) for tick in legend["tick_labels"]]
        colors = legend["categories"]
        if len(colors) != len(edges):
            raise ValueError(
                f"{legend['name']} precipitation legend has {len(colors)} colors and {len(edges)} ticks"
            )
        for index, category in enumerate(colors):
            lower = edges[index]
            if index + 1 < len(edges):
                upper = edges[index + 1]
                value = math.sqrt(lower * upper)
            else:
                value = lower
            rgb = tuple(int(channel) for channel in category["rgb"])
            samples.append(ColorSample(rgb, value, legend["name"]))
    return samples


def _continuous_samples(scale: dict) -> list[ColorSample]:
    ticks = scale["tick_labels"]
    if not ticks:
        raise ValueError(f"{scale['category']} has no tick labels to interpolate")
    last_position = max(float(tick["position"]) for tick in ticks)
    first_position = min(float(tick["position"]) for tick in ticks)
    scale_type = scale.get("scale_type") or "linear"
    samples: list[ColorSample] = []
    for sample in scale["sampled_rgb_colors"]:
        position = float(sample["position"])
        # Samples past the last labeled tick are the qualitative extension
        # (often a repeated white). They are not given a measurement.
        if position < first_position - 1e-6 or position > last_position + 1e-4:
            continue
        value = position_to_value(position, ticks, scale_type)
        rgb = tuple(int(channel) for channel in sample["rgb"])
        samples.append(ColorSample(rgb, value, None))
    if not samples:
        raise ValueError(f"{scale['category']} produced no in-range color samples")
    return samples


def nearest_samples(lab_pixels: np.ndarray, lab_samples: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """CIE76 nearest sample. lab_pixels is (P, 3). Returns indices and Delta-E."""
    pixels = np.asarray(lab_pixels, dtype=np.float64)
    samples = np.asarray(lab_samples, dtype=np.float64)
    pixel_norm = np.sum(pixels * pixels, axis=1, keepdims=True)
    sample_norm = np.sum(samples * samples, axis=1)
    distance_sq = np.maximum(pixel_norm + sample_norm - 2.0 * (pixels @ samples.T), 0.0)
    index = np.argmin(distance_sq, axis=1)
    delta_e = np.sqrt(distance_sq[np.arange(index.shape[0]), index])
    return index, delta_e


def decode_rgb(
    rgb: np.ndarray,
    samples: list[ColorSample],
    delta_e_threshold: float,
    overlays: list[tuple[int, int, int, int]] | None = None,
    row_chunk: int = 128,
) -> tuple[np.ndarray, np.ndarray | None]:
    """Match every pixel. Values are NaN where the match is rejected.

    The optional palette array uses sample palette names and is None when the
    scale has a single palette. Rejected pixels are None in that array.
    """
    image = np.asarray(rgb)
    if image.ndim != 3 or image.shape[2] < 3:
        raise ValueError("expected an RGB image array")
    height, width = image.shape[:2]
    sample_lab = srgb_to_lab(np.array([sample.rgb for sample in samples], dtype=np.float64))
    values = np.full((height, width), np.nan, dtype=np.float64)
    palettes = [sample.palette for sample in samples]
    track_palette = any(palette is not None for palette in palettes)
    palette_index = np.full((height, width), -1, dtype=np.int16) if track_palette else None
    sample_values = np.array([sample.value for sample in samples], dtype=np.float64)

    for y0 in range(0, height, row_chunk):
        y1 = min(height, y0 + row_chunk)
        block = image[y0:y1, :, :3]
        flat = np.ascontiguousarray(block).reshape(-1, 3)
        lab = srgb_to_lab(flat).reshape(-1, 3)
        index, delta_e = nearest_samples(lab, sample_lab)
        accepted = delta_e <= delta_e_threshold
        decoded = np.full(index.shape, np.nan, dtype=np.float64)
        decoded[accepted] = sample_values[index[accepted]]
        values[y0:y1] = decoded.reshape(y1 - y0, width)
        if palette_index is not None:
            chosen = np.full(index.shape, -1, dtype=np.int16)
            chosen[accepted] = index[accepted]
            palette_index[y0:y1] = chosen.reshape(y1 - y0, width)

    for x0, y0, x1, y1 in overlays or []:
        values[y0:y1, x0:x1] = np.nan
        if palette_index is not None:
            palette_index[y0:y1, x0:x1] = -1

    names = None
    if palette_index is not None:
        names = np.empty(palette_index.shape, dtype=object)
        names[:] = None
        matched = palette_index >= 0
        names[matched] = [palettes[int(i)] for i in palette_index[matched]]
    return values, names


def _bin_edges(length: int, bins: int) -> np.ndarray:
    edges = np.floor(np.arange(bins + 1) * length / bins).astype(int)
    edges[0] = 0
    edges[-1] = length
    for index in range(1, len(edges)):
        if edges[index] <= edges[index - 1]:
            edges[index] = min(length, edges[index - 1] + 1)
    edges[-1] = length
    return edges


def downsample(
    values: np.ndarray,
    palettes: np.ndarray | None,
    grid_height: int = GRID_HEIGHT,
    grid_width: int = GRID_WIDTH,
    min_valid_fraction: float = DEFAULT_MIN_VALID_FRACTION,
) -> tuple[np.ndarray, np.ndarray | None]:
    """Median of valid source pixels in each equirectangular cell.

    A cell is empty when fewer than min_valid_fraction of its source pixels
    matched the legend. Row 0 is the north edge of the image.
    """
    height, width = values.shape
    row_edges = _bin_edges(height, grid_height)
    col_edges = _bin_edges(width, grid_width)
    grid = np.full((grid_height, grid_width), np.nan, dtype=np.float64)
    palette_grid = np.empty((grid_height, grid_width), dtype=object) if palettes is not None else None
    if palette_grid is not None:
        palette_grid[:] = None
    for row in range(grid_height):
        y0, y1 = int(row_edges[row]), int(row_edges[row + 1])
        band = values[y0:y1]
        palette_band = None if palettes is None else palettes[y0:y1]
        for col in range(grid_width):
            x0, x1 = int(col_edges[col]), int(col_edges[col + 1])
            block = band[:, x0:x1]
            if block.size == 0:
                continue
            valid = np.isfinite(block)
            if valid.sum() < min_valid_fraction * block.size:
                continue
            grid[row, col] = float(np.median(block[valid]))
            if palette_grid is not None and palette_band is not None:
                labels = palette_band[:, x0:x1][valid]
                palette_grid[row, col] = _majority(labels)
    return grid, palette_grid


def _majority(labels: np.ndarray) -> str | None:
    if labels.size == 0:
        return None
    values, counts = np.unique(labels.astype(str), return_counts=True)
    best = counts.max()
    winners = values[counts == best]
    if len(winners) == 1:
        return str(winners[0])
    return "mixed"


def round_for_layer(value: float, layer: str) -> float:
    if layer == "near_surface_temperature":
        return float(f"{value:.1f}")
    if layer == "active_fires":
        return float(f"{value:.2f}")
    if layer == "carbon_monoxide":
        return float(f"{value:.1f}")
    if layer in ("nitrogen_oxides", "precipitation"):
        if value == 0:
            return 0.0
        return float(f"{value:.4g}" if layer == "nitrogen_oxides" else f"{value:.3g}")
    return float(f"{value:.4g}")


def round_grid(grid: np.ndarray, layer: str) -> np.ndarray:
    rounded = np.full(grid.shape, np.nan, dtype=np.float64)
    finite = np.isfinite(grid)
    if finite.any():
        rounded[finite] = [round_for_layer(float(value), layer) for value in grid[finite]]
    return rounded


def cell_lat_lon(row: int, col: int, grid_height: int = GRID_HEIGHT, grid_width: int = GRID_WIDTH) -> tuple[float, float]:
    lat = 90.0 - (row + 0.5) * (180.0 / grid_height)
    lon = -180.0 + (col + 0.5) * (360.0 / grid_width)
    return lat, lon


def region_name(lat: float, lon: float) -> str:
    """Rough continent, ocean, or polar name. No coastline dataset and no network."""
    if lat >= 75:
        return "the high Arctic"
    if lat <= -70:
        return "Antarctica"
    for name, south, north, west, east in _LAND_BOXES:
        if south <= lat <= north and _in_lon(lon, west, east):
            return name
    if lat >= 66:
        return "the Arctic Ocean"
    if lat <= -55:
        return "the Southern Ocean"
    if lon <= -70 or lon >= 145:
        return "the North Pacific Ocean" if lat >= 0 else "the South Pacific Ocean"
    if -70 < lon < 20:
        return "the North Atlantic Ocean" if lat >= 0 else "the South Atlantic Ocean"
    return "the Indian Ocean" if lat >= 0 else "the South Indian Ocean"


def _in_lon(lon: float, west: float, east: float) -> bool:
    if west <= east:
        return west <= lon <= east
    return lon >= west or lon <= east


# Specific boxes are listed before the continents that contain them.
_LAND_BOXES = [
    ("Greenland", 59, 84, -73, -12),
    ("Iceland", 63, 67.5, -25, -13),
    ("the British Isles", 49, 61, -11, 2),
    ("Scandinavia", 55, 72, 4, 32),
    ("Europe", 35, 71, -10, 40),
    ("Alaska", 51, 72, -170, -141),
    ("Central America", 7, 22, -93, -77),
    ("the Caribbean", 9, 27, -85, -59),
    ("Mexico", 14, 33, -118, -86),
    ("North America", 24, 72, -140, -52),
    ("the Amazon basin", -15, 5, -75, -45),
    ("South America", -56, 13, -82, -34),
    ("Madagascar", -26, -12, 43, 51),
    ("the Sahara", 15, 32, -17, 35),
    ("Africa", -35, 37, -18, 52),
    ("the Middle East", 12, 42, 32, 63),
    ("India", 6, 35, 68, 90),
    ("Southeast Asia", -10, 23, 92, 140),
    ("East Asia", 20, 50, 100, 146),
    ("Central Asia", 35, 55, 45, 100),
    ("Siberia", 50, 75, 60, 180),
    ("New Guinea", -11, 0, 130, 151),
    ("Australia", -44, -10, 112, 154),
    ("New Zealand", -48, -34, 166, 179),
]


def coverage_percent(grid: np.ndarray) -> float:
    """Share of Earth's surface, weighting cells by cosine of latitude."""
    rows = grid.shape[0]
    lats = 90.0 - (np.arange(rows) + 0.5) * (180.0 / rows)
    weights = np.cos(np.deg2rad(lats))[:, None]
    weights = np.broadcast_to(weights, grid.shape)
    total = float(weights.sum())
    if total == 0:
        return 0.0
    return 100.0 * float(weights[np.isfinite(grid)].sum()) / total


def _extreme(grid: np.ndarray, which: str) -> dict | None:
    finite = np.isfinite(grid)
    if not finite.any():
        return None
    target = float(np.nanmax(grid) if which == "max" else np.nanmin(grid))
    # Plateaus are common: a discrete bin, or many cells on the same rounded color.
    mask = finite & np.isclose(grid, target, rtol=0.0, atol=max(1e-6, abs(target) * 1e-6))
    rows, cols = np.nonzero(mask)
    regions = [region_name(*cell_lat_lon(int(r), int(c), grid.shape[0], grid.shape[1])) for r, c in zip(rows, cols)]
    counts: dict[str, int] = {}
    for name in regions:
        counts[name] = counts.get(name, 0) + 1
    region = max(counts, key=counts.get)
    chosen = [(r, c) for r, c, name in zip(rows, cols, regions) if name == region]
    lats = []
    lons = []
    for r, c in chosen:
        lat, lon = cell_lat_lon(int(r), int(c), grid.shape[0], grid.shape[1])
        lats.append(lat)
        lons.append(lon)
    lat = float(np.median(lats))
    lon = _circular_median(lons)
    return {
        "value": target,
        "latitude": round(lat, 1),
        "longitude": round(lon, 1),
        "region": region,
        "cell_count": int(mask.sum()),
        "region_cell_count": int(counts[region]),
        "region_count": len(counts),
    }


def _circular_median(lons: list[float]) -> float:
    angles = np.deg2rad(lons)
    median_angle = math.atan2(float(np.median(np.sin(angles))), float(np.median(np.cos(angles))))
    lon = math.degrees(median_angle)
    if lon > 180:
        lon -= 360
    if lon < -180:
        lon += 360
    return lon


def _speak_value(value: float, layer: str) -> str:
    if layer == "near_surface_temperature":
        shown = round_for_layer(value, layer)
        if shown < 0:
            return f"{_trim(abs(shown))} degrees Celsius below zero"
        return f"{_trim(shown)} degrees Celsius"
    if layer == "precipitation":
        return f"{_trim(round_for_layer(value, layer))} millimeters per hour"
    if layer == "active_fires":
        return f"{_trim(round_for_layer(value, layer))} megawatts"
    if layer == "carbon_monoxide":
        return f"{_trim(round_for_layer(value, layer))} parts per billion by volume"
    if layer == "nitrogen_oxides":
        return f"{_trim(round_for_layer(value, layer))} parts per billion by volume"
    return _trim(value)


def _trim(value: float) -> str:
    text = f"{value:.4g}"
    if "e" in text or "E" in text:
        return text
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text or "0"


def _place_sentence(kind: str, place: dict | None, layer: str) -> str:
    if place is None:
        return f"There is no {kind} estimated value."
    where = (
        f"in or near {place['region']}, around {_speak_lat(place['latitude'])} and {_speak_lon(place['longitude'])}"
    )
    amount = _speak_value(place["value"], layer)
    if place["cell_count"] > 20 and place["region_count"] > 2 and place["region_cell_count"] < 0.6 * place["cell_count"]:
        return (
            f"The {kind} estimated values, about {amount}, are spread across several regions. "
            f"The largest share is {where}."
        )
    if place["cell_count"] > 1:
        return f"The {kind} estimated values, about {amount}, fall {where}."
    return f"The {kind} estimated value, about {amount}, falls {where}."


def _speak_lat(lat: float) -> str:
    if abs(lat) < 0.5:
        return "the equator"
    hemisphere = "north" if lat > 0 else "south"
    return f"{abs(lat):.0f} degrees {hemisphere}"


def _speak_lon(lon: float) -> str:
    if abs(lon) < 0.5:
        return "the prime meridian"
    if abs(abs(lon) - 180) < 0.5:
        return "the 180 degree meridian"
    hemisphere = "east" if lon > 0 else "west"
    return f"{abs(lon):.0f} degrees {hemisphere}"


def describe_grid(layer: str, grid: np.ndarray, palettes: np.ndarray | None, scale: dict) -> dict:
    finite = grid[np.isfinite(grid)]
    highest = _extreme(grid, "max")
    lowest = _extreme(grid, "min")
    coverage = coverage_percent(grid)
    value_min = None if finite.size == 0 else float(np.min(finite))
    value_max = None if finite.size == 0 else float(np.max(finite))
    title = LAYER_TITLES[layer]
    if finite.size == 0:
        summary = (
            f"{title}. These values are estimated from NASA's published colorbar, not official data. "
            "No one-degree cell had enough pixels close to the legend to estimate a value. "
            + OVERLAY_SENTENCES[layer]
        )
        if layer == "active_fires":
            summary += (
                " Outside that masked legend, this image is dark land and ocean. "
                "Those colors are far from the fire colorbar, so they stay empty instead of becoming a fire value."
            )
    else:
        sentences = [
            f"{title}. These values are estimated from NASA's published colorbar, not official data.",
            (
                f"Across the grid, estimated values run from about {_speak_value(value_min, layer)} "
                f"to about {_speak_value(value_max, layer)}."
            ),
            _place_sentence("highest", highest, layer),
            _place_sentence("lowest", lowest, layer),
            (
                f"About {coverage:.0f} percent of Earth's surface had a color close enough to the legend to decode. "
                "A cell is left empty when fewer than 30 percent of its pixels match the legend."
            ),
            OVERLAY_SENTENCES[layer],
        ]
        if layer == "precipitation" and palettes is not None:
            sentences.append(_palette_sentence(palettes))
            sentences.append(
                "Each rain or snow color is one legend block. The stored number is the geometric mean of that block's labeled edges. "
                "The darkest liquid color is the block that starts at 50 millimeters per hour, and the legend does not set an upper limit, so 50 means 50 or more. "
                "The two darkest frozen colors in the legend file are the same RGB, so frozen rates above 20 millimeters per hour cannot be split from the 50-or-more block."
            )
        if layer == "active_fires":
            sentences.append(
                "Isolated fires often cover only a few pixels inside a one-degree cell, so many of them drop out under the 30 percent rule. "
                "Denser groups of fires are what remain."
            )
        if layer == "near_surface_temperature":
            sentences.append(
                "The legend's labeled ticks run from 40 degrees Celsius below zero to 40 degrees Celsius. "
                "Colors past the last tick are not given a higher number."
            )
        summary = " ".join(sentences)
    payload = {
        "layer": layer,
        "title": title,
        "summary": summary,
        "units": scale.get("units"),
        "scale_verification": scale.get("scale_verification"),
        "value_min": value_min,
        "value_max": value_max,
        "highest": _public_extreme(highest),
        "lowest": _public_extreme(lowest),
        "coverage_percent": round(coverage, 1),
        "caveat": "These values are estimated from NASA's published colorbar, not official data.",
    }
    return payload


def _public_extreme(place: dict | None) -> dict | None:
    if place is None:
        return None
    return {
        "value": place["value"],
        "latitude": place["latitude"],
        "longitude": place["longitude"],
        "region": place["region"],
        "cell_count": place["cell_count"],
    }


def _palette_sentence(palettes: np.ndarray) -> str:
    labels = palettes[palettes != None]  # noqa: E711 - object array of strings and None
    if labels.size == 0:
        return "No cells matched a precipitation palette."
    liquid = int((labels == "liquid").sum())
    frozen = int((labels == "frozen").sum())
    total = int(labels.size)
    liquid_pct = 100.0 * liquid / total
    frozen_pct = 100.0 * frozen / total
    return (
        f"Of the cells with a decoded rate, about {liquid_pct:.0f} percent matched the liquid palette "
        f"and about {frozen_pct:.0f} percent matched the frozen palette."
    )


def grid_document(
    layer: str,
    grid: np.ndarray,
    palettes: np.ndarray | None,
    scale: dict,
) -> dict:
    finite = grid[np.isfinite(grid)]
    flat: list[float | None] = []
    for value in grid.reshape(-1):
        if not np.isfinite(value):
            flat.append(None)
        else:
            number = float(value)
            flat.append(0.0 if number == 0 else number)
    document = {
        "layer": layer,
        "units": scale.get("units"),
        "value_min": None if finite.size == 0 else float(np.min(finite)),
        "value_max": None if finite.size == 0 else float(np.max(finite)),
        "scale_verification": scale.get("scale_verification"),
        "width": int(grid.shape[1]),
        "height": int(grid.shape[0]),
        "lat_lon_convention": LAT_LON_CONVENTION,
        "values": flat,
    }
    if layer == "precipitation":
        if palettes is None:
            document["palette"] = [None] * grid.size
        else:
            document["palette"] = [None if item is None else str(item) for item in palettes.reshape(-1)]
    return document


def write_debug_png(path: Path, grid: np.ndarray, layer: str, scale: int = 4) -> None:
    """Grayscale of estimated values, empty cells in magenta, magnified for viewing."""
    height, width = grid.shape
    finite = np.isfinite(grid)
    image = np.zeros((height, width, 3), dtype=np.uint8)
    image[:] = (255, 0, 255)
    if finite.any():
        data = grid[finite].astype(np.float64)
        if layer == "nitrogen_oxides":
            data = np.log10(np.clip(data, 1e-8, None))
            field = np.log10(np.clip(grid, 1e-8, None))
        elif layer == "precipitation":
            data = np.log10(np.clip(data, 1e-3, None))
            field = np.log10(np.clip(grid, 1e-3, None))
        else:
            field = grid
        low, high = np.percentile(data, [2, 98])
        scaled = np.zeros(grid.shape, dtype=np.float64)
        if high > low:
            scaled[finite] = (np.asarray(field, dtype=np.float64)[finite] - low) / (high - low)
        gray = np.clip(np.round(scaled * 255), 0, 255).astype(np.uint8)
        image[finite, 0] = gray[finite]
        image[finite, 1] = gray[finite]
        image[finite, 2] = gray[finite]
    picture = Image.fromarray(image, mode="RGB")
    if scale != 1:
        picture = picture.resize((width * scale, height * scale), Image.Resampling.NEAREST)
    path.parent.mkdir(parents=True, exist_ok=True)
    picture.save(path)


def load_scale(layer: str, scale_dir: Path = SCALE_DIR) -> dict:
    path = scale_dir / layer / "scale.json"
    return json.loads(path.read_text(encoding="utf-8"))


def load_image(layer: str, image_dir: Path = IMAGE_DIR) -> np.ndarray:
    path = image_dir / f"{layer}.png"
    with Image.open(path) as image:
        return np.asarray(image.convert("RGB"))


def build_layer(
    layer: str,
    rgb: np.ndarray | None = None,
    scale: dict | None = None,
    delta_e: float | None = None,
    min_valid_fraction: float = DEFAULT_MIN_VALID_FRACTION,
    grid_height: int = GRID_HEIGHT,
    grid_width: int = GRID_WIDTH,
    overlays: list[tuple[int, int, int, int]] | None = None,
) -> tuple[dict, dict, np.ndarray, np.ndarray | None]:
    scale = scale if scale is not None else load_scale(layer)
    image = rgb if rgb is not None else load_image(layer)
    samples = samples_from_scale(scale)
    threshold = DEFAULT_DELTA_E[layer] if delta_e is None else delta_e
    boxes = OVERLAYS[layer] if overlays is None else overlays
    values, palettes = decode_rgb(image, samples, threshold, boxes)
    grid, palette_grid = downsample(values, palettes, grid_height, grid_width, min_valid_fraction)
    grid = round_grid(grid, layer)
    document = grid_document(layer, grid, palette_grid, scale)
    description = describe_grid(layer, grid, palette_grid, scale)
    return document, description, grid, palette_grid


def atomic_write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(text, encoding="utf-8")
    temporary.replace(path)


def write_layer_files(
    layer: str,
    document: dict,
    description: dict,
    grid: np.ndarray,
    output_dir: Path = GRID_DIR,
) -> None:
    atomic_write_text(
        output_dir / f"{layer}.json",
        json.dumps(document, separators=(",", ":"), allow_nan=False),
    )
    atomic_write_text(
        output_dir / f"{layer}.description.json",
        json.dumps(description, indent=2, allow_nan=False) + "\n",
    )
    write_debug_png(output_dir / "debug" / f"{layer}.png", grid, layer)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build 1-degree value grids from EIC map images and color scales.")
    parser.add_argument("--layer", action="append", choices=list(LAYER_TITLES), help="Layer to build. Repeatable. Default: all five.")
    parser.add_argument("--delta-e", type=float, default=None, help="CIE76 Delta-E match threshold for every selected layer.")
    parser.add_argument("--min-valid-fraction", type=float, default=DEFAULT_MIN_VALID_FRACTION, help="Minimum share of source pixels that must match. Default: 0.30.")
    parser.add_argument("--image-dir", type=Path, default=IMAGE_DIR)
    parser.add_argument("--scale-dir", type=Path, default=SCALE_DIR)
    parser.add_argument("--output-dir", type=Path, default=GRID_DIR)
    parser.add_argument("--no-debug", action="store_true", help="Skip the magenta-null debug PNG.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    layers = args.layer or list(LAYER_TITLES)
    failed = False
    for layer in layers:
        print(f"building {layer}...")
        try:
            scale = load_scale(layer, args.scale_dir)
            image = np.asarray(Image.open(args.image_dir / f"{layer}.png").convert("RGB"))
            document, description, grid, _palettes = build_layer(
                layer,
                rgb=image,
                scale=scale,
                delta_e=args.delta_e,
                min_valid_fraction=args.min_valid_fraction,
            )
            if args.no_debug:
                atomic_write_text(args.output_dir / f"{layer}.json", json.dumps(document, separators=(",", ":"), allow_nan=False))
                atomic_write_text(
                    args.output_dir / f"{layer}.description.json",
                    json.dumps(description, indent=2, allow_nan=False) + "\n",
                )
            else:
                write_layer_files(layer, document, description, grid, args.output_dir)
        except Exception as exc:  # one bad layer should not hide the others
            failed = True
            print(f"  failed: {exc}")
            continue
        finite = int(np.isfinite(grid).sum())
        print(
            f"  range {document['value_min']} .. {document['value_max']} {document['units']}; "
            f"cells {finite}/{grid.size}; coverage {description['coverage_percent']}%; "
            f"scale_verification {document['scale_verification']}"
        )
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
