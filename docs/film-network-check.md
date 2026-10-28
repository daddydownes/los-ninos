# Film connection checks

25 October 2026. Local demo only; no deployment. The main test matrix below used
the earlier street edit (2.05 MB phone / 6.41 MB desktop). The subsequent car/boot
cut is a different payload; its targeted follow-up is recorded at the end.
The current default opens on the previous looking-left frame (0.50 seconds) and ends with the
boot closing. Both formats use the same 15.17-second edit. The current quality
pass is 19.18 MB desktop / 13.24 MB phone; its targeted test is at the end.
The timed results below are historical
and must not be presented as measurements of that longer edit. Its unchanged
15-second video preparation limit can choose the still on more slow connections.

## Method

Loaded the real built storefront in the in-app Chromium browser through a local
rate-limited HTTP proxy. The cap was shared across all assets for each page,
with a per-response latency of 40, 100, 200 or 400 ms. Responses used `no-store`.
Phone viewport was 390×844; desktop was 1280×720. Test-only instrumentation
recorded intro completion, video events, buffered ranges, visible purchase
controls and errors. A visible stall means a `waiting` period longer than 100 ms;
1–4 ms loop-boundary events are excluded. Most final observations ran 47–53 seconds.

This simulates bandwidth and latency, not radio dropouts, packet loss, DNS/TLS,
CPU throttling or actual iPhone/Pixel hardware. It is not a hosted-site audit.

## Before the change

- Phone at 25 and 5 Mbps: no visible playback stalls.
- Phone at 1.5 Mbps: 12 stalls totalling about 4.9 seconds in the captured run.
- Phone at 0.4 Mbps: first playback around 24 seconds; repeated 2–4 second stalls.
- Desktop at 25 Mbps: no visible stalls. At 5 Mbps: one 190 ms stall.

The phone loop is 2,045,636 bytes / 5.73 seconds, roughly 2.85 Mbps. The desktop
loop is 6,405,368 bytes / 10 seconds, roughly 5.12 Mbps. Starting immediately
without a buffer can therefore outrun a slower connection.

## Change and retest

The selected short clip now buffers completely while its poster remains visible.
The shop transition and purchase controls do not wait for the video. Preparation
times out after 15 seconds and cancels the video request, retaining the still.
Explicit data-saving preference also retains the still. A playback failure or
unexpected stall over 250 ms falls back to it. Existing reduced-motion behavior,
offscreen pausing and bag pausing remain.

| View | Bandwidth / latency | Intro finished | First playback | Result |
| --- | --- | --- | --- | --- |
| Phone | 25 Mbps / 40 ms | 4.6 s | 5.7 s | No visible stalls |
| Phone | 5 Mbps / 100 ms | 6.2 s | 10.0 s | No visible stalls |
| Phone | 1.5 Mbps / 200 ms | 10.5 s | 21.7 s | No visible stalls after loading |
| Phone | 0.4 Mbps / 400 ms | 10.0 s | Still image | Download cancelled at 15-second preparation limit |
| Desktop | 25 Mbps / 40 ms | 4.6 s | 7.1 s | No visible stalls |
| Desktop | 5 Mbps / 100 ms | 6.3 s | 17.1 s | No visible stalls |
| Desktop | 1.5 Mbps / 200 ms | 10.5 s | Still image | Download cancelled at preparation limit |

Times are from navigation, including the intentional four-second intro. These
are observations from single cold-load runs, not guaranteed maximums. Visible
purchase controls appeared around 7.4–11.4 seconds in the phone runs. On the
weakest connection, the portrait poster itself completed around 15 seconds and
the original full-size hat around 28 seconds: the video fix does not make that
whole page fast. Further critical-image optimization would improve this case.

The existing ten-second intro guard activates on the weakest loads and exposes
the static product with a direct checkout link. Screenshot inspected at 0.4 Mbps.
No page/media errors were recorded in the final runs. Opening the bag paused the
fully buffered desktop video; closing it resumed playback without another download.
Syntax check, demo rebuild and `git diff --check` passed. Video dimensions and
encoding quality were not reduced for this change.

## Evidence

Local diagnostic snapshots and the test harness are retained in
`diagnostics/film-network-tests/`; screenshot:
`diagnostics/video-layouts/phone-slow-connection.png`.
The harness is loopback-only and blocks non-GET/HEAD storefront actions. Its own
metrics endpoint is test-only. It injects instrumentation and is not part of the
demo build or the deployed shop. Run it with Node from the repository root while
port 8793 serves the demo; ports 8801–8804 map to the four profiles above.

Safari's media buffering/autoplay rules and physical phone behavior still need
device checks. If a browser declines to preload the whole loop, the timeout keeps
the still image available rather than forcing playback.

## Car/boot edit follow-up

The replacement edit is 5.8 seconds / 174 frames in both formats: 3,860,190 bytes
at 1920×1080 and 2,521,790 bytes at 720×1560, native 30fps. It retains the same
buffering and fallback behavior. A new cold phone run at 1.5 Mbps / 200 ms
completed the opening guard at 10.5 seconds, exposed checkout around 10.8 seconds,
and began fully buffered playback at 24.2 seconds. It played through multiple
loops with no stalls over 100 ms or media/page errors in the 40-second observation.
The phone version is larger than the previous street edit, so the earlier
11-second post-intro wait is now about 13.7 seconds for this profile.

Snapshot: `diagnostics/film-network-tests/car-boot-mobile-1.5.json`.
Contact sheets for both formats and the storefront screenshot are under
`diagnostics/video-layouts/car-boot-*.jpg` and `car-boot-demo.png`.
The other rows in the earlier matrix were not rerun for this changed edit.

## Desktop playback fix and boot-walk edit — 25 October

The looking-left edit at the time of these tests was 17.50 seconds / 10,980,539 bytes on desktop
and 15.67 seconds / 6,194,610 bytes on phone. It includes the return to the boot,
opening the boot, and the existing throw. The phone edit adds the side-of-car walk.

The desktop failure was reproduced at 1440×900: the old native-preload gate saw
only 0–13.072 seconds buffered out of a 15.5-second clip and eventually removed
the source after its timeout. Waiting for the browser to preload the entire
paused video was not reliable.

The replacement downloads the selected video with Fetch, then plays a local
Blob URL. All file bytes are available before playback regardless of the
browser's demux/preload window. The selected first frame is prepared behind the
matching poster; playback remains gated on the hat handover. Resizing across the
portrait breakpoint aborts the prior transfer and invalidates stale responses.
The old Blob URL is released. Download failure/timeout retains the still and
does not block the product controls.

| Check | Observation |
| --- | --- |
| Local desktop, 1440×900 | 1920×1080 video playing after the intro; correct 02 poster and first visible media frame at 0.533 seconds |
| Desktop, 25 Mbps / 40 ms | One 10.98 MB download completed in 3.58 seconds; playback at page time 8.664 seconds; full loop and restart observed, no stalls or page/media errors in the 29-second observation |
| Desktop → phone while downloading, 5 Mbps / 100 ms | Desktop transfer cancelled after about 3.9 seconds; phone file downloaded in 10.14 seconds; playback at page time 20.802 seconds; full loop and restart observed with no stalls/errors through 49 seconds |
| Desktop, 0.4 Mbps / 400 ms | Intro fallback at 10.01 seconds and checkout link available at 11.18 seconds; film transfer cancelled after its 15-second limit; loaded poster retained, no page/media errors through 50 seconds |

Evidence: `desktop-blob-local.json`, `desktop-blob-25.json` and
`desktop-to-phone-blob-5.json`, plus `desktop-blob-slow-0.4.json`, under
`diagnostics/film-network-tests/`. Opening and closing the empty bag on the local
desktop demo also correctly paused and resumed playback without changing its source.
Screenshots/contact sheets are under `diagnostics/video-layouts/desktop-playback-fixed.png`,
`side-car-walk-phone-final.jpg` and `boot-walk-mobile-cut.jpg`.

These are local Chromium checks with a local throttling proxy. They do not
certify every physical device or hosted delivery. The 15-second download cap
means sufficiently slow connections intentionally retain the still image;
video playback is not promised at every connection speed.

### Subsequent cut cleanup

Jacob then removed the walk alongside the car and requested a later start into
the return-to-boot angle. Those files were 15.87 seconds / 9,906,084 bytes
and 14.03 seconds / 5,520,493 bytes. The loader is unchanged; the matrix above
remains evidence from the larger preceding files, not a repeat network test of
this shorter edit. Frame-by-frame contact sheets confirm a single clean camera
change at the phone and desktop boot cuts (`boot-walk-clean-cut-*.jpg`).

### Matched desktop/phone edit and full ending

Both files at this stage used a single nine-shot plan: 492 frames at 30fps, 16.40 seconds.
Desktop is 9,484,545 bytes; phone is 6,088,194 bytes. Framing/resolution differ,
but source shots and cut timing now match. The opening uses the first clear frame,
and the final shot runs through the boot closing before the original title card.
Two one-frame flashes were removed from the lead-in and boot-opening cuts.
Paired contact sheets are `diagnostics/video-layouts/matched-film-desktop.jpg`
and `matched-film-phone.jpg`; both files decoded without errors.
The network matrix above was not rerun for these files and remains historical
evidence from earlier payloads. The Blob loader and timeout behavior are unchanged.

The ending was subsequently shortened by 37 frames, retaining closure and a brief
settle. Those files were 455 frames / 15.166667 seconds in both formats:
9,097,277 bytes on desktop and 5,829,412 bytes on phone. No additional network
claims are made for this trim; the loading implementation is unchanged.

On 26 October, the two walking shots after the front hat adjustment were framed
higher. Those payloads were 9,200,197 bytes desktop / 5,933,190 bytes phone,
still 455 frames / 15.166667 seconds. No network re-test was required for the
framing change; earlier timings remain historical, not measurements of these files.

### Higher-resolution quality pass — 26 October

The maintained files are now 2560×1440 desktop (19,179,427 bytes) and 1000×2160
phone (13,235,552 bytes), H.264 CRF 20 / slow preset. Both remain 455 native 30fps
frames, 15.166667 seconds. Only the selected format downloads.

A cold desktop run at 25 Mbps / 40 ms completed the video download in 6.236 s.
The intro ended at 4.618 s, purchase controls were available at 7.357 s, and video
playback started at 11.344 s from navigation. At 34.351 s it had completed a full
loop and was playing again, with no recorded stalls or page/media errors.
Snapshot: `diagnostics/film-network-tests/quality-1440p-25mbps.json`.

This is a larger download than the previous version. The unchanged 15-second
video-download limit still retains the poster on slow connections. At a sustained
5 Mbps the video bytes alone would require about 30.7 s desktop / 21.2 s phone,
so neither is expected to finish within that cap. Those are size-based estimates,
not additional browser measurements. Further delivery optimization is needed
before claiming equivalent slow-connection playback or certifying a live release.
