"""Package the latest zoom storefront with the existing production commerce UI.

This only builds static assets; it does not deploy or change Worker configuration.
"""
import ctypes
import importlib.util
import os
import re
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / '_site'
COMMERCE_FILES = {
    'checkout.html', 'checkout.js', 'checkout-refined.css',
    'order.html', 'order.js', 'commerce.css', 'commerce.js', 'bag-state.js',
    'admin.html', 'admin.js', 'admin.css',
    'owner-login.html', 'owner-login.js', 'owner-login.css',
}
FILM_FILES = {'campaign.mp4', 'campaign-mobile.mp4',
              'campaign-cover.jpg'}
CAMPAIGN = """(() => {
  'use strict';
  const selected = Object.freeze({id:'campaign',time:0,
    name:'Portrait to full film',sourceFrame:1563,posterId:'portrait',duration:421/30,
    src:'assets/film/campaign.mp4',mobileSrc:'assets/film/campaign-mobile.mp4',
    poster:'assets/film/campaign-cover.jpg',mobilePoster:'assets/film/campaign-cover.jpg'});
  window.LosNinosFilmOpenings = Object.freeze({selected});
})();
"""


def package(output):
    spec = importlib.util.spec_from_file_location('zoom_demo', ROOT / 'scripts/build-zoom-demo.py')
    demo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(demo)
    demo.package(output)
    for name in ('demo-catalog.json', 'demo-checkout.js', 'mobile-bag-debug.js', '.nojekyll'):
        (output / name).unlink(missing_ok=True)
    for path in (output / 'assets/film').iterdir():
        if path.name not in FILM_FILES:
            path.unlink()
    (output / 'film-openings.js').write_text(CAMPAIGN, encoding='utf-8')
    bag = (ROOT / 'demo/zoom-storefront/journey-bag.js').read_text(encoding='utf-8')
    (output / 'journey-bag.js').write_text(bag.replace('../../../assets/', 'assets/'), encoding='utf-8')
    for name in COMMERCE_FILES:
        shutil.copyfile(ROOT / 'commerce/public' / name, output / name)
    for name in ('checkout.html', 'order.html'):
        page = output / name
        page.write_text(page.read_text(encoding='utf-8').replace('href="./"', 'href="./?return=shop"'), encoding='utf-8')
    page = output / 'index.html'
    html = page.read_text(encoding='utf-8')
    html = re.sub(r'<meta\s+name="robots"[^>]*>', '', html)
    html = re.sub(r'<span class="concept-link">(?:Local preview|Website demo)</span>', '', html)
    html = re.sub(r'<script src="mobile-bag-debug\.js[^\"]*"></script>', '', html)
    page.write_text(html, encoding='utf-8')
    validate(output)


def validate(output):
    required = COMMERCE_FILES | {'index.html', 'journey-bag.js', 'film-openings.js',
        'rotation-assets/refined-hat.json', 'assets/fonts/fonts.css'}
    required |= {'assets/film/' + name for name in FILM_FILES}
    for name in required:
        if not (output / name).is_file():
            raise ValueError(f'Missing production asset: {name}')
    html = (output / 'index.html').read_text()
    bag = (output / 'journey-bag.js').read_text()
    if '<meta name="los-ninos-commerce" content="enabled">' not in html:
        raise ValueError('Commerce entry point is disabled')
    if "new URL('api/catalog', source)" not in bag or "new URL('checkout.html', source)" not in bag:
        raise ValueError('Production catalog/checkout wiring changed')
    for path in output.rglob('*'):
        if not path.is_file():
            continue
        if path.stat().st_size > 25 * 1024 * 1024:
            raise ValueError(f'Asset exceeds 25 MiB: {path.relative_to(output)}')
        if path.suffix in {'.html', '.js'} and 'demo-catalog.json' in path.read_text():
            raise ValueError(f'Sample catalog remains in {path.name}')
        if path.suffix != '.html':
            continue
        for reference in re.findall(r'(?:src|href)="([^"?#]*)', path.read_text()):
            if not reference or reference.startswith(('https:', 'http:', 'data:', 'mailto:', 'tel:')):
                continue
            relative = reference.lstrip('/')
            if relative in ('', '.', './'):
                continue
            if relative == 'api/admin/export':
                continue  # Authenticated Worker endpoint, not a static file.
            if not (output / relative).is_file() and not (output / (relative + '.html')).is_file():
                raise ValueError(f'Missing reference in {path.name}: {reference}')


def install(staging):
    if not OUTPUT.exists():
        staging.rename(OUTPUT)
        return
    if OUTPUT.is_symlink() or not OUTPUT.is_dir():
        raise ValueError('Refusing to replace a non-directory _site')
    # Exchange complete directories without a partially populated output window.
    libc = ctypes.CDLL(None, use_errno=True)
    if sys.platform == 'darwin':
        result = libc.renamex_np(os.fsencode(staging), os.fsencode(OUTPUT), 2)
    elif sys.platform.startswith('linux') and hasattr(libc, 'renameat2'):
        result = libc.renameat2(-100, os.fsencode(staging), -100, os.fsencode(OUTPUT), 2)
    else:
        raise RuntimeError('Atomic directory exchange is unavailable; existing _site preserved')
    if result != 0:
        raise OSError(ctypes.get_errno(), 'Atomic _site exchange failed')


def build():
    staging = Path(tempfile.mkdtemp(prefix='.zoom-shop-', dir=ROOT))
    try:
        package(staging)
        install(staging)
    finally:
        if staging.exists():
            shutil.rmtree(staging)
    files = [p for p in OUTPUT.rglob('*') if p.is_file()]
    print(f'Built production zoom shop: {len(files)} files, '
          f'{sum(p.stat().st_size for p in files) / 1048576:.1f} MiB in {OUTPUT}')


if __name__ == '__main__':
    build()
