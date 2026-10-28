# Latest demo handoff — 29 October 2026

Branch: `codex/latest-film-zoom-demo`. Run `npm run preview:latest` (Node 24+, Python 3.11+).

This snapshot brings the previously separate checkout worktree, film demo, photo
concepts, and final photographic-rotation overlay into one portable checkout.
It preserves the stitching intro -> portrait/film -> floating purchase card ->
three photographs -> automatic hat rotation -> concept 26 centred zoom -> final
purchase card flow. The live Cloudflare shop has not been redeployed.

## Included

- Current checkout/bag synchronisation fixes, including return from checkout.
- 14.033-second selected campaign edit, matching desktop/phone cuts, alternative
  cuts, posters, opening-frame options, and reproducible encoding scripts.
- All 28 photo-gallery concepts and supplied web-ready photographs.
- Eight-second, 240-frame photographic hat loop: 1440×960 desktop and 960×640 phone.
- Optional offline rotation-generation sources and reference-guided midpoints.
- Existing production backend source and deployment documentation. Its secrets
  remain in the configured hosting service and are not needed locally.

## Source media

Jacob will transfer the original HD video separately from his email. The raw
master is not included in GitHub. The edited videos used by the demo are included,
so the preview runs without that original master.

Optional re-encode after downloading the original (requires FFmpeg on PATH):

```sh
python scripts/encode-film-campaign.py --source 'Los Ninos FINAL.MP4'
```

Original untouched camera-photo files remain on Jacob's computer; their
web-ready copies are included. Downloaded tool binaries, neural model caches,
intermediate render frames, customer databases, credentials, and private email
logs are not part of this source snapshot.

## Verification and limits

The portable film build and 122 commerce tests passed during packaging. The prior
rotation pass passed 25 lifecycle checks and browser checks of playback, reduced
motion, offscreen pause/resume, and phone-size media selection. The photographic
source views retain small detail differences; this is not a calibrated 3D scan.
Production deployment, real orders, email delivery, and physical-phone testing
were not performed as part of this GitHub handoff.

Preserve the exact existing page flow when refining it. The user rejected the
actual Three.js reconstruction and wants the realistic photographic hat.


