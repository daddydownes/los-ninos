## Current selection — close-up removed

Portrait still remains in the intro. Campaign film omits source frames 1658–1695 (extreme cap close-up) and 1734–1772 (repeated portrait). Remaining source ranges: [1563,1658), [1696,1734), [1773,2061). Both formats: 421 frames / 14.0333 seconds at 30 fps. New close-up-removal join is output frame 95 / 3.1667 seconds. Encoded directly from the original 4K master at the existing CRF 18 quality, preserving phone crop timing. Local demo only. Earlier revision notes follow.

# Working film shop demo

Current selection: **Portrait to full film**, with the 1.30-second portrait
shot removed from the moving film. The portrait still remains for the intro.
The local default uses campaign.mp4 / campaign-mobile.mp4: 459 frames,
15.30 seconds. See film-model-options.md for the selected revision.
Older notes below are retained as history.

## Current model-led studies — 26 October

The latest car/hat-first edit was rejected. The homepage now uses the model
Portrait candidate from a continuous original passage. Three alternatives,
including a portrait still followed by the full original sequence, are at
http://127.0.0.1:8793/model-openings.html. See [model options](film-model-options.md)
for exact source frames, quality checks and tradeoffs. The notes below are
historical and do not describe the currently recommended cut.

## Latest editorial candidate — 26 October

The main demo now uses the calmer 15.30-second / 459-frame **story-cut** edit.
It starts with the hat held in the car, keeps complete adjustments and preserves
the original walk-to-boot sequence. There are seven angles rather than nine.
The opening poster is frame zero of the video, and playback still waits until
the flying hat has landed. Desktop and phone use the identical edit, with
separate crops. Both retain the direct-from-master HD encoding settings.

See [the editorial plan](film-edit-plan.md) for every source range, rationale,
reproduction command and evidence. Compare it with the unchanged previous edit
at http://127.0.0.1:8793/film-review.html. The older portrait opening remains at
`/?opening=02`, with its original matching film and frame gallery.

**The remaining notes below describe the earlier edit and its test history.**
Their durations, file sizes and opening choices are historical, not claims
about the current story-cut candidate. Shop behavior is unchanged.

25 October 2026. This candidate is local and has not been deployed.

Open http://127.0.0.1:8793/ while the local server is running. Build with
`python scripts/build-film-demo.py`, then run `node scripts/commerce-local.mjs --film`.
The build is under `.local/film-demo-site`; orders are in the separate
`.local/film-demo-orders.sqlite` database. No production credentials, bank details
or email service are configured for this demo.

## Included

### Current opening: previous looking-left frame, with the boot closing

Opening 02 at media time 0.50 seconds is restored as the default. The comparison
page shows the previous and newer starts side by side, plus all 39 native frames
from the first shot (0–1.267 seconds). Its slider and arrows step one frame at a
time; each choice can play through the real intro without changing the default.
Desktop and phone are encoded from one shared shot list,
with identical shots, timing and duration. Only framing and resolution differ.
The film continues through the street shots, the return to the boot, the hat toss
and the boot closing, with a brief settle before looping. The walk alongside
the car at source 50–51.43 seconds remains removed at Jacob's request.
The return-to-boot shot begins at 63.70 seconds, after the source camera cut.
The lead-in ends before the next angle at 59.733 seconds, and the boot-opening
shot ends before the inside-boot angle at 65.467 seconds. These trims remove
the one-frame flashes under the previous phone crops.
The rejected in-car opening remains available only as a
comparison at `/?opening=car`; `/opening-options.html` contains the frame picker.
Legacy `?opening=01`, `02` and `03` links still work; individual choices use
`?opening=frame-00` through `frame-38`.

The desktop playback failure was reproduced at 1440×900: native preloading
stopped with only 13.072 of 15.5 seconds buffered, and the old full-buffer gate
timed out to a still. The loader now explicitly downloads the selected file,
then gives the video element a local Blob URL. It keeps the matching poster over
the first seek and still waits until the hat handover has completed. Changing
between desktop and phone cancels the old request and releases its Blob URL;
stale responses cannot replace the new source. A 15-second download timeout,
data-saver still and independent purchase controls remain.

### Shop behavior

- Approved stitched opening, automatic hat-to-card transition, muted background
  clip, the original Canberra-to-California photo story and existing 360 viewer.
  The three original photographs, large heading, staggered layout and Instagram
  footer are restored below the film. Numbered photo captions and the additional
  Make it yours purchase link are omitted; the floating card handles purchasing.
- The maintained bag controller, with add-many selection, live catalogue pricing,
  quantity editing, empty/full states, modal history and real checkout navigation.
- Shared bag state across checkout, including returning with edits and clearing
  the matching bag after a confirmed saved order. Dashboard test checkout is isolated.
- Recovery of an uncertain order response with the same request key; original
  details are required after refresh rather than silently starting another order.
- Independent ten-second static fallback if motion fails, including a checkout link.
- A preview catalogue with $30 hats, maximum five per order, initially 100 test
  hats, $20 shipping for one–three and $25 for four–five. Preview orders reserve
  only this local stock and send no emails. Receipt bank fields are placeholders.

## Evidence from this build

- All 94 commerce unit tests passed, including ten new bag/checkout state tests.
- In the browser: selected three hats, reached checkout at three, changed to four,
  returned with Back and observed four in the bag.
- Reviewed three hats at $90 + $20 = $110 and four hats at $120 + $25 = $145.
- Saved one four-hat local test order (TEST-001), observed its $145 receipt, then
  returned to an empty bag. No money or email was sent.
- Reached five hats, observed a disabled increment and View bag state, reloaded
  with the quantity retained, then removed the hats and checked the empty bag.
- Inspected desktop and narrow phone layouts, including 375px purchase controls.
- Removed the film motion script from an isolated HTML fixture: the independent
  guard revealed the static product and a working checkout link.
- All hero references were packaged; video range request returned 206 with the
  correct video/mp4 content type and requested byte range.

This is not a completed production launch audit. Physical iPhone/Pixel and mobile
network checks, OS reduced-motion verification, hosted email delivery, owner
handover and the wider release matrix remain before a live release. Blocked
browser storage supports the current page but cannot guarantee reload persistence.

The old comparison demo at port 8792 remains available as the visual reference.

## Mobile video framing

The phone preview uses a separate 1000×2160 portrait edit and poster. It fills
the screen without top/bottom padding or fades. Most shots preserve the original
frame height and follow the hat horizontally; side cropping remains necessary
for the tall phone format. Portrait phones use `object-fit: cover` aligned to the
top to preserve the cap on shorter screens; desktop
and landscape use a 2560×1440 wide clip. Only the appropriate video is loaded
during the hat handover; playback waits until the handover completes.

Both previews were encoded directly from the supplied 3840×2160, 30fps master,
`C:/Users/jacob/Downloads/Los Ninos FINAL.MP4`. The source remains untouched and
outside the public build. The selected edit opens on the looking-left close-up,
continues through the street section and ends with the boot closing:
15.17 seconds / 455 frames in both formats, 19.18 MB on desktop and 13.24 MB on mobile. Both
are native 30fps H.264 with faststart and no audio track. Posters were regenerated
from these outputs. The 308 MB master is not served to visitors.

Regenerate both versions with
`python scripts/reframe-film-mobile.py --source "C:/Users/jacob/Downloads/Los Ninos FINAL.MP4" --edit portrait-street-walk-boot`,
then rebuild the demo. The full source is required for this edit. The earlier
street cut remains available through `--edit street` with the same source.

### Selected cuts

| Section | Both outputs | Source/action |
| --- | --- | --- |
| Opening | 0–1.30 s | 57.80–59.10 s: wearing the hat and looking left |
| Lead-in | 1.30–1.93 s | 59.10–59.73 s: looking down beside the car |
| Rear-car walk | 1.93–5.77 s | 51.43–55.27 s: walking across the rear and putting the hat on |
| Side adjustment | 5.77–7.00 s | 56.57–57.80 s: adjusting the hat |
| Front adjustment | 7.00–8.50 s | 60.00–61.50 s |
| Street walk | 8.50–10.20 s | 61.80–63.50 s |
| Boot approach | 10.20–10.70 s | 63.70–64.20 s |
| Boot opening | 10.70–11.97 s | 64.20–65.47 s |
| Toss and close | 11.97–15.17 s | 65.50–68.70 s: hat lands, boot closes, brief settle |

Straight cuts and native speed preserve the filmed movement. The phone version
frames his face and hat in the opening, then follows the hat as it travels toward the boot
camera. The additional phone street shot follows the walker horizontally so his
hat and full figure stay in view. There is no in-car hat adjustment, seat-pickup
or car-exit shot. Both versions move the looking-left shot to the front
rather than repeating it later. At the loop boundary the closed boot cuts
back to the looking-left close-up. No sound, transition effects or AI frames were
introduced. The original street assets are preserved locally in
`.local/film-before-car-boot-20261025/`; the superseded short cut is in
`.local/film-car-boot-short-20261025/`.
The cut before adding the boot approach is in `.local/film-before-boot-walk-20261025/`.

The source cut boundaries were checked at 57.80 and 59.10 seconds. The portrait
poster was inspected to keep the hat and face in frame. Current visual evidence
is under `diagnostics/video-layouts/matched-film-desktop.jpg` and
`matched-film-phone.jpg`. Both outputs decoded fully without ffmpeg errors.
The preceding full-ending demo was checked in desktop (1440×900) and portrait (355×767)
browser views: both played their 16.40-second asset after the hat handover,
with the matching 01 poster and first visible media frame at 0.033 seconds.
The desktop loop restarted successfully. Browser states and screenshots are
saved as `diagnostics/video-layouts/matched-*-browser.*`.
The ending was then shortened by 37 frames (1.23 seconds), keeping the full boot
closure and removing the lingering tail. The two outputs still share every cut.
The current closing sequence is in `diagnostics/video-layouts/boot-close-shorter-ending.jpg`.
Numbered captions below the two film-demo photographs have also been removed.

The later frame-picker check selected frame 08 (0.266667 seconds): the selected
frame stayed covered during handover, the hat settled at 6.344 seconds, and film
playback started at 6.345 seconds. One-frame controls and the 39-thumbnail grid
were checked in the browser. The main demo independently retained opening 02.
The restored photo story loaded all three original photographs at desktop width
and in the narrow view, with no horizontal overflow, photo error panels,
numbered captions or extra purchase link. Screenshots are
`diagnostics/video-layouts/opening-all-frames-comparison.png` and
`film-original-photo-story.png`.

On 26 October, the street walk and following return-to-boot shot (8.50–10.70
seconds of the output) were reframed higher at Jacob's request. These two shots
retain the lower 82% of the source height, keeping the bottom edge and his feet;
the phone crop retains its horizontal tracking centre. Desktop and phone use
the same crop timing. Other shots and the restored opening 02 are unchanged.
The boot-opening crop now starts on the exact source camera cut at 64.20 seconds,
avoiding one frame of the new angle under the previous crop. Duration is unchanged.
Before/after and cut-boundary proof: `diagnostics/video-layouts/walking-height-*.jpg`.
Both encoded files decoded without errors and retained 455 frames. The rebuilt
browser demo loaded the new 5,933,190-byte phone asset and played normally after
the intro. The start, middle and end of each adjusted shot were visually checked.

### Quality pass — 26 October

The original master is 3840×2160, while the previous demo was 1920×1080 desktop
and 720×1560 phone at H.264 CRF 21 / medium preset. Each edit was already encoded
directly from the master; this was resolution/compression loss, not repeated
recompression of earlier exports. Night-shot motion/focus softness also exists
in the master and cannot be recovered simply by exporting at a higher resolution.

The maintained encoder now renders 2560×1440 desktop and 1000×2160 phone at CRF 20
with the slow preset, retaining BT.709 metadata. A CRF 18 trial was rejected for
its larger 28.23/17.96 MB files. The selected files are 19,179,427/13,235,552 bytes.
Frames, speed, the restored 02 opening and shot-specific crops remain unchanged.
The preceding files are preserved in `.local/film-quality-before-20261026/`.

Source/before/after detail comparison: `diagnostics/video-layouts/quality-source-before-after.png`.
For one aligned front-hat frame, SSIM against the native cropped source improved
from 0.967496 to 0.978139 after normalizing the older file to the same dimensions.
This is one-frame supporting evidence, not a whole-video perceptual score.
Both files decoded without errors. The desktop 25 Mbps test completed a full
loop without stalls/errors; details and the larger-download limitation are in
`film-network-check.md`.

## Connection checks

### Earlier opening frame handoff (25 October, before the Blob loader)

At that stage the user selected opening **02**, at 0.50 seconds. The comparison
page then offered 01 (0.20 seconds), 02 (0.50 seconds) and 03 (0.90 seconds).
The current default is restored to 02 at 0.50 seconds. The comparison also includes
every individual frame from the first shot, with 01 and 03 retained as legacy links.
`film-openings.js` owns these choices; the encoder's
`--posters-only` option regenerates their exact matching stills.

The previous implementation decoded frame zero during the hat movement, then
sought to 0.50 seconds only at playback. The corrected implementation seeks while
the hat is moving, holds a separate matching poster over the video and reveals
the moving image only after a decoded frame at the selected time is available.
The video and cover share the same sizing, crop and position. There is no extra
crossfade between two moving faces. Older browsers without video-frame callbacks
wait for the seek, playing event and two animation frames before revealing.

In the local portrait preview, the chosen frame was ready at 4.52 seconds, the
hat handover completed at 6.316 seconds, and playback began at 6.317 seconds.
Frame zero and the preparatory seek stayed covered; the first revealed frame
was at media time 0.533 seconds (one native frame after the selected still).
Evidence is in `diagnostics/video-layouts/opening-02-before.json` and
`opening-02-after.json`. The older diagnostic's `covered` field is not reliable
because that build had no separate cover; its event/frame timestamps remain useful.
The complete phone loop restarted at 0.50 seconds, with no earlier-frame replay
or waiting event in that observation (`opening-02-loop.json`). The main demo was
also checked: option 02 selected, matching top-aligned poster/video crops,
cover hidden only after a decoded frame and video playing after the intro.
These are local browser observations, not physical iPhone/Safari certification.

### Earlier network tests

The video now buffers its short loop before playback, with a 15-second preparation
limit and still-image fallback. Purchase controls do not wait for it. Cold-load
phone tests covered 25, 5, 1.5 and 0.4 Mbps; desktop covered 25, 5 and 1.5 Mbps.
See [film-network-check.md](film-network-check.md) for measured waits, the initial
stuttering found, retest results and remaining slow-page/device limitations.
Those measurements used earlier, shorter edits. The latest loader checks are
recorded separately in `film-network-check.md`; earlier timings are not claims
about the current 15.17-second files. The latest edit retains the full boot closure;
the verified desktop/phone loading implementation is unchanged.
