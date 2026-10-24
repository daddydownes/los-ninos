"""Package the maintained storefront at the Pages root, including only used assets."""
import json
import argparse
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'demo/directions/pages'
OUTPUT = ROOT / '_site'


def source_files():
    html = (SOURCE / 'index.html').read_text(encoding='utf-8')
    runtime = {'index.html'} | set(re.findall(r'(?:src|href)="([^"?#/]+\.(?:css|js))', html))
    files = {SOURCE / name for name in runtime}
    assets = set()
    for path in files:
        assets.update(re.findall(r'\.\./\.\./\.\./(assets/[\w./-]+)', path.read_text(encoding='utf-8')))
    fonts = ROOT / 'assets/fonts/fonts.css'
    for name in re.findall(r'url\(\./([\w.-]+)\)', fonts.read_text(encoding='utf-8')):
        assets.add('assets/fonts/' + name)
    assets.update({'assets/fonts/BarlowCondensed-OFL.txt', 'assets/fonts/DMSans-OFL.txt'})
    manifest = json.loads((ROOT / 'assets/hat-spin/sequence.json').read_text(encoding='utf-8'))
    for frame in manifest['frames']:
        assets.add('assets/hat-spin/' + (frame if isinstance(frame, str) else frame['src']))
        if isinstance(frame, dict) and frame.get('srcSmall'):
            assets.add('assets/hat-spin/' + frame['srcSmall'])
    for key in ('poster', 'posterSmall'):
        if manifest.get(key):
            assets.add('assets/hat-spin/' + manifest[key])
    files.update(ROOT / path for path in assets)
    for path in files:
        if not path.is_file() or not path.resolve().is_relative_to(ROOT):
            raise ValueError(f'Missing or invalid source: {path}')
    return sorted(files)


def build(commerce_enabled=False):
    files = source_files()
    OUTPUT.mkdir(exist_ok=True)
    expected = set()
    for source in files:
        destination = OUTPUT / (source.name if source.parent == SOURCE else source.relative_to(ROOT))
        expected.add(destination)
        destination.parent.mkdir(parents=True, exist_ok=True)
        if source.parent == SOURCE:
            text = source.read_text(encoding='utf-8').replace('../../../assets/', 'assets/')
            if source.name == 'index.html':
                text = text.replace('<head>', '<head>\n  <meta name="robots" content="noindex,nofollow">')
                if commerce_enabled:
                    text = text.replace('<head>', '<head>\n  <meta name="los-ninos-commerce" content="enabled">')
            destination.write_text(text, encoding='utf-8')
        else:
            shutil.copyfile(source, destination)
    # Checkout/admin assets share the storefront origin so requests and auth
    # stay same-origin. Runtime secrets and database files are never packaged.
    commerce = ROOT / 'commerce/public'
    if commerce.is_dir():
        for source in sorted(commerce.rglob('*')):
            if source.is_file() and source.suffix in {'.html', '.css', '.js'}:
                destination = OUTPUT / source.relative_to(commerce)
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, destination)
                expected.add(destination)
    # A design review uses the maintained shop, rather than a second hand-edited
    # copy. Keep the real four-second intro, product layout and checkout behavior.
    opening = (OUTPUT / 'index.html').read_text(encoding='utf-8')
    opening = opening.replace('data-price-size="03"', 'data-price-size="original"')
    opening = opening.replace('<title>Los Niños — Con Sueños</title>', '<title>Los Niños — Bold 06 opening preview</title>')
    opening_path = OUTPUT / 'opening-06.html'
    opening_path.write_text(opening, encoding='utf-8')
    expected.add(opening_path)
    # Five smaller versions share the exact storefront and post-intro reveal.
    # Only this review route includes the size switcher; the shop stays intact.
    sizes = opening.replace('data-price-size="original"', 'data-price-size="03"')
    sizes = sizes.replace('</head>', '  <link rel="stylesheet" href="price-sizes.css?v=2">\n  <script defer src="price-sizes.js?v=1"></script>\n</head>')
    sizes = sizes.replace('<title>Los Niños — Bold 06 opening preview</title>', '<title>Los Niños — Five smaller price options</title>')
    sizes_path = OUTPUT / 'price-sizes.html'
    sizes_path.write_text(sizes, encoding='utf-8')
    expected.add(sizes_path)
    (OUTPUT / '.nojekyll').write_text('', encoding='utf-8')
    expected.add(OUTPUT / '.nojekyll')
    # Refuse stale output rather than accidentally publishing an unrelated file.
    unexpected = {p for p in OUTPUT.rglob('*') if p.is_file()} - expected
    if unexpected:
        raise ValueError(f'Unexpected build files: {unexpected}')
    size = sum(p.stat().st_size for p in expected)
    print(f'Built {len(expected)} files ({size / 1024 / 1024:.1f} MiB) in {OUTPUT.name}/')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--commerce', action='store_true', help='Enable the Worker-backed checkout entry point')
    build(parser.parse_args().commerce)
