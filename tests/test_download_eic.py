import io
import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest
import requests
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import download_eic as downloader

CATEGORY = downloader.CATEGORIES[0]
LATEST = "https://svs.gsfc.nasa.gov/path/imergert_composite.now.png"
VIDEO = "https://svs.gsfc.nasa.gov/path/main.mp4"


def html_for(groups: str) -> str:
    return f'<html><h1 id="title">Near Real-Time Global Precipitation</h1><div>{groups}</div></html>'


def latest_group() -> str:
    return f'''<section id="media_group_latest"><p>An image of the most currently available global precipitation data.</p>
      <picture><source srcset="lowest.png" /></picture>
      <a href="preview_print.jpg">preview_print.jpg (8000x4000)</a>
      <a href="map.png">map.png (1920x1080)</a>
      <a href="imergert_alpha.now.png">imergert_alpha.now.png (9999x9999)</a>
      <a href="{LATEST}">global_latest.png (4096x2048) [6 MB]</a></section>'''


def video_group() -> str:
    return f'''<section id="media_group_top"><video poster="NOT-A-FRAME.jpg">
       <source src="{VIDEO}" type="video/mp4" /></video><p>Primary global animation</p>
       <a href="{VIDEO}">main.mp4 (2048x1024)</a></section>'''


def png_bytes(color: str = "blue", size: tuple[int, int] = (16, 12)) -> bytes:
    output = io.BytesIO()
    Image.new("RGB", size, color).save(output, "PNG")
    return output.getvalue()


def image_response(content: bytes = png_bytes(), headers: dict | None = None) -> requests.Response:
    response = requests.Response()
    response.status_code = 200
    response.headers.update(headers or {})
    response.raw = io.BytesIO(content)
    return response


def soup(html: str):
    return downloader.page_soup(html_for(html), CATEGORY)


def test_latest_image_has_priority_and_uses_largest_original():
    parsed = soup(html_for(video_group() + latest_group()))
    asset = downloader.discover_latest_image(parsed, CATEGORY.source_url, CATEGORY.slug)
    assert asset == downloader.Asset(LATEST, "latest_image", "png", asset.description)
    assert "most currently available" in asset.description


def test_color_is_not_mistaken_for_most_current_description():
    parsed = soup(latest_group().replace("most currently available", "most colorful"))
    assert downloader.discover_latest_image(parsed, CATEGORY.source_url, CATEGORY.slug) is None


def test_fallback_is_the_primary_video_not_poster_or_secondary_video():
    secondary = '<section id="media_group_second"><video><source src="secondary.mp4" type="video/mp4"/></video></section>'
    asset = downloader.discover_primary_video(soup(video_group() + secondary), CATEGORY.source_url)
    assert asset.url == VIDEO
    assert asset.method == "video_first_frame"


def test_colorbar_without_latest_description_does_not_block_video():
    parsed = soup(video_group() + '<section id="media_group_bar"><a href="colorbar.png">Colorbar</a></section>')
    assert downloader.discover_latest_image(parsed, CATEGORY.source_url, CATEGORY.slug) is None
    assert downloader.discover_primary_video(parsed, CATEGORY.source_url).url == VIDEO


def test_missing_image_and_video_is_failure(tmp_path, monkeypatch):
    monkeypatch.setattr(downloader, "fetch_page", lambda *args: html_for("<p>No assets</p>"))
    result = downloader.process_category(CATEGORY, tmp_path, True, requests.Session())
    assert not result["success"]
    assert "no dedicated latest image or primary MP4" in result["errors"][0]
    assert CATEGORY.slug in json.loads((tmp_path / "metadata.json").read_text())["categories"]


def test_http_page_failure_is_reported(tmp_path, monkeypatch):
    monkeypatch.setattr(downloader, "fetch_page", lambda *args: (_ for _ in ()).throw(requests.ConnectionError("offline")))
    result = downloader.process_category(CATEGORY, tmp_path, True, requests.Session())
    assert not result["success"]
    assert "offline" in result["errors"][0]


def test_corrupted_download_is_rejected(tmp_path):
    class Session:
        def get(self, *args, **kwargs):
            return image_response(b"<html>service error</html>")

    with pytest.raises(downloader.ExtractionError, match="Invalid or corrupted"):
        downloader.download_image(Session(), downloader.Asset(LATEST, "latest_image", "png", ""), tmp_path / "image.png")
    assert not (tmp_path / "image.png").exists()


def test_corrupted_replacement_keeps_valid_existing_png(tmp_path):
    target = tmp_path / "valid.png"
    target.write_bytes(png_bytes("green"))
    class Session:
        def get(self, *args, **kwargs):
            return image_response(b"broken")
    with pytest.raises(downloader.ExtractionError):
        downloader.download_image(Session(), downloader.Asset(LATEST, "latest_image", "png", ""), target)
    assert target.read_bytes() == png_bytes("green")


def test_valid_image_is_atomically_saved_and_validated(tmp_path):
    target = tmp_path / "nested" / "result.png"
    class Session:
        def get(self, *args, **kwargs):
            return image_response(png_bytes(size=(2048, 1024)), {"ETag": '"asset-1"'})
    result = downloader.download_image(Session(), downloader.Asset(LATEST, "latest_image", "png", ""), target)
    assert (result["width"], result["height"]) == (2048, 1024)
    assert result["original_asset_type"] == "png"
    assert Image.open(target).format == "PNG"
    assert not list(target.parent.glob(".*download*"))


def test_metadata_generation_and_atomic_replacement(tmp_path):
    downloader.write_metadata(tmp_path, {"categories": {"precipitation": {"success": True}}})
    decoded = json.loads((tmp_path / "metadata.json").read_text())
    assert decoded["categories"]["precipitation"]["success"]
    assert decoded["generated_at"].endswith("Z")
    assert not list(tmp_path.glob(".metadata-*"))


def test_end_to_end_latest_success_records_required_metadata(tmp_path, monkeypatch):
    monkeypatch.setattr(downloader, "fetch_page", lambda *args: html_for(latest_group()))
    monkeypatch.setattr(downloader, "download_image", lambda *args, **kwargs: {"width": 2048, "height": 1024, "original_asset_type": "png"})
    result = downloader.process_category(CATEGORY, tmp_path, True, requests.Session())
    assert result["success"]
    assert result["extraction_method"] == "latest_image"
    assert result["source_url"] == CATEGORY.source_url
    assert result["asset_url"] == LATEST
    assert result["video_timestamp_seconds"] is None
    assert result["scientific_data_recency_verified"] is False
    assert result["observation_timestamp"] is None
    assert result["download_timestamp"].endswith("Z")


def test_video_fallback_records_zero_seconds(tmp_path, monkeypatch):
    monkeypatch.setattr(downloader, "fetch_page", lambda *args: html_for(video_group()))
    monkeypatch.setattr(downloader, "extract_first_frame", lambda *args: {"width": 1920, "height": 1080, "original_asset_type": "mp4"})
    class Session:
        def head(self, *args, **kwargs):
            return image_response()
    result = downloader.process_category(CATEGORY, tmp_path, True, Session())
    assert result["success"]
    assert result["extraction_method"] == "video_first_frame"
    assert result["video_timestamp_seconds"] == 0
    assert any("not asserted to be the latest" in w for w in result["warnings"])


def test_video_inaccessibility_is_reported_and_does_not_write_image(tmp_path, monkeypatch):
    monkeypatch.setattr(downloader, "fetch_page", lambda *args: html_for(video_group()))
    response = requests.Response()
    response.status_code = 403
    response.url = VIDEO
    class Session:
        def head(self, *args, **kwargs):
            return response
    result = downloader.process_category(CATEGORY, tmp_path, True, Session())
    assert not result["success"]
    assert "403" in result["errors"][0]
    assert not (tmp_path / "images" / "precipitation.png").exists()


def test_ffmpeg_missing_is_clear_error():
    with pytest.raises(downloader.ExtractionError, match="not found on PATH"):
        downloader.extract_first_frame(VIDEO, Path("unused.png"), ffmpeg_path="not-installed-ffmpeg")


def test_video_fallback_succeeds_when_head_is_not_supported(tmp_path, monkeypatch):
    monkeypatch.setattr(downloader, "fetch_page", lambda *args: html_for(video_group()))
    monkeypatch.setattr(downloader, "extract_first_frame", lambda *args: {"width": 1, "height": 1})
    monkeypatch.setattr(requests.Session, "head", lambda self, url, **kwargs: image_response())
    result = downloader.process_category(CATEGORY, tmp_path, True, requests.Session())
    assert result["success"]
    assert result["etag"] is None


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="FFmpeg integration test requires ffmpeg on PATH")
def test_video_first_frame_integration(tmp_path):
    video = tmp_path / "red_then_blue.mp4"
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", "color=red:size=64x48:rate=1:duration=1",
        "-f", "lavfi", "-i", "color=blue:size=64x48:rate=1:duration=1",
        "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[out]", "-map", "[out]", str(video),
    ], check=True)
    target = tmp_path / "first.png"
    result = downloader.extract_first_frame(str(video), target)
    assert (result["width"], result["height"]) == (64, 48)
    red, green, blue = Image.open(target).convert("RGB").getpixel((32, 24))
    assert red > 200 and green < 40 and blue < 40, "First frame must not be the last blue frame"


def test_failure_during_asset_fetch_retains_previous_success_entry(tmp_path, monkeypatch):
    monkeypatch.setattr(downloader, "fetch_page", lambda *args: html_for(latest_group()))
    monkeypatch.setattr(downloader, "download_image", lambda *args, **kwargs: (_ for _ in ()).throw(requests.ConnectionError("lost asset")))
    result = downloader.process_category(CATEGORY, tmp_path, True, requests.Session())
    assert not result["success"]
    with Image.new("RGB", (640, 360), "purple") as image:
        (tmp_path / "images").mkdir(exist_ok=True)
        image.save(tmp_path / "images" / "precipitation.png")
    metadata = json.loads((tmp_path / "metadata.json").read_text())
    metadata["categories"][CATEGORY.slug].update(success=True, asset_url=LATEST)
    (tmp_path / "metadata.json").write_text(json.dumps(metadata))
    monkeypatch.setattr(downloader, "fetch_page", lambda *args: (_ for _ in ()).throw(requests.ConnectionError("page unavailable")))
    retry = downloader.process_category(CATEGORY, tmp_path, False, requests.Session())
    saved = json.loads((tmp_path / "metadata.json").read_text())["categories"][CATEGORY.slug]
    assert not retry["success"]
    assert saved["success"], "Transient page failure must not erase the last successful metadata"


def test_no_content_hash_extension_is_used_for_unchanged_nasa_urls():
    # Fixed latest URLs need an ETag/Last-Modified when available; there is no content-hash fallback.
    response = image_response(headers={"ETag": '"new"'})
    class Session:
        def head(self, *args, **kwargs):
            return response
    changed, _ = downloader.source_unchanged(Session(), downloader.Asset(LATEST, "latest_image", "png", ""), {"etag": '"old"'}, 1)
    assert not changed


def test_carbon_monoxide_target_is_not_carbon_dioxide():
    co = next(c for c in downloader.CATEGORIES if c.slug == "carbon_monoxide")
    assert co.source_url == "https://svs.gsfc.nasa.gov/5153/"
    assert co.expected_title == "carbon monoxide"
    assert all(c.slug != "carbon_dioxide" for c in downloader.CATEGORIES)
    html = """<h1 id="title">Carbon Monoxide (CO)</h1>
    <section id="media_group_top"><video>
      <source src="/vis/a005153/MC03_stage4_GMAO_CO_2048x1024_en.mp4" type="video/mp4" />
    </video><p>Near surface CO; no latest image section</p></section>
    <section id="media_group_bar"><p>CO colorbar</p><a href="CO_colorbar.png">CO_colorbar.png</a></section>"""
    parsed = downloader.page_soup(html, co)
    assert downloader.discover_latest_image(parsed, co.source_url, co.slug) is None
    video = downloader.discover_primary_video(parsed, co.source_url)
    assert "MC03_stage4_GMAO_CO_2048x1024_en.mp4" in video.url
