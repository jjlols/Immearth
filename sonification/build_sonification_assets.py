"""Build bounded, image-relative regional features for the React audio layer.

All cells are nearest reviewed-palette estimates, never verified numeric readings.
The original raster is not downsized, altered or geographically inferred.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import numpy as np
from PIL import Image
from .palette_library import region_features, read_palette, IDS

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_GRID = (6, 8)


def analyze(category, source: Path, grid=DEFAULT_GRID):
    if len(grid) != 2 or not all(isinstance(value, int) for value in grid):
        raise TypeError('Grid must be a (rows, columns) integer pair')
    rows, columns = grid
    if rows <= 0 or columns <= 0 or rows * columns > 4096:
        raise ValueError('Grid must have positive dimensions, at most 4096 cells')
    with Image.open(source) as image:
        image.load()
        rgba = np.asarray(image.convert('RGBA'), dtype=np.uint8)
    height, width, _ = rgba.shape
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
                    'scale_extraction_time': source_record.get('extraction_timestamp'),
                    'ticks_status': source_record.get('verification_status'),
                },
            })
        print(f'Analyzed {category}, row {row + 1}/{rows}', flush=True)
    return batches


def build_assets(image_dir=ROOT / 'data/images', grid=DEFAULT_GRID):
    if tuple(grid) != DEFAULT_GRID:
        raise ValueError('The versioned feature contract is currently 6 rows by 8 columns')
    return {'schema_version': 1, 'grid': {'rows': grid[0], 'columns': grid[1]},
            'categories': {category: analyze(category, image_dir / f'{category}.png', grid=grid) for category in IDS},
            'caption': 'nearest palette interpreted voxel estimates only ─ never a backend'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--image-dir', type=Path, default=ROOT / 'data/images')
    parser.add_argument('--output', type=Path, default=ROOT / 'overlay-site/scales/features.json')
    parser.add_argument('--grid', nargs=2, type=int, default=DEFAULT_GRID, metavar=('ROWS', 'COLUMNS'))
    args = parser.parse_args()
    directory = args.output.parent
    directory.mkdir(exist_ok=True, parents=True)
    temporary = args.output.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(build_assets(args.image_dir, tuple(args.grid)), indent=2) + '\n')
    temporary.replace(args.output)
    print(f'Wrote estimated regional inputs to {args.output}')


if __name__ == '__main__':
    main()
