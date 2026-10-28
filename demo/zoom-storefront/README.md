# Integrated photo-rotation preview

Local demo: http://127.0.0.1:8796/. No production deployment or real order was made.

The original stitching intro, campaign film, floating purchase card, first three photographs, centred five-photo zoom journey, and final purchase card are preserved. The rejected Three.js hat model is no longer loaded. The current hat rotation uses the approved photographic renders, registered around their crown axis, with interpolated frames instead of overlapping crossfades.

## Current rotation — 27 October 2026

- Eight-second automatic loop, 240 frames at 30 fps, including the last-to-first transition.
- H.264: 1440×960 desktop (6.42 MB), 960×640 phone/coarse pointer (2.29 MB).
- RIFE interpolation with manually guided side-logo midpoints for two difficult transitions. Source, registration, and frame-build scripts remain in `qa/`.
- Canvas matches the decoded media's background colour to remove a visible rectangular image boundary.
- Starts only after the intro and near the hat section. Pauses when offscreen or the tab is hidden. Video callbacks are cancelled when paused.
- Reduced motion uses the sharp front still. Load failures retain a still and offer retry; blocked autoplay offers a play action.
- Local server supports byte-range and HEAD responses for video playback.

This is an interpolated photographic presentation, not a calibrated 3D scan. Some source views have different embroidery/shape details; interpolation does not guarantee physically exact geometry at every intermediate angle. Inspect the local loop before any production release.

## Verification

- 25 lifecycle checks passed with `node demo/zoom-storefront/qa/photo-video-lifecycle.test.mjs`.
- A visibility-observer edge case was fixed using a positive intersection threshold.
- Actual browser checks: desktop HD playback, integrated narrow layout selecting the mobile video, advancing frames, offscreen time remaining unchanged, resume, and reduced-motion still.
- Integrated page console reported no warnings/errors during the final check.
- Reviewed transition contact sheets, corrected side-logo fade in two intervals, and checked quarter/intermediate frames.
- Both original and final purchase cards still show the existing two-hat bag. No checkout logic was changed in this rotation pass.
- Screenshots: `qa/photo-rotation-final.png` and `qa/photo-rotation-desktop-final.png`.
- Physical iPhone/Pixel hardware and throttled internet were not retested in this pass. Failure/retry cases were checked by the lifecycle harness, not by disrupting a real connection.

## Run on another computer

From the repository root, run `npm run preview:latest` with the documented Node/Python prerequisites in the root README. This builds the supporting film demo and starts both local servers. Open http://127.0.0.1:8796/.

- `/ideas/`: all photo concepts remain on disk; the comparison page highlights the latest shortlist. Each of the 28 original concepts is available at `/ideas/01/` through `/ideas/28/`.
- `/studies/`: earlier motion and typography studies, kept for reference.
- `/rotation-check.html`: isolated hat rotation check with reduced-motion and offscreen controls.

Manual equivalent: first run `python scripts/build-film-demo.py`, then `node scripts/commerce-local.mjs --film`, and in another terminal `node demo/zoom-storefront/server.mjs`.

`hat-rotation.js` is the active renderer; `photo-video-rotation.js` is its matching source copy. Rejected model/crossfade experiments remain for history but are not referenced by the page. Optional offline regeneration instructions are in `qa/REBUILD.md`. The pre-rendered rotation files are included, so RIFE/FFmpeg/Python image packages are not required to run the demo.

No credentials, customer records, SQLite databases, or runtime tools are included here. All local preview orders start in a new local database. Production credentials must be configured separately if deploying.
