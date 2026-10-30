# Photo journey rendering

30 October 2026 — photo-canvas-2.

## Report and reproduced cause

Fast swipes could replace a decoded photograph with an image that had not loaded. The old zoom loop hid every earlier layer immediately from scroll depth. Blocking the fourth image and jumping to depth 3.05 reproduced a mostly empty frame in both WebKit and Chromium. Hidden historical layers were also transformed up to 625 times their original size. Actual GPU allocation was not measured.

## Current behavior

`photo-journey.js` owns the photographic journey. `zoom.js` only controls the final purchase card.

- A single canvas draws the current photograph and centered 20% nested photographs. It uses the same five source files and the same cover/contain crop rules.
- The backing buffer is capped at 3 million pixels and device pixel ratio 2. Each image draw is clipped in source coordinates to the visible destination, so historical layers never grow into enormous composited surfaces.
- All five photos (approximately 0.5 MB total) are requested at low priority after the opening, with a near-section fallback for restored positions and direct links. Each must finish decoding before it is drawn.
- If a requested image is unavailable, retain the last decoded photograph at full-frame size. When decoding completes, repaint the latest scroll position without requiring another scroll. A failed image cannot erase the last good background.
- The stage fills the current mobile viewport; the travel ruler subtracts stable 100svh from the section height. Expanding browser controls therefore does not alter the distance between stops. The final hold is .5 photo intervals, shortened from .65 (23% less). Section height is reduced proportionally to 564.516129svh (293.548387svh with reduced motion), preserving the original distance between photograph transitions. Normal end hold is about 51.6svh instead of 67.1svh.
- Scroll events request at most one paint per animation frame. Paint reads the latest position directly, without queuing intermediate animation destinations. Nothing continuously animates while stationary or off screen.
- Resize and drawing occur in one paint. Reduced motion shows complete photographs. Opening the bag freezes photo painting during its body lock. Page restoration/context restoration trigger a repaint.
- If canvas is unavailable or lost, a decoded DOM photograph remains available with its alternative text.
- Earlier story photographs no longer wait through a 900 ms fade after entering view. Their assets warm after the opening. The heading retains its reveal.
- Opening-only non-passive wheel/touch listeners are removed after the intro, and settled opening styles are not rewritten on each scroll.

The confirmed mobile purchase-card positioning controller and its bottom-edge CSS are unchanged.

## Verification

`npm run test:zoom` exercises the actual static export, separately from the older storefront suite. It covers 27 cases across WebKit iPhone, Chromium mobile and desktop: rapid forward/reverse jumps, delayed and failed images, recovery while stationary, source-image pixel comparisons, reduced motion, resize/orientation, buffer limits, overflow, bag locking, unavailable canvas, intro listener cleanup and story-photo visibility. All passed during implementation.

Existing native-bottom mobile-card checks also passed in WebKit and Chromium. Independent old/new screenshots at five depths on mobile and desktop retained framing and centered nested placement; small differences came from image interpolation. The iPhone 17 / iOS 26.5 simulator displayed the new journey correctly through keyboard page jumps and reversals.

These checks do not guarantee every physical phone's touch/compositor behavior. No new photos were generated or substituted.
