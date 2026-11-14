#!/usr/bin/env python3
"""Discover, extract, and cautiously calibrate NASA EIC scientific color legends.

Downloads are read-only with respect to source files and isolated to output/. No
Agent 1 script is imported or run. Unknown values are never guessed.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
from typing import Any

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from legend import Box, decode_image, detect_categorical_legend, find_gradient_regions, parse_crop, sample_gradient
from nasa_sources import discover_colorbars, fetch, page_title, video_frame
from nasa_extractors import precipitation, modern, active_fires_image


def base_result(category: str, metadata: dict[str, Any]) -> dict:
    return {
        "schema_version": "1.0", "category": category, "status": "not_extracted",
        "source_url": metadata["source_url"],
        "validated_source_url": metadata.get("validated_source_url", metadata["source_url"]),
        "page_title": None, "scientific_variable": metadata["scientific_variable"],
        "variable_verification": "unknown", "units": metadata["units"],
        "legend_type": None, "classification": "unknown", "scale_type": "unknown",
        "scale_verification": "unknown", "numerical_range": None, "tick_labels": [],
        "legends": [], "sampled_rgb_colors": [], "value_mapping": [],
        "numeric_interpolation_supported": False, "interpolation_method": None,
        "extraction_method": None, "source_asset_url": None, "source_image_path": None,
        "colorbar_bounding_box": None,
        "extraction_timestamp": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "verification_status": "unknown",
        "warnings": [metadata[key] for key in ("source_mismatch", "short_description_mismatch") if metadata.get(key)],
        "limitations": ["RGB samples alone do not establish a scientific color-to-value mapping."],
        "source_notes": {}, "ocr": {"available": False, "labels": [], "requires_review": True},
    }


def validate_title(result: dict, source_url: str, timeout: int) -> bytes:
    html, _ = fetch(source_url, timeout)
    title = page_title(html)
    result["page_title"] = title
    expected = {"precipitation": "precipitation", "active_fires": "active fires",
                "carbon_monoxide": "carbon monoxide", "nitrogen_oxides": "nitrogen oxides",
                "near_surface_temperature": "near-surface temperature"}[result["category"]]
    if not title or expected not in title.lower():
        raise ValueError(f"NASA source does not validate {result['category']}: {title!r}")
    result["variable_verification"] = "verified"
    return html


def ocr_read(image_path: Path) -> dict:
    """Optional OCR diagnostics only; never imported unless explicitly enabled."""
    try:
        from rapidocr_onnxruntime import RapidOCR
    except ImportError:
        return {"available": False, "labels": [], "requires_review": True,
                "note": "Install optional OCR requirements on supported Python versions, or inspect source labels manually."}
    import numpy as np
    from PIL import Image
    a = np.asarray(Image.open(image_path).convert("RGBA")).copy()
    # Opaque white lettering is invisible when the transparent original is pasted
    # on white. Black helps recover the NASA EIC text; confidence remains unverified.
    black = (a[:, :, :3] * (a[:, :, 3:4] / 255.0)).astype("uint8")
    try:
        rows, _ = RapidOCR()(black)
    except Exception as error:
        return {"available": True, "labels": [], "requires_review": True, "error": str(error)}
    return {"available": True, "requires_review": True,
            "labels": [{"text": str(text), "confidence": float(confidence), "bbox": box}
                       for box, text, confidence in (rows or [])],
            "note": "Diagnostic raw OCR only; it does not verify scale units, values, or linearity."}





def image_fallback(category: str, result: dict, path: Path, crop: str | None,
                   max_samples: int, ocr: bool) -> None:
    """Read-only lower-priority image extraction; never claim numeric mapping."""
    # __IMAGE_UNITS_NONE__: a source image supplies no unit without a validated
    # label and context; inherited config values must not contaminate unknowns.
    result["units"] = None
    try:
        image = decode_image(path.read_bytes())
    except (OSError, ValueError) as exc:
        result["warnings"].append(f"Source image unreadable: {exc}")
        return
    result["source_image_path"] = str(path.resolve())
    if crop:
        try:
            bounds = parse_crop(crop, image.size)
        except ValueError as exc:
            result["warnings"].append(str(exc))
            return
        current = image.crop(tuple(bounds.as_list()))
        box = Box(0, 0, current.width, current.height)
        absolute = bounds.as_list()
        method = "source_image_manual_crop"
    else:
        candidates = find_gradient_regions(image)
        if not candidates:
            swatches = detect_categorical_legend(image)
            if swatches:
                image.save(result["_output"] / "colorbar.png")
                result.update({"legend_type": "possible_discrete_legend", "classification": "categorical",
                               "sampled_rgb_colors": [{"rgb": s["rgb"]} for s in swatches],
                               "verification_status": "unknown", "status": "uncalibrated_palette_extracted",
                               "extraction_method": "source_image_auto_detected_discrete_swatches",
                               "colorbar_bounding_box": None})
                result["limitations"].append("Unlabeled discrete RGB colors: category names/scientific meanings are unknown; no numeric mapping is available.")
            else:
                result["warnings"].append("No colorbar detected. Map color inventories are not used to invent a scale.")
            if ocr:
                result["ocr"] = ocr_read(path)
            return
        best = max(candidates, key=lambda c: c["long"])
        absolute = [best["start"], best["axis"], best["end"], best["axis"] + 1] if best["orientation"] == "horizontal" else [best["axis"], best["start"], best["axis"] + 1, best["end"]]
        bounds = Box(*absolute)
        current = image.crop(tuple(bounds.as_list()))
        box = Box(0, 0, bounds.width, bounds.height)
        method = "source_image_auto_detected_gradient"
    orientation = "horizontal" if current.width >= current.height else "vertical"
    try:
        samples = sample_gradient(current, box, orientation, max_samples, allow_large_region=True)
    except ValueError as exc:
        result["warnings"].append(f"Colorbar sampling rejected: {exc}")
        return
    current.save(result["_output"] / "colorbar.png")
    result.update({"legend_type": "possible_continuous_colorbar", "classification": "continuous",
                   "sampled_rgb_colors": samples, "verification_status": "unknown",
                   "status": "uncalibrated_palette_extracted", "extraction_method": method,
                   "colorbar_bounding_box": absolute,
                   "limitations": result["limitations"] + ["Only RGB geometry was extracted. Units, values, and scale type remain unknown; OCR does not verify calibration.",
                        f"Visual sample direction is {orientation}, not a verified scientific direction."]})
    if ocr:
        result["ocr"] = ocr_read(path)



def extract_one(category: str, args: argparse.Namespace, metadata: dict) -> dict:
    output = args.output_dir / category
    output.mkdir(parents=True, exist_ok=True)
    result = base_result(category, metadata)
    result["_output"] = output
    try:
        html = validate_title(result, result["validated_source_url"], args.timeout)
        if category == "carbon_monoxide":
            supplied_html, _ = fetch(metadata["source_url"], args.timeout)
            original_title = page_title(supplied_html)
            result["source_notes"]["supplied_url_title"] = original_title
            result["source_notes"]["supplied_url_validation"] = "mismatch_co2_not_co" if original_title and "carbon dioxide" in original_title.lower() else "needs_review"
        assets = discover_colorbars(html, result["validated_source_url"])
        fetcher = lambda url: fetch(url, args.timeout)
        if category == "precipitation":
            precipitation(result, assets, fetcher, output)
        elif category in {"carbon_monoxide", "nitrogen_oxides", "near_surface_temperature"}:
            modern(result, assets, fetcher, output, args.max_samples)
        elif category == "active_fires":
            from bs4 import BeautifulSoup
            from urllib.parse import urljoin
            import hashlib
            movie = next((a for a in BeautifulSoup(html, "html.parser").find_all("a", href=True)
                          if a["href"].endswith("fires_frp_VIIRS_2048p30.mp4")), None)
            if movie is None:
                raise ValueError("primary active-fires video not linked")
            movie_url = urljoin(result["validated_source_url"], movie["href"])
            output.joinpath(".cache").mkdir(exist_ok=True)
            cached = output / ".cache" / "primary_frame.png"
            # Use cached frame unless --force requests fresh official media.
            if not cached.exists() or (args.force and args.fire_frame is not None):
                if args.fire_frame:
                    data = args.fire_frame.read_bytes()
                else:
                    video_bytes, _ = fetch(movie_url, args.probe_timeout)
                    data = video_frame(video_bytes, 0.25, args.probe_timeout)
                cached.write_bytes(data)
            else:
                data = cached.read_bytes()
            active_fires_image(result, data, movie_url, output, args.max_samples,
                               hashlib.sha256(data).hexdigest())
        if args.ocr and isinstance(result["source_asset_url"], str) and (output / "colorbar.png").exists():
            result["ocr"] = ocr_read(output / "colorbar.png")
    except Exception as exc:
        if args.verbose:
            import traceback
            traceback.print_exc()
        result["units"] = None
        result["variable_verification"] = "unknown"
        result["warnings"].append(f"Official extraction unavailable: {type(exc).__name__}: {exc}")
        path = args.image_dir / f"{category}.png"
        if path.exists():
            image_fallback(category, result, path, args.crop, args.max_samples, args.ocr)
        else:
            result["warnings"].append(f"No source image found at {path}")
    if result.get("source_notes", {}).get("supplied_url_title") is not None:
        result["supplied_url_page_title"] = result["source_notes"]["supplied_url_title"]
        result["supplied_url_validation"] = result["source_notes"].get("supplied_url_validation", "unknown")
    if result["category"] == "precipitation":
        result["colorbar_bounding_box"] = [legend["colorbar_bounding_box"] for legend in result["legends"]]
    if result["status"] == "not_extracted":
        result["status"] = "failed"
    # This explicit null discipline applies to fallback and failure alike.
    result["scale_found"] = result["status"] not in {"not_extracted", "failed"}
    result["numerical_values_verified"] = result.get("scale_verification") == "verified"
    result["orientation"] = next((legend.get("orientation") for legend in result["legends"]), None)
    if result["legend_type"] and "colorbar" in result["legend_type"]:
        result["orientation"] = "horizontal"
    if result["sampled_rgb_colors"]:
        result["value_direction"] = "left-to-right along displayed colorbar; categorical interval order for discrete legends"
    else:
        result["value_direction"] = None
    if result["verification_status"] == "unknown":
        result["units"] = None
        result["numerical_range"] = None
        result["tick_labels"] = []
        result["scale_found"] = False
        result["numeric_interpolation_supported"] = False
        result["interpolation_method"] = None
    del result["_output"]
    with output.joinpath("scale.json").open("w", encoding="utf-8") as handle:
        json.dump(result, handle, indent=2, ensure_ascii=False, allow_nan=False)
        handle.write("\n")
    print(f"[{category}] {result['status']}; scientific calibration: {result['scale_verification']}", flush=True)
    return result


def run(args: argparse.Namespace) -> int:
    config = json.loads(args.config.read_text(encoding="utf-8"))
    categories = config.get("categories", {})
    selected = [args.category] if args.category else list(categories)
    if not isinstance(categories, dict) or any(category not in categories for category in selected):
        raise ValueError(f"unknown category {args.category!r}; available: {', '.join(categories)}")
    if args.max_samples < 2:
        raise ValueError("--max-samples must be at least 2")
    for category in selected:
        extract_one(category, args, categories[category])
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--category", help="one corrected category; default all five")
    parser.add_argument("--image-dir", type=Path, default=Path("data/images"), help="read-only alternative visualization inputs; never automatically downloaded")
    parser.add_argument("--output-dir", type=Path, default=HERE / "output", help="Agent 2 outputs only")
    parser.add_argument("--config", type=Path, default=HERE / "config.json")
    parser.add_argument("--crop", help="manual read-only source-image crop x,y,width,height; used if official extraction fails")
    parser.add_argument("--fire-frame", type=Path, help="optional read-only official active-fires primary video frame (4096x2048)")
    parser.add_argument("--force", action="store_true", help="re-read the optional official fire frame; overwrite only Agent 2 outputs")
    parser.add_argument("--verbose", action="store_true")
    parser.add_argument("--ocr", action="store_true", help="optional unverified raw label diagnostics")
    parser.add_argument("--max-samples", type=int, default=128)
    parser.add_argument("--timeout", type=int, default=45)
    parser.add_argument("--probe-timeout", type=int, default=120)
    return parser


if __name__ == "__main__":
    try:
        raise SystemExit(run(build_parser().parse_args()))
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(2)
