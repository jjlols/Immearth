"""Prepare validated existing mapping datasets and immutable SciRGB feature tables."""
from pathlib import Path
import hashlib,json,shutil,time
from sonification.build_sonification_assets import build_assets

ROOT=Path(__file__).resolve().parents[1]
MUSIC=ROOT/'public/audio/deliberate-thought.mp3'
LICENSE=ROOT/'LICENSES.md'


def adapt_record_data(directory=ROOT/'public', write=True):
    (directory/'assets').mkdir(exist_ok=True)
    for path in (ROOT/'overlay-site/assets').glob('*.png'):
        if path.name in {'latest-fire-color.png','latest-fire-approved.png','sources-approved-active-fire-color.png','fires-float.exr'}:
            continue
        shutil.copyfile(path,directory/'assets'/path.name)
    geo=next((p for p in (ROOT/'overlay-site/assets').glob('*.geojson')),None)
    if geo:
        shutil.copyfile(geo,directory/'assets/natural-earth-source.geojson')
    (directory/'scales').mkdir(exist_ok=True)
    for path in (ROOT/'overlay-site/scales').glob('*.json'):
        shutil.copyfile(path,directory/'scales'/path.name)
    return directory


def metadata(directory=ROOT/'public',transfer=True):
    if not MUSIC.is_file(): raise RuntimeError('Music file required! Download from incompetech as licensed source.')
    digest=hashlib.sha256(MUSIC.read_bytes()).hexdigest()
    license_record={
        'source':'Kevin MacLeod (incompetech.com)',
        'title':'Deliberate Thought','license':'CC BY 4.0',
        'license_url':'https://creativecommons.org/licenses/by/4.0/',
        'raw_duration_seconds':177.456,'sha256':digest,
        'modification':'Web Audio mixer gains, spectral routing, and bounded scientific accents; no actual official stems',
    }
    (directory/'attribution.json').write_text(json.dumps(license_record,indent=2)+'\n')
    return license_record


def main():
    directory=adapt_record_data();print('Geography + palette features staged',directory)
    print('Attribution metadata:',metadata()['title'])


if __name__=='__main__':
    main()
