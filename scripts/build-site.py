"""Package the maintained storefront at the Pages root, including only used assets."""
import json
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
    files.update(ROOT / path for path in assets)
    for path in files:
        if not path.is_file() or not path.resolve().is_relative_to(ROOT):
            raise ValueError(f'Missing or invalid source: {path}')
    return sorted(files)


def build():
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
            destination.write_text(text, encoding='utf-8')
        else:
            shutil.copyfile(source, destination)
    (OUTPUT / '.nojekyll').write_text('', encoding='utf-8')
    expected.add(OUTPUT / '.nojekyll')
    # Refuse stale output rather than accidentally publishing an unrelated file.
    unexpected = {p for p in OUTPUT.rglob('*') if p.is_file()} - expected
    if unexpected:
        raise ValueError(f'Unexpected build files: {unexpected}')
    size = sum(p.stat().st_size for p in expected)
    print(f'Built {len(expected)} files ({size / 1024 / 1024:.1f} MiB) in {OUTPUT.name}/')


if __name__ == '__main__':
    build()
