# NASA Earth Information Center Image Downloader

A focused Python downloader for five NASA Scientific Visualization Studio (SVS)
visualizations. It saves stable PNG files for later computer-vision and
sonification work; those integrations are intentionally not implemented here.

## Selection rules

Every run verifies the NASA page title before extracting an asset and examines
only the page's main `media_group_*` sections (not related-page thumbnails).

1. If a media group describes an image as **most recent**, **most currently
   available**, or **latest available**, its largest official original download
   is selected, excluding preview/thumbnail variants.
2. Otherwise, the first video in the main groups is treated as the primary
   visualization. `ffmpeg` sends the MP4 URL's **first decoded video frame** to
   a new PNG. Posters, still-image links, source frames, and last frames are not
   substituted for that first frame. FFmpeg streams only the data it needs, so
   there is no temporary MP4 to remove.
3. If neither succeeds, metadata records an error and existing valid images
   are retained. An unrelated image is never substituted.

Current verified assets (checked 2026-11-14):

| Category | NASA page | Selected asset and reason | Resolution |
|---|---|---|---|
| Precipitation | [4285](https://svs.gsfc.nasa.gov/4285/) — Near Real-Time Global Precipitation | `imergert_composite.now.png`, described as “An image of the most currently available global precipitation data” | 3600×1800 |
| Active fires | [5113](https://svs.gsfc.nasa.gov/5113/) — VIIRS Active Fires | `VIIRS_fires_latest.png`, described as “Most recent VIIRS active fires” | 4096×2048 |
| Carbon monoxide (CO) | [5153](https://svs.gsfc.nasa.gov/5153/) — Carbon Monoxide | First decoded frame of primary `MC03_stage4_GMAO_CO_2048x1024_en.mp4` | 2048×1024 |
| Nitrogen oxides (NOx) | [5154](https://svs.gsfc.nasa.gov/5154/) — Nitrogen Oxides | First decoded frame of primary `MC04_stage4_GMAO_NO2_2048x1024_en.mp4` | 2048×1024 |
| Near-surface temperature | [5147](https://svs.gsfc.nasa.gov/5147/) — GEOS-FP Near-Surface Temperature | First decoded frame of primary `MC01_stage3_GMAO_near_surface_temperature_2048x1024_en.mp4` | 2048×1024 |

For precipitation, the full `imergert_composite.now.png` is deliberately used
rather than the same-sized `imergert_alpha.now.png` or `imergert_dates.now.png`
overlay layers. This retains NASA's complete map visualization, without crop
or resampling.

CO, NOx, and temperature have no qualifying dedicated latest-data image;
non-visualization assets such as colorbars do not qualify. The first-frame images are not claimed to contain current observations.

## Requirements

- Python 3.10 or later
- `ffmpeg` on `PATH` (used by SVS's own network protocol support, no browser)
- FFmpeg HTTPS and H.264 decoding support (standard desktop builds include it)
- Network access to `svs.gsfc.nasa.gov`

macOS with Homebrew:

```bash
brew install ffmpeg
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

Ubuntu/Debian:

```bash
sudo apt install ffmpeg python3-venv
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

## Usage

From the repository root:

```bash
# All five; retained valid files skip work if source validators are unchanged
python download_eic.py --verbose

# Just precipitation
python download_eic.py --category precipitation

# Force complete redownload / video re-extraction for every category
python download_eic.py --force --verbose

# One file, forced
python download_eic.py --category active_fires --force
```

Output paths are stable regardless of which directory invokes the script:

```text
data/images/precipitation.png
data/images/active_fires.png
data/images/carbon_monoxide.png
data/images/nitrogen_oxides.png
data/images/near_surface_temperature.png
data/metadata.json
```

Requests have bounded timeouts and retries for transient errors/429 responses.
Pages are read sequentially to be polite to NASA. A category failure does not
stop other categories, and the exit status indicates whether the selected run
succeeded. PNG and metadata replacement use temporary-file atomic renames.
An interrupted or corrupt replacement does not damage an existing valid PNG.

Without `--force`, the script still reads each page to rediscover the correct
asset. It can skip regeneration only when the page, selection method, source
URL and valid local image match previous metadata. A suitable `HEAD` request
checks `ETag` and `Last-Modified` when provided. If a fixed NASA URL offers no
usable validators (or the check fails), the existing file is retained and a
warning is recorded; source change detection is then **not guaranteed**.

## Metadata and dates

`data/metadata.json` has an entry for each category with the NASA page URL,
actual selected MP4/image URL, relative PNG path, original asset type, image
dimensions, extraction method, extraction time, and errors/warnings. First-frame
entries explicitly record `video_timestamp_seconds: 0`.

`observation_timestamp` is `null` when no exact timestamp can be verified.
`scientific_data_recency_verified` is `false`: being labeled “most recent” on
NASA's page and being downloaded now does not verify an acquisition timestamp.
Failed attempts are stored under `last_attempt` without erasing a previous
successful category's provenance.

## Tests

```bash
python -m pip install -r requirements-dev.txt
python -m pytest -q
```

Tests use mocked HTML/HTTP fixtures for selection priority, missing assets,
HTTP errors, corrupt-download rejection, metadata, and preservation of existing
files. An FFmpeg test encodes red then blue frames and asserts that only red is
saved. Live acquisition was executed separately with the commands above, and
all five downloaded PNGs were decoded and dimension-checked with Pillow.

## DeepSpace assistance

DeepSpace was checked at implementation time. Neither a `deepspace` executable
nor an installed Python `deepspace` SDK or DeepSpace MCP tool was configured in
this environment. Its public web page points to documentation, but no supported
local integration was available. The implementation therefore used direct NASA
HTML/API inspection, `curl`, FFmpeg, and actual tests; no DeepSpace APIs or
contribution are claimed.

## Limitations

- NASA can change its HTML grouping or descriptions. In that case the program
  fails explicitly instead of silently choosing a poster or unrelated asset.
- The precipitation composite preference is specific to its named NASA assets;
  a renamed full composite requires updating the documented selector.
- NOAA/NASA observation time is not inferred from page publication/update time,
  filesystem timestamps, the word “latest”, or download time.
- Image content was sanity-checked through decoding, dimensions, and matching
  page/asset descriptions; no formal scientific calibration is performed.
