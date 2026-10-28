"""Export the current film/zoom demo for static hosting, including project Pages.

The local storefront and live commerce remain unchanged. This export keeps its
interactive bag against a sample catalog and ends at a non-transactional summary.
"""
import argparse
import json
import re
import shutil
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ZOOM = ROOT / 'demo/zoom-storefront'
FILM = ROOT / 'demo/film-storefront'
SHARED = ROOT / 'demo/directions/pages'
CATALOG = {
    'mode': 'preview', 'revision': 1, 'acceptingOrders': True,
    'product': {'name': 'OG Snapback', 'priceCents': 3000,
                'available': 10, 'maxQuantity': 10},
}

CHECKOUT = '''<!doctype html>
<html lang="en-AU"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#080f19">
<title>Preview checkout — Los Niños</title>
<link rel="icon" href="assets/brand-icon.svg"><link rel="stylesheet" href="film.css">
<style>
body{min-height:100svh;display:grid;place-items:center;padding:32px 24px}
main{width:min(100%,480px)}.preview-label{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#c8d0da}
h1{font:800 clamp(48px,10vw,72px)/.95 Barlow,Arial,sans-serif;text-transform:uppercase;margin:22px 0}
p{font-size:14px;line-height:1.7;color:#c8d0da}.summary{display:grid;grid-template-columns:100px 1fr;gap:24px;align-items:center;margin:28px 0;padding:20px;background:#172331;border-radius:20px}
.summary img{width:100%;height:auto}.summary h2{font-size:18px;margin:0 0 10px}.summary p{margin:0}.total{display:flex;justify-content:space-between;gap:20px;font-size:18px;padding:12px 0 28px}.add{text-decoration:none;min-height:48px}
</style><script defer src="bag-state.js"></script><script defer src="demo-checkout.js"></script>
</head><body><main>
<span class="preview-label">Website demo</span><h1>Preview<br>checkout.</h1>
<p>This is a preview of the website. No order is placed, no payment is taken, and no email is sent.</p>
<section class="summary" aria-label="Your preview bag"><img src="assets/hat-front-logo-v1.webp" width="1254" height="1254" alt="OG Snapback"><div><h2>OG Snapback</h2><p id="preview-quantity">Your bag summary is loading.</p></div></section>
<div class="total"><span>Subtotal (AUD)</span><strong id="preview-total">—</strong></div>
<a class="add" href="./?return=shop#zoom-buy">Back to the demo <span aria-hidden="true">↗</span></a>
<noscript><p>Enable JavaScript to display your preview bag total.</p></noscript>
</main></body></html>
'''

CHECKOUT_JS = '''(() => {
  'use strict';
  const raw = Number(new URL(location.href).searchParams.get('quantity'));
  const requested = Number.isInteger(raw) && raw >= 1 && raw <= 10 ? raw : 0;
  const saved = window.LosNinosBagState?.read().quantity || 0;
  const quantity = saved || requested;
  document.querySelector('#preview-quantity').textContent = quantity
    ? `${quantity} ${quantity === 1 ? 'hat' : 'hats'} × $30 AUD`
    : 'Your preview bag is empty.';
  document.querySelector('#preview-total').textContent = new Intl.NumberFormat('en-AU', {
    style: 'currency', currency: 'AUD'
  }).format(quantity * 30);
})();
'''


def copy_asset(source, output, relative):
    if not source.is_file() or not source.resolve().is_relative_to(ROOT):
        raise ValueError(f'Missing or invalid asset: {source}')
    destination = output / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)


def replace_once(text, old, new, label):
    if text.count(old) != 1:
        raise ValueError(f'{label} changed; review the static-export adaptation')
    return text.replace(old, new, 1)


def package(output):
    html = (ZOOM / 'index.html').read_text(encoding='utf-8')
    html = html.replace('>Local preview<', '>Website demo<')
    runtime = set(re.findall(r'(?:src|href)="([^"?#/]+\.(?:css|js))', html))
    texts = [html]
    for name in sorted(runtime):
        source = next((folder / name for folder in (ZOOM, FILM, SHARED)
                       if (folder / name).is_file()), None)
        if source is None:
            raise ValueError(f'Missing runtime: {name}')
        text = source.read_text(encoding='utf-8').replace('../../../assets/', 'assets/')
        if name == 'journey-bag.js':
            text = replace_once(text, "new URL('api/catalog', source)",
                                "new URL('demo-catalog.json', source)", 'Catalog URL')
            text = text.replace('Test orders only. No payments or emails.',
                                'Website preview only. No orders, payments or emails.')
        if name == 'hat-rotation.js':
            if text.count("new URL('/rotation-assets/") != 2:
                raise ValueError('Rotation asset URLs changed; review Pages paths')
            text = text.replace("new URL('/rotation-assets/", "new URL('rotation-assets/")
        (output / name).write_text(text, encoding='utf-8')
        texts.append(text)
    (output / 'index.html').write_text(html, encoding='utf-8')

    # Explicitly include every film opening selectable by the existing runtime.
    # Original masters and unrelated repository files are never copied.
    for source in (ROOT / 'assets/film').iterdir():
        if source.is_file() and source.suffix in {'.mp4', '.jpg', '.webp', '.json'}:
            copy_asset(source, output, source.relative_to(ROOT))
    for source in (ROOT / 'assets/fonts').iterdir():
        if source.is_file() and source.suffix in {'.woff2', '.css', '.txt'}:
            copy_asset(source, output, source.relative_to(ROOT))
    assets = {'assets/brand-icon.svg'}
    for text in texts:
        assets.update(re.findall(r'(?<![\w-])assets/[\w./-]+\.(?:webp|png|jpg|svg|mp4|json|woff2)', text))
    for asset in sorted(assets):
        copy_asset(ROOT / asset, output, asset)
    for name in sorted(set(re.findall(r'zoom-photos/([\w-]+\.webp)', html))):
        copy_asset(ROOT / 'demo/archive-ideas/assets/photos' / name, output,
                   Path('zoom-photos') / name)
    # Use the approved rotation only. Repair candidates stay local and paused.
    for name in ('photo-turn-poster.webp', 'photo-turn-hd.mp4', 'photo-turn-mobile.mp4'):
        copy_asset(ZOOM / 'rotation-assets' / name, output, Path('rotation-assets') / name)
    copy_asset(ROOT / 'commerce/public/bag-state.js', output, 'bag-state.js')
    (output / 'demo-catalog.json').write_text(json.dumps(CATALOG, indent=2) + '\n', encoding='utf-8')
    (output / 'checkout.html').write_text(CHECKOUT, encoding='utf-8')
    (output / 'demo-checkout.js').write_text(CHECKOUT_JS, encoding='utf-8')
    (output / '.nojekyll').write_text('', encoding='utf-8')

    # Fail before publishing if a required local runtime reference is missing.
    for page in ('index.html', 'checkout.html'):
        text = (output / page).read_text(encoding='utf-8')
        for reference in re.findall(r'(?:src|href)="([^"?#]+)', text):
            if reference.startswith(('https:', 'http:', 'data:', './')):
                continue
            if reference.startswith('/') or not (output / reference).is_file():
                raise ValueError(f'Invalid static reference in {page}: {reference}')


def build(output):
    output = output.resolve()
    allowed = output == ROOT / '_site' or output.is_relative_to(ROOT / '.local')
    if not allowed or output == ROOT / '.local':
        raise ValueError('Output must be _site or a generated directory under .local/')
    output.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix='.zoom-export-', dir=output.parent))
    try:
        package(staging)
        if output.exists():
            shutil.rmtree(output)
        staging.rename(output)
    finally:
        if staging.exists():
            shutil.rmtree(staging)
    files = [p for p in output.rglob('*') if p.is_file()]
    size = sum(p.stat().st_size for p in files)
    print(f'Built static film/zoom demo: {len(files)} files, {size / 1024 / 1024:.1f} MiB in {output}')
    print('Sample catalog and preview checkout only; no order or payment API is included.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / '.local/zoom-demo-site')
    args = parser.parse_args()
    build(args.output if args.output.is_absolute() else ROOT / args.output)
