"""Reviewed official SVS legend extractors.

Coordinates are tied to SHA-256 checked source rasters; changing assets cause an
error, never a silently reused calibration. Values are from reviewed tick labels,
not OCR guesses. Scale forms remain estimates absent a NASA lookup table.
"""
from __future__ import annotations

import math
from pathlib import Path
from typing import Any

from legend import Box, decode_image, find_gradient_regions, rgb_runs, sample_gradient

# Actual hashes of the five reviewed official source assets.
ASSET_SHA256 = {
    "rainbarblack2.png": "142cc28a613e7ff5a3e16e2d5664b0146909fc841f8d41f66da96ecfb757f436",
    "snowbarblack2.png": "8b302edb6c888ef95b8454aefa627edc1426b04eabc00f628b9c488f9eb7d99a",
    "CO_colorbar_plain.png": "1276d434479aac89389ebec4f83fcaddb8aa10fdc9c7d7cb2b14dc7c466c402a",
    "NOx_colorbar_plain.png": "5de4896471babd79e37faf0e02eb6dfe8071708577c1d2a0c626535c7e656c3d",
    "NearSurfaceTemperature_colorbar_plain.png": "fbb01d8f9137621636304c0bddd168c180644d6c79f6e2b6329dde6a8c615c9b",
}


def select_asset(assets: list[dict], name: str) -> dict:
    asset = next((a for a in assets if a["url"].endswith("/" + name)), None)
    if not asset:
        raise ValueError(f"NASA page no longer links the official {name} colorbar")
    return asset


def reviewed_asset(asset: dict, fetcher, name: str, sha256: str) -> bytes:
    data, _ = fetcher(asset["url"])
    import hashlib
    actual = hashlib.sha256(data).hexdigest()
    if actual != sha256:
        raise ValueError(f"official asset {name} changed; manually review pixels/ticks before using stored calibration")
    return data


def numeric_ticks(values: list[float], pixels: list[float], qualitative: tuple[str, str]) -> list[dict]:
    return [{"label": format(value, "g"), "value": value,
             "pixel_position": pixel, "position_source": "reviewed NASA raster tick anchor",
             "qualitative_extension": qualitative[0 if index == 0 else 1] if index in (0, len(values) - 1) else None}
            for index, (value, pixel) in enumerate(zip(values, pixels))]


def precipitation(result: dict[str, Any], assets: list[dict], fetcher, output: Path) -> None:
    bins = [0.1, 0.2, 0.3, 0.5, 1.0, 2.0, 3.0, 5.0, 10.0, 20.0, 50.0]
    for kind, name in (("liquid", "rainbarblack2.png"), ("frozen", "snowbarblack2.png")):
        asset = select_asset(assets, name)
        data = reviewed_asset(asset, fetcher, name, ASSET_SHA256[name])
        image = decode_image(data)
        output.joinpath(f"colorbar_{kind}.png").write_bytes(data)
        # Exact-color runs on a row through ten 36px intervals and the 14px
        # overflow extension. A separate gray/no-rain swatch is not recolored.
        import numpy as np
        runs = rgb_runs(np.asarray(image.crop((40, 36, 420, 37)))[:, :, :])
        runs = [r for r in runs if r[1] - r[0] >= 14]
        if len(runs) != 11 or any(abs((end - start) - 36) > 2 for start, end, _ in runs[:10]):
            raise ValueError("precipitation palette geometry changed; review needed")
        categories = []
        for index, (_, _, color) in enumerate(runs):
            # The OCR-reviewed tick i sits on the LEFT edge of run i (0.1 at
            # x=40, 0.2 at x=76, ..., 50 at x=400), so run i covers bins[i] to
            # bins[i + 1] and the narrow arrow after the last tick is the
            # overflow. The grey swatch left of 0.1 is not one of these runs.
            # NASA's raster doesn't formally establish <= vs <; document approximation.
            if index == 10:
                meaning = "overflow at or above 50 mm/hour (left endpoint approximate; right side unbounded)"
            else:
                meaning = f"between {bins[index]} and {bins[index + 1]} mm/hour"
            categories.append({"category_index": index, "rgb": color, "description": meaning,
                               "lower_bound": bins[index],
                               "upper_bound": None if index == 10 else bins[index + 1],
                               "left_tick_approximate": True, "right_tick_approximate": True,
                               "tick_is_at_bin_left_edge": True})
        for index, category in enumerate(categories):
            # NASA's snow bar draws the 20-50 block and the overflow arrow in one
            # RGB, so a map pixel of that color cannot tell them apart.
            shared = [other["category_index"] for other in categories
                      if other is not category and tuple(other["rgb"]) == tuple(category["rgb"])]
            if shared:
                category["rgb_shared_with_categories"] = shared
        ticks = numeric_ticks(bins, [40 + 36 * i for i in range(11)], ("below scale", "overflow"))
        result["legends"].append({"name": kind, "units": "mm/hour", "scale_type": "logarithmic_bins_with_overflow",
                                  "source_asset_url": asset["url"], "source_asset_sha256": ASSET_SHA256[name],
                                  "colorbar_image": f"colorbar_{kind}.png", "orientation": "horizontal", "colorbar_bounding_box": [40, 29, 420 if kind == "frozen" else 440, 74],
                                  "categories": categories, "tick_labels": ticks})
    result.update({"legend_type": "multiple_discrete_colorbars", "classification": "categorical",
                   "scale_type": "logarithmic/irregular bins with overflow", "scale_verification": "estimated",
                   "numerical_range": {"minimum_labeled_boundary": 0.1, "maximum_labeled_boundary": 50.0, "overflow_unbounded": True},
                   "tick_labels": result["legends"][0]["tick_labels"], "sampled_rgb_colors": [
                       {"legend": legend["name"], "rgb": category["rgb"], "category": category["description"]}
                       for legend in result["legends"] for category in legend["categories"]],
                   "value_mapping": [], "numeric_interpolation_supported": False, "interpolation_method": None,
                   "status": "extracted", "verification_status": "estimated",
                   "extraction_method": "official_standalone_discrete_colorbars_exact_rgb_runs",
                   "source_asset_url": [select_asset(assets, name)["url"] for name in ("rainbarblack2.png", "snowbarblack2.png")]})
    result["limitations"] += [
        "NASA supplied ten regular rain/snow interval patches plus an overflow extension; interval boundary inclusivity is not encoded in official metadata.",
        "A separate grey swatch exists on the left and may indicate no rain/missing/other; no numeric meaning is assigned.",
        "Each tick marks the left edge of its colored block: block 1 is 0.1-0.2 mm/hour and the block after the 20 tick is 20-50 mm/hour; only the arrow is overflow.",
        "The frozen bar uses one RGB (140, 20, 156) for both the 20-50 mm/hour block and the overflow arrow; a pixel of that color is at least 20 mm/hour with no upper bound.",
        "Numeric bins were read and manually reviewed from official raster labels. No authoritative machine-readable mapping was found.",
    ]


def modern(result: dict[str, Any], assets: list[dict], fetcher, output: Path, max_samples: int) -> None:
    config = {
        "carbon_monoxide": ("CO_colorbar_plain.png", [40, 100, 130, 200, 500], [69, 188.5, 279.5, 370.5, 464], "nonlinear"),
        "nitrogen_oxides": ("NOx_colorbar_plain.png", [0.001, 0.01, 0.1, 1.0, 10.0], [71, 176.5, 280.5, 358.5, 439], "logarithmic"),
        "near_surface_temperature": ("NearSurfaceTemperature_colorbar_plain.png", [-40, -20, -10, 0, 10, 20, 30, 40], [72, 121.5, 170.5, 218.5, 268.5, 316.5, 365.5, 463.5], "linear"),
    }[result["category"]]
    name, values, tick_x, scale_type = config
    asset = select_asset(assets, name)
    data = reviewed_asset(asset, fetcher, name, ASSET_SHA256[name])
    image = decode_image(data)
    candidates = [c for c in find_gradient_regions(image) if c["orientation"] == "horizontal" and c["long"] > 250]
    if not candidates:
        raise ValueError("clean gradient not detected in official asset")
    first = min(candidates, key=lambda c: c["axis"])
    # Drop the outermost white/no-rain or qualitative extension by tick marks,
    # clip precisely from tick-defined start to end instead of global chroma.
    box = Box(int(math.floor(tick_x[0])), first["axis"], int(math.ceil(tick_x[-1])) + 1, first["axis"] + 1)
    samples = sample_gradient(image, box, "horizontal", max_samples, allow_large_region=True)
    ticks = numeric_ticks(values, tick_x, (("low", "high") if result["category"] != "near_surface_temperature" else ("very cold", "very hot")))
    xmin, xmax = tick_x[0], tick_x[-1]
    for tick in ticks:
        tick["position"] = (tick["pixel_position"] - box.left) / box.width
        tick["position_source"] = "approximate reviewed raster pixel, subject to 1px boundaries"
    estimates = []
    for sample in samples:
        pixel_x = sample["pixel_offset"] + box.left
        fraction = (pixel_x - xmin) / (xmax - xmin)
        for low, high, p0, p1 in zip(values[:-1], values[1:], tick_x[:-1], tick_x[1:]):
            if p0 <= pixel_x <= p1:
                f = (pixel_x - p0) / (p1 - p0)
                value = 10 ** (math.log10(low) + f * (math.log10(high) - math.log10(low))) \
                    if scale_type == "logarithmic" else low + f * (high - low)
                estimates.append({"rgb": sample["rgb"], "value": value, "pixel_position": pixel_x,
                                  "anchor_low": low, "anchor_high": high,
                                  "verification_status": "estimated"})
                break
    output.joinpath("colorbar.png").write_bytes(data)
    result.update({"legend_type": "continuous_colorbar", "classification": "continuous", "scale_type": scale_type,
                   "scale_verification": "estimated", "numerical_range": {"minimum": values[0], "maximum": values[-1], "scope": "first/last labeled tick, with possible outside extensions"},
                   "tick_labels": ticks, "sampled_rgb_colors": samples, "value_mapping": [],
                   "estimated_value_mapping": estimates, "numeric_interpolation_supported": True,
                   "interpolation_method": "estimated piecewise linear between reviewed tick anchors" if scale_type != "logarithmic" else "estimated piecewise log10 between reviewed tick anchors; assumes uniform hue mapping",
                   "verification_status": "estimated", "status": "extracted",
                   "extraction_method": "official_standalone_colorbar_reviewed_gradient_sampling",
                   "source_asset_url": asset["url"], "source_asset_sha256": ASSET_SHA256[name],
                   "colorbar_bounding_box": box.as_list(),
                   "source_notes": {**result.get("source_notes", {}), "tick_source": "Manual pixel/text review, not OCR", "raw_sample_direction": "left-to-right",
                                    "qualitative_extensions_outside_mapping": True}})
    result["limitations"] += [
        "The official asset is a raster, not an authoritative color-to-value lookup table; interpolation is approximate and available only between the first/last labeled tick.",
        "Qualitative endpoints or out-of-range extensions are not mapped to measurements.",
    ]
    if result["category"] == "near_surface_temperature":
        result["limitations"].append("The detailed text and T2M title identify a 2m field; the short SVS caption says 3m. This inconsistency is preserved, not silently resolved.")


def active_fires_image(result: dict[str, Any], image_bytes: bytes, asset_url: str,
                       output: Path, max_samples: int, source_sha256: str) -> None:
    """Extract the legend crop from a frame of the primary official video."""
    from PIL import Image
    image = decode_image(image_bytes)
    if image.size != (4096, 2048):
        raise ValueError("reviewed active-fires crop requires a 4096x2048 primary video frame")
    outer = Box(55, 1795, 630, 1975)
    image.crop(tuple(outer.as_list())).save(output / "colorbar.png")
    # The actual red-to-white bar ends after the last displayed 8.0 tick,
    # extending a few pixels beyond 8 (not calibrated beyond the label).
    bar = Box(98, 1898, 585, 1899)
    samples = sample_gradient(image, bar, "horizontal", max_samples, allow_large_region=True)
    values = [0.0, 2.0, 4.0, 6.0, 8.0]
    # Leftmost 0.0 tick is at the bar's left end; the 8.0 tick x585 sits
    # before the white right end, so no extrapolation occurs after that tick.
    tick_x = [98, 218.5, 341, 461.5, 585]
    ticks = numeric_ticks(values, [x - bar.left for x in tick_x], ("", "high"))
    for tick in ticks:
        tick["position"] = tick["pixel_position"] / bar.width
        tick["pixel_position"] += bar.left
    estimates = []
    for sample in samples:
        x = bar.left + sample["pixel_offset"]
        if tick_x[0] <= x <= tick_x[-1]:
            span = next((i for i in range(4) if tick_x[i] <= x <= tick_x[i + 1]), 3)
            a, b = tick_x[span], tick_x[span + 1]
            f = max(0.0, min(1.0, (x - a) / (b - a)))
            value = values[span] + f * 2.0
            estimates.append({"rgb": sample["rgb"], "value": value, "pixel_position": x,
                              "verification_status": "estimated"})
    result.update({"legend_type": "continuous_colorbar", "classification": "continuous",
                   "scale_type": "linear", "scale_verification": "estimated",
                   "numerical_range": {"minimum": 0.0, "maximum": 8.0,
                                       "beyond_last_labeled_tick": "Unlabeled white extension; not numerically mapped"},
                   "tick_labels": ticks, "sampled_rgb_colors": samples,
                   "value_mapping": [], "estimated_value_mapping": estimates,
                   "numeric_interpolation_supported": True,
                   "interpolation_method": "estimated linear between displayed 0,2,4,6,8 tick anchors",
                   "verification_status": "estimated", "status": "extracted_from_official_video",
                   "extraction_method": "official_primary_video_frame_manual_legend_crop",
                   "source_asset_url": asset_url, "source_frame_sha256": source_sha256,
                   "colorbar_bounding_box": bar.as_list(),
                   "source_notes": {"full_frame_dimensions": [4096, 2048], "legend_crop_box": outer.as_list(),
                                    "legend_crop_colorbar_box": [bar.left - outer.left, bar.top - outer.top, bar.right - outer.left, bar.bottom - outer.top],
                                    "official_standalone_colorbar_found": False,
                                    "frame_retrieval": "Independent official SVS video, not Agent 1 downloader"},
                   "units": "MW"})
    result["limitations"] += ["The page offers no standalone colorbar. This is a crop from the primary visualization movie and its ticks, not an authoritative numeric color table.",
                              "The moving five-day FRP visualization is distinct from categorical fire detections; units are MW. The rightmost white extension beyond the 8.0 label is uncalibrated."]
