"""Legend, logo and date-badge rectangles on the NASA frames in data/images/.

One shared place for both builders: build_value_grids.py (1-degree grids) and
sonification/build_sonification_assets.py (the 6x8 music features). Pixels inside
these rectangles are labels drawn on the map, not field values, so both builders
treat them as no data.
"""
from __future__ import annotations

# Rectangles are (x0, y0, x1, y1) in source pixels, x1/y1 exclusive.
# Measured on the images in data/images/ on 2026-11-14, not copied from guesses.
#
# active_fires.png (4096x2048): white date "13 Nov 2026" sits at about
# y=1722-1763, x=154-498; the "Fire Radiative Power" label at y=1813-1832;
# the colorbar and its arrow at y=1856-1898, x=64-619; tick numbers at
# y=1911-1926; "MW" at y=1944-1954. One rectangle covers that whole legend.
#
# The three GMAO frames (2048x1024) share a layout. The logo plaque is a flat
# color from x=0 through x=340 and y=0 through y=70, and the map color resumes
# by x=350 and y=74. The date badge is a grey rounded rectangle along the
# bottom: carbon monoxide turns from map yellow to badge grey between y=920
# and y=928 and ends near x=499; temperature and nitrogen oxides use the same
# corner. near_surface_temperature.png has no colorbar drawn on the map.
LEGEND_MASKS = {
    "precipitation": {"size": (3600, 1800), "boxes": []},
    "active_fires": {"size": (4096, 2048), "boxes": [(48, 1690, 670, 1980)]},
    "carbon_monoxide": {"size": (2048, 1024), "boxes": [(0, 0, 348, 74), (0, 924, 512, 1024)]},
    "nitrogen_oxides": {"size": (2048, 1024), "boxes": [(0, 0, 348, 74), (0, 926, 512, 1024)]},
    "near_surface_temperature": {"size": (2048, 1024), "boxes": [(0, 0, 348, 74), (0, 924, 512, 1024)]},
}


def boxes_for(layer: str, width: int, height: int) -> list[tuple[int, int, int, int]]:
    """Rectangles for one data/images frame; refuse a frame whose size changed."""
    record = LEGEND_MASKS[layer]
    if record["boxes"] and tuple(record["size"]) != (width, height):
        raise ValueError(
            f"{layer} frame is {width}x{height}, masks were measured on "
            f"{record['size'][0]}x{record['size'][1]}; re-measure the legend rectangles"
        )
    return list(record["boxes"])
