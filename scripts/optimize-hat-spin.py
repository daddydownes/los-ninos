"""Rebuild the spin's transparent WebP images from its unchanged PNG masters.

Requires Python 3 and Pillow with WebP support. Run from any directory:
    python3 scripts/optimize-hat-spin.py
    python3 scripts/optimize-hat-spin.py --check

Full-size images keep the original dimensions. The 768px images reduce both
transfer size and decoded memory on phones; registration remains in the original
coordinate space described by sourceWidth/sourceHeight in sequence.json.
"""

import argparse
import json
import re
from pathlib import Path

from PIL import Image, features

ROOT = Path(__file__).resolve().parents[1] / 'assets/hat-spin'
MANIFEST = ROOT / 'sequence.json'
SMALL_EDGE = 768
QUALITY = 92


def original_path(src):
    if re.fullmatch(r'ai-v\d+/frame-\d{3}\.png', src):
        return Path(src)
    match = re.fullmatch(r'optimized/(ai-v\d+)-(frame-\d{3})\.webp', src)
    if not match:
        raise ValueError(f'Unrecognized frame source: {src}')
    return Path(match[1]) / (match[2] + '.png')


def verify_image(path, expected):
    with Image.open(path) as image:
        if image.format != 'WEBP' or image.size != expected.size:
            raise ValueError(f'Incorrect format or dimensions: {path}')
        if image.mode != 'RGBA' or image.getchannel('A').tobytes() != expected.getchannel('A').tobytes():
            raise ValueError(f'Alpha channel changed: {path}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Verify generated images without writing files')
    args = parser.parse_args()
    if not features.check('webp'):
        raise RuntimeError('Pillow must be built with WebP support')

    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    source_size = None
    totals = {'png': 0, 'full': 0, 'small': 0}
    for frame in manifest['frames']:
        source = original_path(frame['src'])
        stem = source.parent.name + '-' + source.stem
        full = Path('optimized') / (stem + '.webp')
        small = Path('optimized') / (stem + '-768.webp')
        with Image.open(ROOT / source) as image:
            original = image.convert('RGBA')
        if source_size is None:
            source_size = original.size
        elif original.size != source_size:
            raise ValueError('All frames must use the same source coordinate space')
        resized = original.copy()
        resized.thumbnail((SMALL_EDGE, SMALL_EDGE), Image.Resampling.LANCZOS)
        for path, image in ((full, original), (small, resized)):
            if not args.check:
                (ROOT / path).parent.mkdir(parents=True, exist_ok=True)
                image.save(ROOT / path, 'WEBP', quality=QUALITY, method=6, exact=True)
            verify_image(ROOT / path, image)
        if args.check and (frame['src'] != full.as_posix() or frame.get('srcSmall') != small.as_posix()):
            raise ValueError(f'Manifest does not reference both optimized images: {source}')
        frame['src'] = full.as_posix()
        frame['srcSmall'] = small.as_posix()
        totals['png'] += (ROOT / source).stat().st_size
        totals['full'] += (ROOT / full).stat().st_size
        totals['small'] += (ROOT / small).stat().st_size

    expected_fields = {
        'sourceWidth': source_size[0],
        'sourceHeight': source_size[1],
        'poster': manifest['frames'][0]['src'],
        'posterSmall': manifest['frames'][0]['srcSmall'],
    }
    if args.check:
        for key, value in expected_fields.items():
            if manifest.get(key) != value:
                raise ValueError(f'Manifest field {key} should be {value!r}')
    else:
        manifest.update(expected_fields)
        MANIFEST.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')

    print(f"Verified {len(manifest['frames'])} full-size and 768px WebP frames; alpha preserved exactly.")
    print(f"Original PNG sequence: {totals['png']:,} bytes")
    for kind in ('full', 'small'):
        saved = (1 - totals[kind] / totals['png']) * 100
        print(f"{kind.capitalize()} WebP sequence: {totals[kind]:,} bytes ({saved:.1f}% smaller)")


if __name__ == '__main__':
    main()
