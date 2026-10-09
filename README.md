# Los Niños

Storefront preview with the stitched opening, photography, interactive hat views,
and a demonstration shopping bag. There is no payment or checkout integration.

The maintained source is `demo/directions/pages/index.html` and its adjacent
runtime CSS and JavaScript. `assets/` contains the assets used by this page.

Build with Python 3.11 or newer:

```sh
python scripts/build-site.py
python -m http.server 8000 --directory _site
```

Pushes to `main` build and deploy the storefront to GitHub Pages. The build
rewrites local asset paths for the hosted root and excludes old demos, source
photo collections, and diagnostics. The public preview requests no indexing.

## Browser regression checks

```sh
npm ci
npx playwright install webkit chromium
npm test
```

The suite builds the published site and checks WebKit iPhone, iPad and desktop
profiles plus Chromium Android and desktop profiles. It includes live Reduce
Motion changes, blocked downloads/storage, rotation, navigation, and bag history.
GitHub Actions runs the same suite for pull requests and pushes to main.
Device profiles do not reproduce physical iPhone performance or Safari chrome.
See [the iPhone/Safari audit](docs/iphone-safari-audit.md) for measured changes and
remaining real-device checks.

The spin uses full-size WebP images and 768px phone images; the original PNG
masters remain in source control. To regenerate or verify these assets, install
Pillow with WebP support and run `python3 scripts/optimize-hat-spin.py` or add
`--check`. This is optional for normal builds and browser tests.

The intro's transparent embroidery texture can be regenerated with
`node scripts/bake-embroidery.cjs` after installing WebKit and Pillow. Set `PYTHON`
if Pillow is installed in a different Python environment. The generator compares
the native render to the original SVG filter before writing the asset.
