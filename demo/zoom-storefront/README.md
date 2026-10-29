# Integrated storefront preview

Local demo: http://127.0.0.1:8796/. No production deployment or real order was made.

The stitching intro, campaign film, floating purchase card, first three photographs, centred five-photo zoom journey, and final purchase card are preserved.

## Current product rotation — 29 October 2026

The product section at `#hat-views` now plays the refined 52-view sequence in a 3.6-second loop. It uses the original PNG images with the approved uniform scale and position in a 1536×1024 SVG viewBox. Frames cut directly with no crossfade; their target-angle gaps determine dwell time, so the four inserted midpoints divide existing intervals instead of extending the loop.

- `index.html` supplies the front poster and a pause/play button; `refined-hat.js` loads `rotation-assets/refined-hat.json` and its 52 PNGs.
- The sequence starts loading within 600px of the viewport, after the opening. Four workers load and decode the original images, while the front view remains visible.
- Animation runs only while the section is visible and the page is active. Pausing persists when scrolling away and back.
- Reduced-motion visitors see the front image and can choose Play rotation. Their full sequence is not loaded automatically.
- Loading failures retain the front view and offer Retry rotation. With JavaScript disabled, the front poster remains visible.
- The raw PNG sequence is approximately 110 MB; the source files have not been converted or compressed by the renderer.
- The existing intro, lifestyle photographs, bag, and purchase cards remain in place. Older rotation experiments and the four static images remain on disk but are not loaded by this section.

## Verification

Renderer syntax, angular timing, loading concurrency, and visibility/pause/reduced-motion lifecycle checks are validated separately from the earlier rotation experiments in `qa/`. Browser visual verification should use the current `#hat-views` section and the packaged refined assets.

## Run on another computer

From the repository root, run `npm run preview:latest` with the documented Node/Python prerequisites in the root README. This builds the supporting film demo and starts both local servers. Open http://127.0.0.1:8796/.

- `/ideas/`: all photo concepts remain on disk; the comparison page highlights the latest shortlist. Each of the 28 original concepts is available at `/ideas/01/` through `/ideas/28/`.
- `/studies/`: earlier motion and typography studies, kept for reference.
- `/rotation-check.html`: archived rotation experiment, separate from the current refined sequence.

Manual equivalent: first run `python scripts/build-film-demo.py`, then `node scripts/commerce-local.mjs --film`, and in another terminal `node demo/zoom-storefront/server.mjs`.

The main page loads `refined-hat.js`. Earlier photographic rotation, model, and crossfade experiments remain on disk for history. Their optional offline regeneration instructions are in `qa/REBUILD.md`; RIFE, FFmpeg, and Python image packages are not required to run the current demo.

No credentials, customer records, SQLite databases, or runtime tools are included here. All local preview orders start in a new local database. Production credentials must be configured separately if deploying.
