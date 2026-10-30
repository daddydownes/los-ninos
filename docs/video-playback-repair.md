# Campaign cover update — 30 October 2026

The recipient was using Low Power Mode, which can block automatic playback. After reviewing a Play-button proposal, the user explicitly requested no Play button and supplied IMG_3560.jpg as the still image.

## Final release

Use the supplied photograph unchanged as `assets/film/campaign-cover.jpg` for the initial video poster and persistent cover on phone and desktop. Automatic playback remains unchanged where allowed. Reduced Motion and Data Saver retain their original behaviour. Where autoplay is blocked, the photograph remains visible; no new playback controls are displayed.

The original MP4 files, commerce backend, original loading/retry implementation and video framing are preserved. The player change is limited to its fallback poster URLs. Broad streaming, delivery and compression work, and the superseded manual-control implementation, were saved under ignored `.local/progressive-video-deferred/` and are not deployed.

Validation: native WebKit phone reduced-motion cover, Chromium desktop reduced-motion cover, Chromium simulated autoplay denial, and normal Chromium autoplay. No Play button in any state. This is not a physical-device Low Power Mode test. The supplied file is copied byte-for-byte. Existing full-file video startup latency remains.

Prior live deployment for rollback: `15fdc777-f254-4a4a-9472-c1227dce97f6`.
