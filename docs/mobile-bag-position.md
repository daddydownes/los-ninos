# Mobile purchase card position

30 October 2026 — visual-lock-1.

The previous fixes froze the sticky top but left the card in the root sticky scrollport. They tested layout-viewport rectangles only. That did not establish stability when a phone changes its visual viewport, nor did it reproduce a physical browser toolbar animation.

The mobile card now has explicit states controlled by `mobile-card-position.js`:

- **Floating:** position fixed, with its baseline computed once per width/orientation/card-height from 100svh minus card height, 14px and this browser’s safe-area inset. Height-only changes do not move the baseline.
- **Visible viewport adjustment:** at normal zoom, add the browser-reported visualViewport.offsetTop to that baseline. A nonzero visible viewport offset therefore does not move the card’s visual top. No platform detection, guessed toolbar height or inverse zoom is used. Keyboard focus and pinch zoom retain native behaviour.
- **Parked:** position absolute at the bottom of the existing track. Switch at baseline + visual offset + card height = track viewport bottom. This preserves the 33px spacing beneath the hat and continuity when scrolling back up.
- **Before track:** absolute at the track start. Desktop retains its original native sticky layout.

Updates are event-driven and batched per animation frame. There is no scroll-follow easing or transform on the purchase card. The drawer’s temporary body scroll lock does not reset the anchor. The docked hat remains a child of the card. The corner bag hover/press movement is disabled on touch devices to avoid retained hover displacement.

Tradeoff: collapsed browser controls can leave space below the card. Stability takes priority over reclaiming that space. Browser compositors can move the whole content surface without exposing a matching visualViewport offset; this cannot be ruled out by desktop engine emulation.

Validation: local WebKit and Chromium cover scrolling both directions, frozen baseline across height-only resizes, width and landscape changes, nonzero synthetic visual viewport offsets (24/48/10px), native pinch scale, continuous parking/unparking, quantity/add/drawer behaviour, and desktop cleanup. The diagnostic overlay is separately checked in both engines. These are engine/layout checks, not physical iPhone/Samsung tests.

For a remaining real-phone report, use [the opt-in diagnostics](mobile-bag-diagnostics.md) and capture the visible movement with its measurements. Ordinary visits show no diagnostic UI and upload no data. The earlier Safari wrapper (390×690 content, 44px status, 110px toolbar) was illustrative, not measured browser chrome.

References: [Visual viewport API](https://developer.chrome.com/blog/visual-viewport-api/), [Chromium browser controls](https://chromium.googlesource.com/chromium/src/+/main/docs/ui/android/browser_controls.md), [WebKit fixed/sticky coordinate discussion](https://bugs.webkit.org/show_bug.cgi?id=202120).
