# NASA EIC color-scale and scientific-legend extractor

Standalone Agent 2 program. It does **not** import, call, or depend on
`download_eic.py`, Agent 1's images, or `data/metadata.json`. No files outside
`color_scales/` are modified by this implementation.

## Setup

Tested with Python 3.14 and the dependencies in `requirements.txt` (Pillow,
NumPy, OpenCV, requests, BeautifulSoup). OpenCV is used only for candidate
geometry and never to infer scientific values.

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r color_scales/requirements.txt
.venv/bin/python color_scales/extract_color_scales.py
```

`ffmpeg` must be installed and on `PATH` only when the active-fires official
movie must be decoded directly. An independently downloaded 4096 x 2048 frame
from NASA's primary fire movie can instead be passed with `--fire-frame`.
Avoid `--ocr` unless OCR diagnostics are needed; optional RapidOCR is not
available on every Python version, and OCR never establishes verification.

## Commands

```bash
python color_scales/extract_color_scales.py
python color_scales/extract_color_scales.py --category precipitation
python color_scales/extract_color_scales.py --image-dir data/images
python color_scales/extract_color_scales.py --category active_fires --fire-frame official_fire_frame.png
python color_scales/extract_color_scales.py --force
python color_scales/extract_color_scales.py --verbose
```

Available categories: `precipitation`, `active_fires`, `carbon_monoxide`,
`nitrogen_oxides`, and `near_surface_temperature`.

**The active-fires fallback downloads the full linked NASA movie if neither
`--fire-frame` nor an Agent 2 cached frame exists (about 46.5 MB at review).**
The movie is streamed to ffmpeg; a single PNG is cached under
`output/active_fires/.cache/`, which is ignored by git. No downloader runs.
All four other categories retrieve small NASA standalone PNG colorbars.

The image fallback accepts `precipitation.png`, `active_fires.png`,
`carbon_monoxide.png`, `nitrogen_oxides.png`, and
`near_surface_temperature.png` in `--image-dir`. Images are read-only, missing
files do not block others, and `--crop x,y,width,height` supplies a manual
read-only colorbar crop. Automatic fallback detects thin repeated gradient
sequences or discrete swatches, not an inventory of colors from a world map.
No labels or numeric beliefs are inferred from pixels alone. When labels/units
are not recoverable, they remain JSON `null` and the result has status
`uncalibrated_palette_extracted` or `failed`.

## Correction: Carbon monoxide, not the supplied CO2 URL

As requested, this implementation consistently uses **carbon monoxide (CO)**.
NASA confirms that the supplied [SVS 5115](https://svs.gsfc.nasa.gov/5115/) is
**Global Atmospheric Carbon Dioxide (CO2)**—not CO. The scientifically matching
EIC page is [SVS 5153, Carbon Monoxide (CO)](https://svs.gsfc.nasa.gov/5153/),
which provides CO's official `CO_colorbar_plain.png` asset. Only that page's
CO legend is used. The original URL, mismatch warning, and corrected source
are all explicit in `output/carbon_monoxide/scale.json`. Do not use a CO2 palette
or Agent 1 CO2 imagery to sonify carbon monoxide.

## Output and verification discipline

Each category directory contains `scale.json` plus its official raster
`colorbar.png` (precipitation has two: `colorbar_liquid.png`,
`colorbar_frozen.png`). Fire's crop retains nearby ticks and units.

- `scale_found` indicates whether an actual official scale was recovered, not
  whether numerical calibration is authoritative.
- `variable_verification = verified` refers to the visualization page title,
  not to calibrated RGB values.
- `scale_verification` and `verification_status = estimated` distinguish the
  manually reviewed raster labels and pixel-based interpolations. None of the
  five reviewed pages supplies a machine-readable official RGB-value lookup.
- `numerical_values_verified` is deliberately `false` for all five: pixel
  tick interpretation is not an authoritative NASA mapping.
- `sampled_rgb_colors` stores the actual palette in left-to-right order (or
  bottom-to-top for the generic vertical sampler).
- `estimated_value_mapping` is explicitly approximate, restricted to the
  labeled anchors. `value_mapping` remains empty unless a verified mapping is
  available. Qualitative/out-of-range extensions are excluded.
- `numeric_interpolation_supported` indicates a carefully labeled *estimate*
  scheme is present, not scientific verification of an official conversion.
- Authoritative values should not be reconstructed from the map's colors.
  Change-detection hashes stop modern/precipitation extraction if a reviewed
  NASA raster changes. Source URLs and timestamps are saved in every record.

Precipitation is not one linear gradient: it has separate liquid and frozen
**discrete** palettes, boundaries `0.1, 0.2, 0.3, 0.5, 1, 2, 3, 5, 10, 20, 50`
mm/hour, an overflow extension over 50, and a separate grey swatch with no
assigned scientific meaning. Interval inclusivity is not supplied by NASA's
raster. CO has nonuniform `40, 100, 130, 200, 500 ppbv` anchors;
NOx has decade (`10^-3 ... 10^1 ppbv`) anchors. Temperature has eight Celsius
anchors `-40, -20, -10, 0, 10, 20, 30, 40 °C` plus qualitative extensions;
short NASA text describes 3 m, while longer description and T2M say 2 m.
Active fires shows a moving five-day window of VIIRS **fire radiative power**
(`MW`), not fire counts/categories, with labels 0–8 MW and an uncalibrated
white extension. These limitations are captured in JSON and `REPORT.md`.

## Integration with Agent 1

First keep the corrected CO mapping in Agent 1's downloader too: `5115` is CO2,
`5153` is CO. If Agent 1 downloads `carbon_monoxide.png`, pass its directory to
this program. This directory is used *only after official discovery fails*:

```bash
python color_scales/extract_color_scales.py --image-dir /path/to/data/images
# An explicit rectangular crop, if NASA has no linked legend:
python color_scales/extract_color_scales.py --category active_fires \
  --image-dir /path/to/data/images --crop 100,400,800,50
```

Adding Agent 1 imagery does not erase prior success, and this code does not
modify Agent 1 files or create `data/images/`, `data/metadata.json`, or
`download_eic.py`.

## Tests and provenance

```bash
python -m unittest discover -s color_scales/tests -v
```

The suite covers horizontal and vertical synthetic gradients, white neutral
points, discrete intervals, discovery of linked official assets, manual crop
validation, missing labels/units, corrupt/missing files, explicit failures,
independence from the downloader, and offline actual-NASA fixture extraction.
`source_evidence/` preserves reviewed NASA SVS HTML, and `tests/fixtures/`
contains source colorbars plus a primary-video frame. Live access is *not*
required to run the suite. No AGENTS.md instructions existed in the initial
repository snapshot. DeepSpace was not needed for assistance: direct NASA
HTML/asset inspection and local OpenCV testing were sufficient. No DeepSpace
API or capability is claimed.
