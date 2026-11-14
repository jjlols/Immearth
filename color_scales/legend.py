"""Conservative colorbar and discrete-legend extraction.

Numeric labels are deliberately separate from RGB sampling.  Pixel sampling alone
never establishes a scientific calibration.
"""
from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
import math
import re
from typing import Any, Iterable

import cv2
import numpy as np
from PIL import Image


@dataclass(frozen=True)
class Box:
    """Half-open pixel bounds: left, top, right, bottom."""
    left: int
    top: int
    right: int
    bottom: int

    @property
    def width(self) -> int:
        return self.right - self.left

    @property
    def height(self) -> int:
        return self.bottom - self.top

    def as_list(self) -> list[int]:
        return [self.left, self.top, self.right, self.bottom]


def decode_image(data: bytes | bytearray) -> Image.Image:
    """Decode untrusted image data and detach it from its byte buffer."""
    try:
        with Image.open(BytesIO(data)) as image:
            image.load()
            return image.convert("RGBA")
    except Exception as exc:
        raise ValueError("Input is not a readable raster image") from exc


def contiguous_runs(mask: np.ndarray) -> list[tuple[int, int]]:
    """Half-open runs of true pixels in a one-dimensional mask."""
    indices = np.flatnonzero(mask)
    if not len(indices):
        return []
    groups = np.split(indices, np.flatnonzero(np.diff(indices) > 1) + 1)
    return [(int(group[0]), int(group[-1]) + 1) for group in groups]


def rgb_runs(row: np.ndarray) -> list[tuple[int, int, list[int]]]:
    """Exact colorful RGB runs, excluding translucent and neutral pixels."""
    row = np.asarray(row)
    if row.ndim != 3 or row.shape[0] != 1 or row.shape[-1] != 4:
        raise ValueError("rgb_runs expects a 1 x N x 4 RGBA array")
    a = row[0]
    valid = ((a[:, 3] >= 250) & ((a[:, :3].max(axis=1).astype(np.int16) -
                                 a[:, :3].min(axis=1).astype(np.int16)) > 20))
    result = []
    for start, end in contiguous_runs(valid):
        colors = a[start:end, :3]
        changes = np.flatnonzero(np.any(np.diff(colors, axis=0) != 0, axis=1)) + start + 1
        bounds = [start, *changes.tolist(), end]
        for left, right in zip(bounds[:-1], bounds[1:]):
            result.append((left, right, a[left, :3].astype(int).tolist()))
    # Be robust to tiny compression/text holes without merging different colors.
    out: list[tuple[int, int, list[int]]] = []
    for start, end, color in result:
        if out and out[-1][2] == color and start - out[-1][1] <= 2:
            out[-1] = (out[-1][0], end, color)
        else:
            out.append((start, end, color))
    return out


def colorful_components(image: Image.Image) -> list[tuple[Box, float]]:
    """Return connected high-saturation components and a cautious shape score."""
    array = np.asarray(image)
    saturation = array[:, :, :3].max(axis=2).astype(np.int16) - array[:, :, :3].min(axis=2).astype(np.int16)
    colored = ((saturation > 25) & (array[:, :, 3] > 100)).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(colored, connectivity=8)
    found = []
    for x, y, width, height, area in stats[1:]:
        width, height, area = map(int, (width, height, area))
        if area < 50 or min(width, height) < 3 or max(width, height) < 24:
            continue
        box = Box(int(x), int(y), int(x) + width, int(y) + height)
        ratio = max(width / height, height / width)
        density = area / (width * height)
        score = min(math.log2(ratio + 1) / 4, 0.7) + min(density, 1) * 0.3
        found.append((box, score))
    return sorted(found, key=lambda item: item[1], reverse=True)


def sample_gradient(image: Image.Image, box: Box, orientation: str,
                    max_samples: int = 128, allow_large_region: bool = False) -> list[dict[str, Any]]:
    """Median-sample a rectangle along its long axis; preserve RGB exactly enough.

    Horizontal positions run left-to-right, vertical positions bottom-to-top. This
    describes appearance only and never supplies a calibration or scale direction.
    """
    if orientation not in {"horizontal", "vertical"}:
        raise ValueError("orientation must be horizontal or vertical")
    if (box.left < 0 or box.top < 0 or box.right > image.width or
            box.bottom > image.height or box.width < 2 or box.height < 1):
        raise ValueError("invalid crop beyond the image")
    if max_samples < 2:
        raise ValueError("max_samples must be at least 2")

    a = np.asarray(image)
    crop = a[box.top:box.bottom, box.left:box.right]
    horizontal = orientation == "horizontal"
    length = box.width if horizontal else box.height
    trim = min((box.height if horizontal else box.width) // 4, 2)
    central = crop[trim:-trim or None, :] if horizontal else crop[:, trim:-trim or None]
    median = np.median(central, axis=0 if horizontal else 1)
    # Neutral RGB points are valid gradient colors, but large transparent
    # margins or interiors are not. Require coverage and several actual colors.
    colorful = (median[:, :3].max(axis=1) - median[:, :3].min(axis=1)) > 2
    good_lines = np.flatnonzero(colorful | (median[:, 3] >= 250))
    if not len(good_lines):
        raise ValueError("crop does not contain an opaque chromatic colorbar")
    if np.count_nonzero(median[good_lines, 3] >= 250) < max(4, int(0.7 * length)):
        raise ValueError("too much transparency in the proposed colorbar")
    first, last = good_lines[0], good_lines[-1]
    opaque_colors = median[median[:, 3] >= 250, :3].astype(int)
    _, counts = np.unique(opaque_colors, axis=0, return_counts=True)
    # Many adjacent offsets demonstrate even coverage even when compression
    # collapses RGB triplets; constant one-color borders are caught by spread.
    spread = np.ptp(opaque_colors, axis=0).sum() if len(opaque_colors) else 0
    changes = np.any(np.diff(median[:, :3], axis=0) != 0, axis=1)
    if spread < 25 or changes.mean() < 0.25 or int(last - first + 1) < min(16, length // 3 + 1):
        raise ValueError("region lacks enough distinct contiguous colors for a continuous gradient")
    if not allow_large_region and (box.width * box.height > image.width * image.height * 0.5 or
            max(box.width / box.height, box.height / box.width) > 20):
        raise ValueError("automatic extraction requires a thin elongated candidate; use --crop for a manual override")
    first, last = int(good_lines[0]), int(good_lines[-1])
    indices = np.unique(np.linspace(first, last, min(max_samples, last - first + 1)).round().astype(int))
    if orientation == "vertical":
        indices = indices[::-1]
    return [{"position": round(i / max(1, len(indices) - 1), 6),
             "pixel_offset": int(offset),
             "rgb": np.rint(median[offset, :3]).astype(int).tolist(),
             "alpha": int(np.rint(median[offset, 3]))}
            for i, offset in enumerate(indices)]


def find_gradient_regions(image: Image.Image) -> list[dict[str, Any]]:
    """Find repetitive long gradient rectangles without collecting map palettes."""
    a = np.asarray(image)
    rgb = a[:, :, :3].astype(np.int16)
    chromatic = (rgb.max(axis=2) - rgb.min(axis=2)) > 20
    background = (a[:, :, 3] < 15) | ((rgb.min(axis=2) >= 245) & (a[:, :, 3] >= 250))
    candidates = []
    for orientation in ("horizontal", "vertical"):
        for axis in range(image.height if orientation == "horizontal" else image.width):
            if orientation == "horizontal":
                saturated, blank, line = chromatic[axis], background[axis], a[axis]
            else:
                saturated, blank, line = chromatic[:, axis], background[:, axis], a[:, axis]
            for start, end in contiguous_runs(saturated | blank):
                segment = line[start:end]
                opaque = segment[:, 3] >= 250
                if end - start < 24 or opaque.sum() < 16:
                    continue
                unique = len(np.unique(segment[opaque, :3], axis=0))
                if unique < 16:
                    continue
                colorful_indices = np.flatnonzero(saturated[start:end])
                if len(colorful_indices) < 16:
                    continue
                first, last = start + int(colorful_indices[0]), start + int(colorful_indices[-1]) + 1
                if last - first >= 24:
                    candidates.append({"orientation": orientation, "long": last - first,
                                       "axis": axis, "start": first, "end": last})
    return candidates


def detect_categorical_legend(image: Image.Image, box: Box | None = None,
                               min_swatch: int = 4) -> list[dict[str, Any]]:
    """Read equally-sized discrete RGB swatches from candidate row/column strips.

    No category labels are inferred from colors: the returned swatches need labels
    or documentation from a source before receiving any scientific meaning.
    """
    if box is None:
        components = colorful_components(image)
        if not components:
            return []
        box = components[0][0]
    a = np.asarray(image.crop((box.left, box.top, box.right, box.bottom)))
    for axis in (0, 1):  # 0: horizontal row runs; 1: vertical column runs
        strip = np.median(a, axis=axis)
        if axis == 1:
            strip = np.rot90(strip, 2)
        runs = rgb_runs(strip.astype(np.uint8)[None, :, :])
        runs = [run for run in runs if run[1] - run[0] >= min_swatch]
        if len(runs) >= 2 and max(e - s for s, e, _ in runs) <= 4 * min(e - s for s, e, _ in runs):
            return [{"rgb": color, "start": start, "end": end} for start, end, color in runs]
    return []


def parse_crop(value: str, image_size: tuple[int, int]) -> Box:
    """Parse x,y,width,height; reject accidental absolute right/bottom coordinates."""
    try:
        left, top, width, height = map(int, value.split(","))
        box = Box(left, top, left + width, top + height)
    except ValueError as exc:
        raise ValueError("crop must be x,y,width,height with integer coordinates") from exc
    if min(left, top) < 0 or width < 2 or height < 2 or box.right > image_size[0] or box.bottom > image_size[1]:
        raise ValueError(f"crop {value!r} is outside the {image_size[0]}x{image_size[1]} image")
    return box


def normalize_scientific_label(text: str) -> float | None:
    """Parse numeric labels conservatively; never guess from unvalidated text."""
    cleaned = text.strip().replace("−", "-").replace("–", "-").replace(" ", "")
    match = re.fullmatch(r"([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:\^|\*\*)([+-]?\d+)", cleaned)
    try:
        value = float(match.group(1)) ** int(match.group(2)) if match else float(cleaned)
    except ValueError:
        return None
    return value if math.isfinite(value) else None


def infer_numeric_scale(ticks: Iterable[dict[str, Any]]) -> str:
    ticks = list(ticks)
    if len(ticks) < 2:
        return "unknown"
    values = [tick.get("value") for tick in ticks]
    if any(value is None for value in values):
        return "unknown"
    values = [float(value) for value in values]
    if any(a > b for a, b in zip(values, values[1:])) and any(a < b for a, b in zip(values, values[1:])):
        return "unknown"
    if all(a >= b for a, b in zip(values, values[1:])):
        values = values[::-1]
    if all(a > 0 for a in values):
        logs = np.diff(np.log10(values))
        if np.allclose(logs, logs[0], rtol=0.02, atol=0.01):
            return "logarithmic"
    delta = np.diff(values)
    return "linear" if np.allclose(delta, delta[0], rtol=0.02, atol=0.01) else "nonlinear"
