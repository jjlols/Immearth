"""Build a self-contained, edge-compatible overlay viewer from local NASA images.

Usage: python build_overlay_site.py [--output overlay-site]
Only the generated site is deployed; Python is not needed by the browser.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build(output: Path, catalog: Path = ROOT / "overlay" / "layers.json") -> Path:
    with catalog.open(encoding="utf-8") as stream:
        config = json.load(stream)
    ids = [layer["id"] for layer in config["layers"]]
    if len(ids) != len(set(ids)):
        raise ValueError("Layer IDs must be unique")
    if not ids:
        raise ValueError("At least one layer is required")
    if output.resolve() in (ROOT, ROOT / "overlay"):
        raise ValueError("Output must be a separate generated directory")

    output.mkdir(parents=True, exist_ok=True)
    (output / "layers").mkdir(exist_ok=True)
    manifest = {key: value for key, value in config.items() if key not in ("layers", "sources")}
    manifest["generated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    manifest["projection"] = {
        "status": "approximate_display_alignment_only",
        "notice": "Images include varying layouts, map extents and annotations. No georeferencing, scientific data registration, or calibrated color-scale comparison is claimed.",
    }
    manifest["layers"] = []
    for requested in sorted(config["layers"], key=lambda layer: layer["order"]):
        layer = dict(requested)
        source = (catalog.parent / layer.pop("source")).resolve()
        if not source.is_relative_to(ROOT.resolve()):
            raise ValueError(f"Source must be inside the project: {source}")
        target = output / "layers" / f"{layer['id']}.webp"
        with Image.open(source) as image:
            image.load()
            if image.width < 1 or image.height < 1:
                raise ValueError(f"Empty image: {source}")
            original_size = list(image.size)
            rgb = image.convert("RGB")
            # Offline preview-only resampling; the original downloader images are unchanged.
            rgb.thumbnail((2048, 1024), Image.Resampling.LANCZOS)
            rgb.save(target, "WEBP", quality=91, method=6)
            layer.update(width=rgb.width, height=rgb.height, aspect_ratio=rgb.width / rgb.height)
        layer.update(
            url=f"layers/{layer['id']}.webp",
            source_sha256=sha256(source),
            original_size=original_size,
            visible=True,
        )
        manifest["layers"].append(layer)
    for asset in ("index.html", "overlay.css", "overlay.js"):
        shutil.copyfile(ROOT / "overlay" / asset, output / asset)
    (output / "layers.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return output


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "overlay-site")
    args = parser.parse_args()
    path = build(args.output)
    print(f"Overlay site built: {path}")
    print(f"Preview: python3 -m http.server 8000 --directory {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
