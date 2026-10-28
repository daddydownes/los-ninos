# Optional offline rotation rebuild

The finished videos and poster are already included. You do not need to rebuild them to run or edit the website.

To regenerate the eight-second loop, use Python with `numpy`, `Pillow` and `opencv-python-headless`; FFmpeg; and the official RIFE ncnn Vulkan executable and v4.6 model from https://github.com/nihui/rife-ncnn-vulkan. RIFE needs a supported Vulkan setup. The original build used the 20221029 Windows tool, temporal TTA (`-z`), and the v4.6 model. Other versions/hardware can change the result.

Environment variables (all optional when their defaults apply):

- `RIFE_BIN`: executable path, otherwise `rife-ncnn-vulkan` on PATH.
- `RIFE_MODEL`: v4.6 model folder, otherwise `rife-v4.6` beside the executable.
- `RIFE_GPU`: GPU index, default `0`.
- `FFMPEG`: executable path, otherwise `ffmpeg` on PATH.
- `HAT_SPIN_SOURCE`: approved source manifest/images, default `assets/hat-spin` in this repository.
- `ROTATION_BUILD_DIR`: temporary frame workspace, default `.local/rotation-build` in the repository. Keep it out of Git; it can grow large.

From the repository root:

```sh
python demo/zoom-storefront/qa/build-photo-turn.py --keys-only
# Optional: regenerate the two included embroidery-guided midpoints.
python demo/zoom-storefront/qa/guided-rife.py
python demo/zoom-storefront/qa/build-photo-turn.py
```

The final command uses the two checked-in guided midpoint PNGs if present, and writes the finished files to `demo/zoom-storefront/rotation-assets/`. Registered keys, pair renders and the review contact sheet are generated under the temporary build directory. Delete/recreate that temporary directory if source photos, registration or interpolation parameters change; existing completed frames are reused on a resume.

The source-view timing manifest is retained in `qa/photo-turn/manifest.json`. The sources are synthetic product views, not a calibrated scan; inspect the new loop for shape and embroidery drift before replacing an approved result.
