"""Official NASA page/asset discovery; no dependency on a visualization downloader."""
from __future__ import annotations

import hashlib
from io import BytesIO
import re
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from PIL import Image


USER_AGENT = "EIC-Color-Scale-Research/1.0 (NASA Space Apps; official asset inspection)"
PREVIEW_PLACEHOLDER = "/static/svs/images/no_preview_web_black.png"
NASA_HOSTS = {"svs.gsfc.nasa.gov", "www.svs.gsfc.nasa.gov"}


def fetch(url: str, timeout: int) -> tuple[bytes, requests.Response]:
    response = requests.get(url, timeout=timeout, headers={"User-Agent": USER_AGENT})
    response.raise_for_status()
    return response.content, response


def page_title(html: bytes) -> str | None:
    soup = BeautifulSoup(html, "html.parser")
    meta = soup.find("meta", attrs={"property": "og:title"})
    if meta:
        return meta.get("content", "").replace("NASA Scientific Visualization Studio | ", "")
    heading = soup.find("h1", id="title")
    return heading.get_text(" ", strip=True) if heading else None


def discover_colorbars(html: bytes, source_url: str) -> list[dict]:
    """Find NASA raster links within explicitly captioned colorbar media cards."""
    soup = BeautifulSoup(html, "html.parser")
    urls: dict[str, str] = {}
    for section in soup.find_all("section", id=re.compile(r"^media_group_")):
        text = re.sub(r"\s+", " ", section.get_text(" ", strip=True))
        if not re.search(r"color\s*[-_ ]?bar", text, re.I):
            continue
        candidates = []
        for tag in section.find_all(["a", "img", "source"]):
            for attr in ("href", "src", "srcset"):
                value = tag.get(attr)
                if not value:
                    continue
                for part in value.split(",") if attr == "srcset" else [value]:
                    candidates.append(part.strip().split()[0])
        for candidate in candidates:
            url = urljoin(source_url, candidate)
            path = urlparse(url).path
            if (urlparse(url).hostname in NASA_HOSTS and
                    PREVIEW_PLACEHOLDER not in path and
                    re.search(r"\.(png|jpe?g|webp)$", path, re.I)):
                urls[url] = text[:1000]
    return [{"url": url, "caption": caption, "kind": "official_standalone_colorbar"}
            for url, caption in urls.items()]


def image_sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def image_metadata(data: bytes) -> dict:
    with Image.open(BytesIO(data)) as image:
        return {"width": image.width, "height": image.height, "sha256": image_sha256(data)}


def video_frame(image_bytes: bytes, seconds: float, timeout: int) -> bytes:
    """Decode a remote video to one PNG using ffmpeg, never a downloader."""
    import subprocess
    process = subprocess.run(
        ["ffmpeg", "-v", "error", "-ss", str(seconds), "-i", "pipe:0", "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "pipe:1"],
        input=image_bytes, capture_output=True, timeout=timeout, check=False)
    if process.returncode:
        raise RuntimeError("ffmpeg could not decode the official video: " + process.stderr.decode(errors="replace")[:500])
    return process.stdout
