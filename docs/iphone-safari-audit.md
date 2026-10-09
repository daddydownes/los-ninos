# iPhone and Safari audit — 9 October 2026

Baseline: `3c5a145f946eb6afb6fce4743d1948d89a04d188`.

## Findings and fixes

1. **Unnecessary downloads and image memory.** The page downloaded and decoded all
   23 PNG rotation frames after the entrance, even when the viewer was far below
   the screen. It now waits until the viewer is within 600px, loads two frames at
   a time, and selects 768px WebP textures on small or coarse-pointer devices.
   Original registration coordinates and alpha are preserved. Desktop retains
   full-resolution WebP textures; PNG masters remain available for regeneration.
   The manifest URL is versioned so returning visitors do not reuse cached
   references to the old PNG sequence after deployment.
2. **Main-thread scroll blockers.** Capturing, non-passive `touchmove` and `wheel`
   listeners stayed installed for the page lifetime. Both are now removed at intro
   completion, including skip, failure, and Reduce Motion paths.
3. **Costly and stale animation work.** The intro updated settled SVG strokes and
   several full-image filter/mask effects every frame. Unchanged values are now
   cached, hidden stages stop updating, touch devices use an opacity reveal, and
   one animation clock drives the entrance. The constant embroidery filter is
   pre-rendered into a lossless transparent asset, removing it from the animated
   mask pipeline; the small header logo retains its original live filter. Slow fonts no longer block it. A
   failed optional reveal script has a working fallback. Skip/Escape and leaving
   the page release the interface immediately.
4. **Touch and motion preferences.** Rotation captures horizontal movement and reserves one-finger gestures
   inside the canvas for the hat, preventing accidental vertical page pans.
   Pinch zoom and page scrolling outside the viewer remain native. Rendering
   happens at most once per animation frame. Initial canvas sizing preserves
   fractional CSS dimensions, avoiding a one-pixel reallocation on iPad. Reduced Motion disables inertia,
   magnetic pointer effects and decorative transitions, including changes made
   while the page is open. Offscreen/background motion stops.
5. **Bag and small-screen resilience.** Touch devices avoid backdrop blur and
   sticky hover transforms. Notch/home-indicator padding survives mobile and
   landscape rules; quantity controls remain at least 44px wide. Suspended tabs
   cannot replay a stale Add confirmation. Storage denial, quantities, native
   modal focus, Back/Forward and scroll restoration are exercised by tests.
6. **Recovery.** Failed or stalled rotation downloads preserve the photo and offer
   Retry rotation. Manifest/frame loads have a 15-second timeout. Both loading
   workers settle before retry becomes available.

7. **White specks during the opening.** Round caps on fully offset SVG strokes
   still painted eight tiny endpoints, including five below the future bottom
   row of lettering. Unstarted mask and satin strokes are now hidden explicitly,
   including the first CSS paint; active and completed lettering stay unchanged.

## Measured resource changes

| Measurement | Before | After |
| --- | ---: | ---: |
| Complete phone rotation sequence | 34,263,425 bytes | 2,134,516 bytes (93.8% less) |
| Complete desktop rotation sequence | 34,263,425 bytes | 5,025,428 bytes (85.3% less) |
| Estimated phone decoded frame pixels, RGBA | 138.0 MiB | 51.8 MiB |
| Blocking touch/wheel listeners after entrance | 2 | 0 |
| WebKit first-screen resource bodies in local sample | 33,013,973 bytes | 828,089 bytes |
| WebKit resource bodies after visiting rotation | 33,013,973 bytes | 2,969,511 bytes |

Image memory is an estimate of pixel storage, excluding browser overhead and
canvas backing buffers. Resource samples use Performance Resource Timing on a
local server and differ by browser lazy-loading decisions; these are not mobile
network transfer-time measurements. All 46 generated images pass dimensions and
exact-alpha checks; image compression changes RGB values slightly.

Initial broad frame-time sampling did not establish a reliable gain (p95 47ms
before versus 48ms after the first optimizations). This led to isolating the
remaining live embroidery filter. Three alternating WebKit comparisons then
measured the current code with the original filter versus the same animation
using a pre-rendered embroidery texture:

| Intro frame timing | Live filter | Pre-rendered texture |
| --- | --- | --- |
| p95, three runs | 96 / 62 / 58 ms | 22 / 19 / 19 ms |
| Frames exceeding 50ms | 35 / 22 / 22 | 0 / 0 / 0 |

The first comparison overlapped other browser work; the later runs still showed
the improvement. This is local, headless WebKit evidence, not a physical iPhone
FPS guarantee. The final code includes the pre-rendered texture. A final full-page WebKit
sample, after other tests stopped, measured p95 18ms and zero frames over 50ms
(previous baseline: 47ms and ten frames over 50ms). Its native-size
render is pixel-identical to WebKit's original filter; at phone display size the
actual masked embroidery has a mean composited RGB difference of 0.019/255
mid-animation and 0.077/255 fully revealed from the changed scaling order.
The stitched opening remains four seconds unless skipped or Reduce Motion is on.

## Test environment and scope

Playwright 1.61.1, WebKit 26.5 and Chromium 149 on macOS 27.0.1. Device profiles
cover iPhone SE (320px), iPhone 15 portrait/landscape, iPad Mini, desktop Safari,
iPhone Reduce Motion, Pixel 7, and desktop Chrome. These all use the installed
engine versions; the profile names do not mean older iOS releases were tested.

**Local full-suite result: all 112 checks passed with zero retries.**
The iPad sizing fix also passed all eight targeted profiles and ten repeated
iPad runs; pixel comparisons retain exact RGBA equality. The white-dot regression
fails the original WebKit rendering (40 bright pixels below unstarted letters)
and passes the fix (zero). The bag scroll assertion captures the position at
the opening click, before the application handles it; the two-pixel tolerance
is unchanged. All eight targeted bag profiles and nine repeated phone runs pass.
The committed suite contains 112 checks (14 scenarios across eight profiles):
entrance and scroll-listener cleanup, a rendered-pixel white-dot regression,
live motion preference change, skip/Escape,
blocked storage, photo/shop/history navigation, keyboard/touch-policy rotation,
bounded swipe momentum, drag without momentum, bag limits/persistence, modal focus/scroll/history,
hero/photo failure retries, manifest/frame failure retries, and no JavaScript.
It also fails on unexpected browser exceptions, console errors and HTTP errors.

Additional targeted lifecycle checks cover blocked image decoding, hung fonts,
failed reveal helper, reload, synthetic pagehide/pageshow and cleanup of completed
animation work. Screenshots were inspected for small phone, landscape, tablet
and desktop layouts. Synthetic lifecycle events are not a real bfcache/device
suspension test. Mouse-driven rotation and CSS touch-action assertions are not
physical iOS touch-physics tests. The initial release allowed native vertical panning inside the viewer. The
follow-up gesture change below intentionally reserves that area for rotation;
native Safari touch physics remain unverified. A Chromium stress run with 4× CPU slowdown, 150ms
network latency and 500,000 bytes/second download bandwidth completed the intro,
Add/Close bag and rotation without runtime errors; rotation was ready 6.6 seconds
after scrolling to the viewer.

## Swipe feel refinement

The follow-up swipe adjustment smooths recent finger velocity over 45ms and
lets a quick flick coast through at most about one fifth of a turn. Exponential
decay settles it promptly; changing direction resets stale momentum. Holding
still before release, grabbing again, hiding the viewer, or enabling Reduce
Motion stops the coast. The canvas uses `touch-action: pinch-zoom` from gesture
start, so vertical finger drift cannot move the page. No page-wide scroll
blocker is added.

All 24 targeted swipe checks and the full 112-check suite passed across the
eight profiles with no retries or skipped tests. Native Chromium touch input checks diagonal and
vertical swipes inside the viewer, followed by scrolling outside it; Safari
is covered by WebKit pointer tests and computed touch policy.

A physical iPhone was not attached and no iOS Simulator runtime was installed.
Real-device follow-up should confirm sustained scroll/drag smoothness, Safari's
collapsing address bar, notch/home-indicator positioning, pinch zoom, VoiceOver,
background/return, Low Power Mode, and slow mobile data. Actual FPS, thermal
behaviour and older Safari versions remain unverified.

## Primary references

- [WebKit: Responsive Design for Motion](https://webkit.org/blog/7551/responsive-design-for-motion/) — CSS and JavaScript motion preference handling.
- [WebKit: Introducing Backdrop Filters](https://webkit.org/blog/3632/introducing-backdrop-filters/) — additional rendering passes from backdrop effects.
- [WebKit: Designing Websites for iPhone X](https://webkit.org/blog/7929/designing-websites-for-iphone-x/) — viewport fitting and safe-area insets.
- [Playwright device emulation](https://playwright.dev/docs/emulation) — what device profiles simulate.
- [Playwright browser support](https://playwright.dev/docs/browsers#webkit) — WebKit testing versus branded Safari.
