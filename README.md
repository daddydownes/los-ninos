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
