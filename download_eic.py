#!/usr/bin/env python3
"""Download one carefully selected visualization image from five NASA SVS pages."""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from PIL import Image, UnidentifiedImageError
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

NASA_HOST = "svs.gsfc.nasa.gov"
IMAGE_ROOT = Path("data/images")
LATEST_DESCRIPTION = re.compile(
    r"\b(?:most\s+(?:currently\s+available|recent)|latest\s+available)\b", re.I
)
DIMENSIONS = re.compile(r"(?<!\d)(\d{2,5})x(\d{2,5})(?!\d)")
IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp")
PREVIEW_MARKERS = ("_thm", "_thumb", "_searchweb", "_print", "_web", "no_preview")


@dataclass(frozen=True)
class Category:
    name: str
    slug: str
    source_url: str
    expected_title: str


@dataclass(frozen=True)
class Asset:
    url: str
    method: str
    original_asset_type: str
    description: str


CATEGORIES = (
    Category("Precipitation", "precipitation", "https://svs.gsfc.nasa.gov/4285/", "precipitation"),
    Category("Active Fires", "active_fires", "https://svs.gsfc.nasa.gov/5113/", "active fires"),
    Category("Carbon Monoxide (CO)", "carbon_monoxide", "https://svs.gsfc.nasa.gov/5153/", "carbon monoxide"),
    Category("Nitrogen Oxides (NOx)", "nitrogen_oxides", "https://svs.gsfc.nasa.gov/5154/", "nitrogen oxides"),
    Category("Near-Surface Temperature", "near_surface_temperature", "https://svs.gsfc.nasa.gov/5147/", "near-surface temperature"),
)


class ExtractionError(RuntimeError):
    """A page did not yield a verified, usable visualization asset."""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def create_session() -> requests.Session:
    retry = Retry(
        total=4,
        connect=4,
        read=4,
        status=4,
        backoff_factor=1.0,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset(("GET", "HEAD")),
    )
    adapter = HTTPAdapter(max_retries=retry)
    session = requests.Session()
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    session.headers["User-Agent"] = "NASA-EIC-Image-Downloader/1.0 (Space Apps visualization acquisition)"
    return session


def fetch_page(session: requests.Session, url: str, timeout: float = 45) -> str:
    try:
        response = session.get(url, timeout=timeout)
        response.raise_for_status()
    except requests.RequestException as exc:
        raise ExtractionError(f"Could not fetch NASA page {url}: {exc}") from exc
    return response.text


def page_soup(html: str, category: Category) -> BeautifulSoup:
    soup = BeautifulSoup(html, "html.parser")
    title = soup.find("h1", id="title") or soup.find("h1")
    if not title or category.expected_title not in title.get_text(" ", strip=True).casefold():
        raise ExtractionError(
            f"{category.name}: NASA page title does not match expected {category.expected_title!r}"
        )
    return soup


def asset_url(base_url: str, raw_url: str) -> str:
    return urljoin(base_url, raw_url).replace("http://svs.gsfc.nasa.gov/", f"https://{NASA_HOST}/", 1)


def media_groups(soup: BeautifulSoup) -> list[Any]:
    """Only main media groups, rather than related-page thumbnails at page bottom."""
    return list(soup.select('section[id^="media_group_"]'))


def image_candidates(group: Any, page_url: str) -> list[tuple[int, int, Asset]]:
    candidates = []
    for index, link in enumerate(group.select("a[href]")):
        raw_url = link.get("href", "")
        path = urlparse(raw_url).path
        if not path.lower().endswith(IMAGE_EXTENSIONS) or Path(path).stem.lower().endswith(PREVIEW_MARKERS):
            continue
        match = DIMENSIONS.search(link.get_text(" ", strip=True)) or DIMENSIONS.search(path)
        width, height = (int(value) for value in match.groups()) if match else (0, 0)
        candidates.append((width * height, -index, Asset(asset_url(page_url, raw_url), "latest_image", Path(path).suffix.lstrip("."), "")))
    return candidates


def discover_latest_image(soup: BeautifulSoup, page_url: str, category_slug: str | None = None) -> Asset | None:
    for group in media_groups(soup):
        description = group.get_text(" ", strip=True)
        if not LATEST_DESCRIPTION.search(description):
            continue
        candidates = image_candidates(group, page_url)
        if category_slug == "precipitation":
            # Full composite retains the map substrate; alpha/dates assets are overlays.
            candidates = [item for item in candidates if item[2].url.endswith("/imergert_composite.now.png")]
        if not candidates:
            # Picture sources are usable when NASA omits a size-labelled download link.
            for source in group.select("picture source[srcset]"):
                url = source.get("srcset", "").split()[0]
                path = urlparse(url).path
                if path.lower().endswith(IMAGE_EXTENSIONS):
                    candidates.append((0, 0, Asset(asset_url(page_url, url), "latest_image", Path(path).suffix.lstrip("."), "")))
        if candidates:
            asset = max(candidates, key=lambda item: (item[0], item[1]))[2]
            return Asset(asset.url, asset.method, asset.original_asset_type, description)
    return None


def discover_primary_video(soup: BeautifulSoup, page_url: str) -> Asset | None:
    for group in media_groups(soup):
        video = group.find("video")
        if not video:
            continue
        choices: list[tuple[int, int, Asset]] = []
        for index, source in enumerate(video.select('source[src$=".mp4"], source[type="video/mp4"]')):
            raw_url = source.get("src")
            match = DIMENSIONS.search(raw_url)
            pixels = int(match[1]) * int(match[2]) if match else 0
            choices.append((pixels, -index, Asset(
                asset_url(base_url=page_url, raw_url=raw_url),
                "video_first_frame",
                "mp4",
                group.get_text(" ", strip=True),
            )))
        if not choices:
            for index, link in enumerate(group.select('a[href$=".mp4"]')):
                url = link["href"]
                match = DIMENSIONS.search(link.get_text(" ", strip=True)) or DIMENSIONS.search(url)
                pixels = int(match[1]) * int(match[2]) if match else 0
                choices.append((pixels, -index, Asset(asset_url(page_url, url), "video_first_frame", "mp4", group.get_text(" ", strip=True))))
        if choices:
            return max(choices, key=lambda item: (item[0], item[1]))[2]
    return None


def validate_image(source: Path, destination: Path) -> tuple[int, int, str]:
    """Decode an asset completely, then atomically install a PNG without resizing."""
    try:
        with Image.open(source) as image:
            image.load()
            if image.width < 2 or image.height < 2:
                raise ExtractionError(f"Downloaded image is empty or too small: {source}")
            if image.mode == "RGBA" and image.getchannel("A").getextrema()[1] == 0:
                raise ExtractionError("Downloaded image is entirely transparent")
            width, height = image.size
            original_format = image.format or "unknown"
            temporary_png = source
            if original_format != "PNG":
                handle, temporary_name = tempfile.mkstemp(
                    prefix=f".{destination.stem}-converted-", suffix=".png", dir=destination.parent
                )
                os.close(handle)
                temporary_png = Path(temporary_name)
                try:
                    image.save(temporary_png, format="PNG")
                except Exception:
                    temporary_png.unlink(missing_ok=True)
                    raise
        os.replace(temporary_png, destination)
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ExtractionError(f"Invalid or corrupted image from {source}: {exc}") from exc
    return width, height, original_format


def download_image(session: requests.Session, asset: Asset, destination: Path, timeout: float = 120) -> dict[str, Any]:
    destination.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary_name = tempfile.mkstemp(prefix=f".{destination.stem}-download-", dir=destination.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(handle, "wb") as output:
            with session.get(asset.url, stream=True, timeout=timeout) as response:
                response.raise_for_status()
                for block in response.iter_content(1024 * 1024):
                    if block:
                        output.write(block)
        width, height, original_format = validate_image(temporary, destination)
        return {
            "width": width,
            "height": height,
            "original_asset_type": original_format.lower(),
            "etag": response.headers.get("ETag"),
            "last_modified": response.headers.get("Last-Modified"),
        }
    except requests.RequestException as exc:
        raise ExtractionError(f"Could not download {asset.url}: {exc}") from exc
    finally:
        temporary.unlink(missing_ok=True)


def extract_first_frame(video_url: str, destination: Path, timeout: float = 240, ffmpeg_path: str = "ffmpeg") -> dict[str, Any]:
    """Ask FFmpeg itself for the first decoded frame; never use a poster or seek to an end."""
    if not shutil.which(ffmpeg_path):
        raise ExtractionError("FFmpeg is required for video-first-frame extraction but was not found on PATH")
    destination.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary_name = tempfile.mkstemp(prefix=f".{destination.stem}-frame-", suffix=".png", dir=destination.parent)
    os.close(handle)
    temporary = Path(temporary_name)
    command = [
        ffmpeg_path, "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
        "-i", video_url, "-map", "0:v:0", "-frames:v", "1",
        "-f", "image2", "-c:v", "png", "-update", "1", str(temporary),
    ]
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=timeout, check=False)
        if result.returncode or not temporary.is_file() or temporary.stat().st_size == 0:
            detail = result.stderr.strip()[-1000:] or "FFmpeg did not produce an image"
            raise ExtractionError(f"First-frame extraction failed for {video_url}: {detail}")
        width, height, _ = validate_image(temporary, destination)
        return {"width": width, "height": height, "original_asset_type": "mp4"}
    except subprocess.TimeoutExpired as exc:
        raise ExtractionError(f"FFmpeg timed out after {timeout:g}s on {video_url}") from exc
    finally:
        temporary.unlink(missing_ok=True)


def read_metadata(data_dir: Path) -> dict[str, Any]:
    path = data_dir / "metadata.json"
    if not path.exists():
        return {"schema_version": 1, "categories": {}}
    try:
        metadata = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(metadata, dict) or not isinstance(metadata.get("categories", {}), dict):
            raise ValueError("categories must be an object")
        metadata.setdefault("categories", {})
        return metadata
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        raise ExtractionError(f"Cannot read {path}: {exc}") from exc


def write_metadata(data_dir: Path, metadata: dict[str, Any]) -> None:
    data_dir.mkdir(parents=True, exist_ok=True)
    metadata["generated_at"] = utc_now()
    handle, temporary_name = tempfile.mkstemp(prefix=".metadata-", suffix=".json", dir=data_dir)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as output:
            json.dump(metadata, output, ensure_ascii=False, indent=2)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, data_dir / "metadata.json")
    finally:
        temporary.unlink(missing_ok=True)


def existing_image(data_dir: Path, entry: dict[str, Any]) -> bool:
    path = data_dir / "images" / f"{entry.get('category')}.png"
    try:
        with Image.open(path) as image:
            image.verify()
        return True
    except (OSError, UnidentifiedImageError):
        return False


def source_unchanged(session: requests.Session, asset: Asset, previous: dict[str, Any], timeout: float) -> tuple[bool, str]:
    """Validate freshness with HTTP validators where NASA supplies them; URL identity is the fallback."""
    try:
        response = session.head(asset.url, timeout=timeout, allow_redirects=True)
        response.raise_for_status()
    except requests.RequestException as exc:
        return True, f"Freshness check failed ({exc}); retained the existing valid image"
    for key, header in (("etag", "ETag"), ("last_modified", "Last-Modified")):
        current, old = response.headers.get(header), previous.get(key)
        if current and old and current != old:
            return False, f"NASA {header} changed"
    return True, "Source URL and available HTTP validators are unchanged"


def record_result(entry: dict[str, Any], metadata: dict[str, Any], data_dir: Path) -> None:
    metadata["categories"][entry["category"]] = entry
    write_metadata(data_dir, metadata)


def process_category(
    category: Category,
    data_dir: Path,
    force: bool,
    session: requests.Session,
    timeout: float = 45,
) -> dict[str, Any]:
    entry: dict[str, Any] = {
        "category": category.slug,
        "category_label": category.name,
        "source_url": category.source_url,
        "local_image_path": str(IMAGE_ROOT / f"{category.slug}.png"),
        "success": False,
        "errors": [],
        "warnings": [],
        "download_timestamp": None,
    }
    try:
        soup = page_soup(fetch_page(session, category.source_url, timeout), category)
        asset = discover_latest_image(soup, category.source_url, category.slug)
        if not asset:
            asset = discover_primary_video(soup, category.source_url)
        if not asset:
            raise ExtractionError(f"{category.name}: no dedicated latest image or primary MP4 video found")
        entry.update({"asset_url": asset.url, "asset_description": asset.description, "extraction_method": asset.method})
        metadata = read_metadata(data_dir)
        previous = metadata["categories"].get(category.slug, {})
        destination = data_dir / "images" / f"{category.slug}.png"
        if (
            not force and previous.get("success") and previous.get("asset_url") == asset.url
            and previous.get("extraction_method") == asset.method and existing_image(data_dir, previous)
        ):
            unchanged, reason = source_unchanged(session, asset, previous, timeout)
            if unchanged:
                entry.update(previous)
                entry["success"] = True
                entry["warnings"] = [*previous.get("warnings", []), f"Download skipped: {reason}"]
                logging.info("%s: %s", category.name, reason)
                record_result(entry, metadata, data_dir)
                return entry
            logging.info("%s: %s; downloading", category.name, reason)

        logging.info("%s: %s", category.name, asset.url)
        if asset.method == "latest_image":
            result = download_image(session, asset, destination, timeout=max(timeout, 120))
            video_timestamp = None
        else:
            try:
                response = session.head(asset.url, timeout=timeout, allow_redirects=True)
                response.raise_for_status()
            except requests.RequestException as exc:
                raise ExtractionError(f"Could not access primary video {asset.url}: {exc}") from exc
            result = extract_first_frame(asset.url, destination)
            result.update(
                etag=response.headers.get("ETag"),
                last_modified=response.headers.get("Last-Modified"),
            )
            video_timestamp = 0.0
        entry.update(result)
        entry.update({
            "success": True,
            "observation_timestamp": None,
            "observation_period": None,
            "video_timestamp_seconds": video_timestamp,
            "download_timestamp": utc_now(),
            "scientific_data_recency_verified": False,
            "warnings": [
                "NASA does not provide a machine-verifiable observation timestamp for this asset; download time is not observation time."
            ],
        })
        if asset.method == "video_first_frame":
            entry["warnings"].append("First decoded animation frame; not asserted to be the latest scientific observation.")
        record_result(entry, metadata, data_dir)
        logging.info("%s: saved %sx%s PNG", category.name, result["width"], result["height"])
        return entry
    except (ExtractionError, requests.RequestException) as exc:
        entry["errors"] = [str(exc)]
        try:
            metadata = read_metadata(data_dir)
            metadata.setdefault("last_attempt", {})[category.slug] = entry
            # A network outage must not erase provenance for an existing valid image.
            if not metadata["categories"].get(category.slug, {}).get("success"):
                metadata["categories"][category.slug] = entry
            write_metadata(data_dir, metadata)
        except (ExtractionError, OSError) as metadata_error:
            logging.error("%s: could not write failure metadata: %s", category.name, metadata_error)
        logging.error("%s: %s", category.name, exc)
        return entry
    except OSError as exc:
        entry["errors"] = [f"Local storage failure: {exc}"]
        logging.error("%s: %s", category.name, entry["errors"][0])
        try:
            record_result(entry, read_metadata(data_dir), data_dir)
        except (ExtractionError, OSError):
            pass
        return entry


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--category", choices=tuple(c.slug for c in CATEGORIES), help="Process only this category")
    parser.add_argument("--force", action="store_true", help="Redownload/regenerate even if the selected asset is unchanged")
    parser.add_argument("--verbose", action="store_true", help="Show progress and detailed HTTP/FFmpeg errors")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO if args.verbose else logging.WARNING, format="%(levelname)s: %(message)s")
    data_dir = Path(__file__).resolve().parent / "data"
    selected = [c for c in CATEGORIES if not args.category or c.slug == args.category]
    results = []
    with create_session() as session:
        for category in selected:
            # Categories are independent: a network or extraction error must not abort the rest.
            try:
                results.append(process_category(category, data_dir, args.force, session))
            except Exception as exc:  # Last-resort isolation at CLI boundary; library failures remain exceptions to tests.
                logging.exception("Unexpected error processing %s", category.slug)
                results.append({"category": category.slug, "success": False, "errors": [str(exc)]})
    print("| Category | Source Type | Resolution | Success |")
    print("|---|---|---:|---|")
    for result in results:
        method = {"latest_image": "Latest image", "video_first_frame": "Video first frame"}.get(result.get("extraction_method"), "Failed")
        resolution = f"{result['width']}x{result['height']}" if result.get("width") else "—"
        print(f"| {result['category']} | {method} | {resolution} | {'Yes' if result['success'] else 'No'} |")
    print(f"Metadata: {data_dir / 'metadata.json'}")
    return 0 if results and all(result["success"] for result in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
