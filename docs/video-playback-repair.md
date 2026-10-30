# Low Power Mode playback fallback — 30 October 2026

The user confirmed the recipient was using Low Power Mode. This can block automatic video playback; the site must provide a clear deliberate Play action rather than attempting to bypass browser policy.

## Final scope

Preserve the current video files, full-download Blob preparation, original crop, frame timing, normal autoplay/looping, commerce backend and public asset delivery. Add an accessible, high-contrast Play/Retry control when automatic playback is blocked or suppressed, plus manual pause/replay handling. Reduced Motion and Save Data continue to suppress automatic playback, while permitting an explicit opt-in. Media tests now target the exact deployed zoom storefront.

Broader progressive-streaming, range-delivery and re-encoding work was explored before the device setting was confirmed. It is deferred under ignored `.local/progressive-video-deferred/` and is not part of this release. Existing full-download startup latency therefore remains; the fallback should make loading or blocked playback understandable rather than silently leaving a still image.

## Validation

All 130 commerce/media tests pass, including 15 focused media/photo checks against the deployed source. Seven independent browser flows passed: Chromium normal playback, iPhone WebKit normal playback, WebKit Reduced Motion opt-in and single-play replay state, Chromium Save Data opt-in, simulated NotAllowedError plus explicit Play, bag/offscreen pause-resume, and failed download plus Retry. Original MP4 files, Worker and build script are byte-identical to the prior commit. Browser-policy denial is simulated; this is not a direct test of the recipient's physical phone or battery settings.

Rollback deployment: `15fdc777-f254-4a4a-9472-c1227dce97f6`.
