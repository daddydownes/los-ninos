# Los Niños

Storefront with the stitched opening, photography, interactive hat views, and an
optional bank-transfer checkout. The checkout saves orders, collects Australian
delivery details, and queues payment instructions. A private owner dashboard
supports manual payment confirmation, dispatch with tracking, and unpaid-order
cancellation.

The repository defaults to preview mode. Live ordering needs owner-controlled
Cloudflare hosting, a D1 database, protected owner sign-in, verified Resend email,
and the owner's confirmed stock and bank details. Hats are A$50 each with free
Australian shipping. A closed Cloudflare preview is deployed; owner sign-in,
email verification, stock and live checkout still need configuration. See the
[deployment status](docs/deployment-status.md) for the current addresses and checks.

## Try the checkout locally

Use Python 3.11+ and Node.js 22.13+ (the local database uses `node:sqlite`, which
may print an experimental-feature warning):

```sh
npm run preview:shop
```

Open `http://127.0.0.1:8766/` for the store and
`http://127.0.0.1:8766/admin.html` for the owner dashboard. Use fictional customer
details. Local preview skips owner login on the loopback address, sends no email,
and never requests money. Test orders persist in the ignored `.local/orders.sqlite`
file. It is not a production server.

```sh
npm run test:commerce
```

This command runs the commerce tests; it does not prove live email delivery or a
production deployment. See the [owner guide](docs/commerce-owner-guide.md) for daily
order handling and the [setup guide](docs/commerce-setup.md) for deployment,
launch checks, and backups.

## Static storefront preview

The maintained source is `demo/directions/pages/index.html` and its adjacent
runtime CSS and JavaScript. `assets/` contains the assets used by this page.

Build with Python 3.11 or newer:

```sh
python scripts/build-site.py
python -m http.server 8000 --directory _site
```

Pushes to `main` build and deploy the demonstration storefront to GitHub Pages.
That workflow uses the ordinary build, not `npm run build:shop`, and does not
enable live checkout. GitHub Pages is not the production commerce host. The build
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

## Ownership

Keep the domain, hosting, email account, database, and recovery methods in the
owner's accounts. The owner must choose any project-code license before granting
reuse rights; this work does not assign a license. Preserve the existing font
license notices and confirm rights to photography and brand assets separately.
