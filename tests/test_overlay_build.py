"""Focused tests for the separate overlay package; avoids downloader test fixtures."""
import importlib.util
import json
from pathlib import Path

import pytest
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("build_overlay_site", ROOT / "build_overlay_site.py")
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)


def catalog(tmp_path, layers=None):
    layers = layers if layers is not None else [
        {"id": "first", "label": "First", "source": "images/first.png", "order": 1, "color": "#fff", "opacity": .8},
        {"id": "second", "label": "Second", "source": "images/second.png", "order": 0, "color": "#000", "opacity": .5},
    ]
    for layer in layers:
        source = tmp_path / layer["source"]
        source.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (64, 32), "navy").save(source)
    path = tmp_path / "layers.json"
    path.write_text(json.dumps({"version": 1, "layers": layers}))
    return path


def test_build_writes_independent_assets_and_manifest(tmp_path, monkeypatch):
    monkeypatch.setattr(module, "ROOT", tmp_path)
    for name in ("index.html", "overlay.css", "overlay.js"):
        (tmp_path / "overlay" / name).parent.mkdir(exist_ok=True)
        (tmp_path / "overlay" / name).write_text(name)
    result = module.build(tmp_path / "output", catalog(tmp_path))
    assert (result / "index.html").is_file()
    manifest = json.loads((result / "layers.json").read_text())
    assert [layer["id"] for layer in manifest["layers"]] == ["second", "first"]
    for layer in manifest["layers"]:
        assert layer["url"] == f"layers/{layer['id']}.png"
        assert layer["original_size"] == [64, 32]
        assert layer["source_sha256"]
        assert layer["visible"]
        assert Image.open(result / layer["url"]).format == "PNG"
    assert "not georeferenced" not in manifest["projection"]["status"]
    assert "not_georeferencing" not in manifest["projection"]["status"]
    assert "approximate" in manifest["projection"]["status"]


def test_duplicate_layer_ids_are_rejected(tmp_path):
    layers = [
        {"id": "same", "source": "images/first.png", "order": 0},
        {"id": "same", "source": "images/second.png", "order": 1},
    ]
    with pytest.raises(ValueError, match="unique"):
        module.build(tmp_path / "out", catalog(tmp_path, layers))


def test_source_outside_sandbox_and_corrupt_input_are_rejected(tmp_path):
    outside = tmp_path.parent / "untrusted-outside.png"
    Image.new("RGB", (2, 2)).save(outside)
    with pytest.raises(ValueError, match="inside the project"):
        module.build(tmp_path / "out", catalog(tmp_path, [{"id": "outside", "source": str(outside), "order": 0}]))
    path = tmp_path / "images/broken.png"
    path.parent.mkdir(exist_ok=True)
    path.write_bytes(b"bad image")
    with pytest.raises(Exception):
        module.build(tmp_path / "out", catalog(tmp_path, [{"id": "broken", "source": "images/broken.png", "order": 0}]))


def test_catalog_keeps_correct_metric_and_replaces_no_source_data():
    config = json.loads((ROOT / "overlay" / "layers.json").read_text())
    ids = [layer["id"] for layer in config["layers"]]
    assert "carbon_monoxide" in ids and "carbon_dioxide" not in ids
    for layer in config["layers"]:
        assert (ROOT / "overlay" / layer["source"]).resolve().is_file()
