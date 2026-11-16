"""Build bounded, image-relative regional features for the React audio layer.

All cells are nearest reviewed-palette estimates, never verified numeric readings.
The original raster is not downsized, altered or geographically inferred.

Rain is read from NASA's transparent IMERG layer (the same pixels the Live Map
draws), not from the composite in data/images, whose Blue Marble land browns sit
close to the heavy-rain reds. The legend, logo and date badge drawn on the other
frames are masked as no data (sonification/image_masks.py, shared with
build_value_grids.py).
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import numpy as np
from PIL import Image
from .palette_library import region_features, read_palette, IDS
from .image_masks import boxes_for

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_GRID = (6, 8)
# NASA's transparent IMERG rain layer (SVS 4285 imergert_alpha), written to public/
# by build_geographic_overlays.py and prepare_jukebox_assets.py. Alpha marks rain.
# The downloaded NASA layer that build_geographic_overlays.py writes first, not the served
# copy (prepare_jukebox_assets.py updates that last), so a refresh never pairs new rain with old features.
RAIN_SOURCE = ROOT / 'overlay/inputs/precipitation-source.png'


def raster_name(source):
    path = Path(source).resolve()
    return str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else path.name


def analyze(category, source: Path, grid=DEFAULT_GRID, masks=()):
    if len(grid) != 2 or not all(isinstance(value, int) for value in grid):
        raise TypeError('Grid must be a (rows, columns) integer pair')
    rows, columns = grid
    if rows <= 0 or columns <= 0 or rows * columns > 4096:
        raise ValueError('Grid must have positive dimensions, at most 4096 cells')
    with Image.open(source) as image:
        image.load()
        rgba = np.array(image.convert('RGBA'), dtype=np.uint8)
    height, width, _ = rgba.shape
    for x0, y0, x1, y1 in masks:
        # Labels drawn on the map are not field values: treat them as no data.
        rgba[y0:y1, x0:x1, 3] = 0
    if width < columns or height < rows:
        raise ValueError(f'Analysis grid {rows}x{columns} requires nonempty bounded sample cells')
    source_record = read_palette(category)
    batches = []
    for row in range(rows):
        for column in range(columns):
            x0, x1 = column * width // columns, (column + 1) * width // columns
            y0, y1 = row * height // rows, (row + 1) * height // rows
            batches.append({
                **region_features(category, rgba[y0:y1, x0:x1]),
                'region': {
                    'id': f'{category}-region-{row}-{column}', 'row': row, 'column': column,
                    'bounds_relative': [column / columns, row / rows, (column + 1) / columns, (row + 1) / rows],
                    'width': width, 'height': height,
                },
                'source': {
                    'url': source_record['source_url'], 'asset_url': source_record.get('source_asset_url'),
                    'raster': raster_name(source), 'masked_rectangles': [list(box) for box in masks],
                    'scale_extraction_time': source_record.get('extraction_timestamp'),
                    'ticks_status': source_record.get('verification_status'),
                },
            })
        print(f'Analyzed {category}, row {row + 1}/{rows}', flush=True)
    return batches


def source_for(category, image_dir=ROOT / 'data/images', rain_source=RAIN_SOURCE):
    """The raster and its no-data rectangles for one category."""
    if category == 'precipitation':
        with Image.open(rain_source) as image:
            if 'A' not in image.getbands():
                raise ValueError(f'{rain_source} must be NASA\'s transparent rain layer')
        return Path(rain_source), []
    path = Path(image_dir) / f'{category}.png'
    with Image.open(path) as image:
        width, height = image.size
    return path, boxes_for(category, width, height)


def build_assets(image_dir=ROOT / 'data/images', grid=DEFAULT_GRID, rain_source=RAIN_SOURCE):
    if tuple(grid) != DEFAULT_GRID:
        raise ValueError('The versioned feature contract is currently 6 rows by 8 columns')
    categories = {}
    for category in IDS:
        path, masks = source_for(category, image_dir, rain_source)
        categories[category] = analyze(category, path, grid=grid, masks=masks)
    return {'schema_version': 1, 'grid': {'rows': grid[0], 'columns': grid[1]},
            'categories': categories,
            'caption': 'nearest palette interpreted voxel estimates only ─ never a backend'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--image-dir', type=Path, default=ROOT / 'data/images')
    parser.add_argument('--rain-source', type=Path, default=RAIN_SOURCE, help="NASA's transparent IMERG rain layer")
    parser.add_argument('--output', type=Path, default=ROOT / 'overlay-site/scales/features.json')
    parser.add_argument('--grid', nargs=2, type=int, default=DEFAULT_GRID, metavar=('ROWS', 'COLUMNS'))
    args = parser.parse_args()
    directory = args.output.parent
    directory.mkdir(exist_ok=True, parents=True)
    temporary = args.output.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(build_assets(args.image_dir, tuple(args.grid), args.rain_source), indent=2) + '\n')
    temporary.replace(args.output)
    print(f'Wrote estimated regional inputs to {args.output}')


if __name__ == '__main__':
    main()
