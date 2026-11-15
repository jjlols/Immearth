# Value grids

`build_value_grids.py` turns the five map images in `data/images/` into 360 by 180 estimated grids. Each pixel is matched to the nearest color in that layer's `color_scales/output/<layer>/scale.json`, then reduced to one-degree cells.

These numbers are **estimated from NASA's published colorbar**, not an official data product. Every scale used here has `scale_verification` set to `"estimated"` and `numerical_values_verified` set to false. That status is copied into each grid file as `scale_verification`.

## Run

Python 3.10 or newer, with Pillow and numpy (`requirements.txt`):

```text
py -3 build_value_grids.py
py -3 build_value_grids.py --layer near_surface_temperature
py -3 -m pytest -q tests/test_value_grids.py
```

On this machine `python` is an older install without these packages. `py -3` is Python 3.12.

| Flag | Meaning |
| --- | --- |
| `--layer NAME` | Build one layer. Repeat the flag to build several. Default: all five. |
| `--delta-e` | CIE76 distance cutoff for every selected layer. Default is 12 for precipitation, 16 for active fires, and 18 for the three GMAO frames. |
| `--min-valid-fraction` | A one-degree cell is null unless at least this share of its source pixels match. Default `0.30`. |
| `--image-dir`, `--scale-dir`, `--output-dir` | Override `data/images`, `color_scales/output`, and `data/grids`. |
| `--no-debug` | Skip the magenta debug PNG. |

## Files

| File | Contents |
| --- | --- |
| `<layer>.json` | Compact grid. `values` is row-major, 64800 numbers, `null` allowed. Precipitation also has `palette` (`liquid`, `frozen`, `mixed`, or `null`). |
| `<layer>.description.json` | Screen-reader summary: range, where the high and low values fall, and how much of the globe decoded. |
| `debug/<layer>.png` | 1440 by 720 preview. Brighter means a higher estimated value. Empty cells are magenta. |

Shared fields: `layer`, `units`, `value_min`, `value_max`, `scale_verification`, `width` (360), `height` (180), `lat_lon_convention`.

Row 0 is 90 N and column 0 is 180 W. Cell `(row, col)` is centered at latitude `90 - (row + 0.5)` and longitude `-180 + (col + 0.5)`.

## How a pixel becomes a number

1. Convert the pixel and every scale sample from sRGB to CIELAB (D65). Pick the nearest sample by CIE76 distance, which is the Euclidean distance in Lab. The search is vectorized in numpy, in row chunks, rather than a Python loop over pixels.
2. If that distance is past the layer's Delta-E cutoff, the pixel is null. That drops ocean and land basemap, coastlines, ice that is not on the palette, burned-in colorbars, dates, and logos.
3. Known overlay rectangles are masked as well. They were measured on the images in `data/images/` on 2026-11-14. Coordinates are `(x0, y0, x1, y1)` with `x1` and `y1` exclusive.

   | Layer | Rectangles |
   | --- | --- |
   | precipitation | none. The composite has no legend on the map. |
   | active_fires | `(48, 1690, 670, 1980)` — date "13 Nov 2026", the "Fire Radiative Power" label, the colorbar and arrow, the tick numbers, and "MW" in the lower left of the 4096 by 2048 image. |
   | carbon_monoxide | `(0, 0, 348, 74)` logo plaque and `(0, 924, 512, 1024)` date badge. The badge grey starts between y=920 and y=928 and ends near x=499. |
   | nitrogen_oxides | `(0, 0, 348, 74)` and `(0, 926, 512, 1024)`. |
   | near_surface_temperature | `(0, 0, 348, 74)` and `(0, 924, 512, 1024)`. This frame has no colorbar on the map. The logo blues and whites would otherwise look cold, and the grey date badge sits close to the hot end of the legend. |

4. The matched sample's colorbar position is turned into a value from the ticks in `scale.json`:
   - Temperature is piecewise linear between -40, -20, -10, 0, 10, 20, 30, and 40 °C. A white sample past the last tick is dropped.
   - Nitrogen oxides is piecewise linear in log10 between 0.001, 0.01, 0.1, 1, and 10 ppbv. The ticks are not evenly spaced, so this is not one straight line in log space.
   - Carbon monoxide is piecewise linear between the uneven anchors 40, 100, 130, 200, and 500 ppbv. A white sample past the last tick is dropped.
   - Active fires is piecewise linear between 0, 2, 4, 6, and 8 MW.
   - Precipitation is discrete. Each of the 11 colors is one block. Tick `i` is the left edge of color `i` (the grey swatch left of 0.1 is not a data color). The stored value is the geometric mean of that block. The last color starts at 50 mm/hour and has no upper tick, so it is stored as 50, meaning 50 or more. The two darkest frozen colors in the legend file are the same RGB, so frozen rates above 20 mm/hour cannot be split from that top block. Category description strings in `scale.json` are shifted one bin relative to the ticks; the grid follows the ticks.
5. Source pixels are binned into 360 by 180 cells. The cell value is the median of matching pixels. If fewer than 30 percent of the source pixels match, the cell is null. For precipitation, the cell palette is the majority of `liquid` or `frozen`, or `mixed` on a tie.
6. Values are rounded so the JSON stays small: temperature and carbon monoxide to 0.1, fires to 0.01, nitrogen oxides to 4 significant figures, precipitation to 3 significant figures. `value_min` and `value_max` are taken after rounding.
7. Coverage in the description is weighted by the cosine of latitude, so polar cells do not count the same as equatorial ones. Place names come from a small built-in list of continents, oceans, and poles. The wording is "in or near" because the boxes are rough. Nothing is geocoded over the network.

## Debug images

Nulls are magenta `(255, 0, 255)`. Matching cells are grayscale, with higher values brighter. Nitrogen oxides and precipitation are stretched in log10; the other layers are linear between the 2nd and 98th percentile of finite cells. The 360 by 180 grid is drawn at 4x with nearest-neighbor pixels.

## Results from the images on 2026-11-14

All five files keep `scale_verification: "estimated"`.

| Layer | Estimated range | Coverage | High | Low |
| --- | --- | --- | --- | --- |
| precipitation | 0.141 to 31.6 mm/hour | 9% | about 31.6, North Pacific, ~30 N 170 E | about 0.141, mostly the Southern Ocean |
| active_fires | none | 0% | none | none |
| carbon_monoxide | 49.4 to 493.2 ppbv | 99% | about 493, East Asia, ~30 N 122 E | about 49.4, in or near southern South America, ~41 S 62 W |
| nitrogen_oxides | 0.001 to 9.47 ppbv | 90% | about 9.47, largest share East Asia, ~36 N 120 E | about 0.001, Antarctica |
| near_surface_temperature | -38.7 to 39.8 °C | 99% | about 39.8, northern Australia, ~18 S 125 E | about -38.7, Antarctica |

Sanity checks against the pictures and the legends:

- Temperature sits inside the labeled -40 to 40 °C scale, so it cannot reach a hotter reading such as 45 °C. The debug image is dark at both poles and light through the tropics and subtropics. The logo and the date badge are magenta.
- Precipitation leaves most of the globe empty. Continents, open ocean, and Antarctic ice are not on the rain or snow palettes. What remains are storm bands. About 82 percent of decoded cells are liquid and about 18 percent are frozen. The high value 31.6 is the geometric mean of the 20 to 50 mm/hour block, not the unbounded 50-or-more color.
- Carbon monoxide stays inside 40 to 500 ppbv. The brightest areas are East Asia, with other bright regions over South America and Africa. The logo and date badge are magenta.
- Nitrogen oxides stays inside 0.001 to 10 ppbv. Bright values sit over land and industrial regions, especially East Asia. A dark band in the source image is not on the green scale, so those cells are magenta and coverage is about 90 percent rather than nearly full. The low end of this legend is white, so bright ice can be read as the minimum.
- Active fires is empty on purpose. The colorbar in the lower left matches the legend (distance about 0) and is masked, so it is not turned into fake fires. Outside that rectangle, no pixel has a channel above 80. Land is near black and ocean is about RGB (34, 50, 73). Both are far from the beige fire colorbar, so every cell fails the color match. The 30 percent rule is not what emptied this image. The debug PNG is entirely magenta.
