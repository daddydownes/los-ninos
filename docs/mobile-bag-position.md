# Mobile purchase card position

30 October 2026 — native-bottom-1.

The user identified the failing environment as a Google phone with the page opened **inside the Google app**, especially while passing “Canberra to California.” Earlier checks covered desktop browser engines, not this native app frame. They did not prove the physical-phone complaint was resolved.

## Current implementation

The mobile card now uses `position:fixed; top:auto; bottom:calc(14px + env(safe-area-inset-bottom))` while floating. The browser owns that position, including its own chrome/compositor adjustments. There is no frozen `svh` top, `dvh` top calculation, visualViewport offset compensation, scroll interpolation, or script-written card translation.

`mobile-card-position.js` only decides whether the card is floating or parked. An invisible zero-height fixed ruler has the identical bottom rule. When the track bottom reaches the ruler, the card becomes absolute at the track bottom. Both rectangles meet at exactly the same coordinate. Scrolling back up switches it to fixed again. The parked card remains 33px below the hat in the current layout.

A temporary drawer body lock is ignored for mode updates; closure triggers remeasurement. Width, orientation, native viewport changes and content resize trigger boundary checks. No inverse zoom, user-agent branch or guessed address-bar height is used. Desktop retains its original sticky layout. Touch hover movement on the corner bag stays disabled. The card remains 40% transparent.

## Browser situations and intended behaviour

| Situation | Required behaviour / limit |
| --- | --- |
| Google app on Android | Use the host browser’s native fixed bottom. Do not assume its top/content origin matches standalone Chrome. This is the user’s reported environment; physical verification is still needed. |
| Chrome Android, top bar | Fixed bottom lets native browser positioning account for the changing top content origin, instead of retaining an old top coordinate. |
| Chrome Android, bottom bar | Keep the card above available bottom content. Native toolbar movement can move that edge. No website-side follow animation. |
| Safari Compact or Bottom | Keep the card above the browser’s available bottom edge and reported safe area. If controls expand, this edge can move; absolute physical-screen immobility is not promised. |
| Safari Top | There can still be controls at the bottom. Use the same native rule; do not assume top means no bottom controls. |
| Chrome on iPhone | Test separately from Android: top/bottom portrait choices, top in landscape. Same native rule, not Android-sized padding. |
| Landscape, phone rotation, split view | Native fixed bottom responds to the current containing block; parking threshold follows the matching ruler. |
| Keyboard / pinch zoom | Retain browser behaviour. Do not infer toolbar position from viewport height or inverse-scale the purchase card. |
| Toolbar already hidden on load / back-forward restore | There is no cached first-load height to become stale. |
| At the hat / scrolling back up | Handoff between viewport and document positions is continuous, in either direction. |

There is no standard top-versus-bottom toolbar placement flag. Do not detect it by browser name. Chrome Android also supports a bottom address bar. Safe-area inset is not a measurement of the whole browser toolbar.

## Verification and limits

Chromium and WebKit engine tests cover scroll down/up through the Canberra heading (including the header visibility switch), viewport height/width changes, landscape, exact parking/unparking, quantity/add/drawer actions, and desktop cleanup. Synthetic safe-area inputs 0/20/34/50px cover bottom/ruler agreement. These tests do not reproduce the physical Google-app or Safari toolbar animation.

If the physical-phone issue remains, [opt-in diagnostics](mobile-bag-diagnostics.md) record native bottom, card/coin rectangles, viewport metrics and state. Record the whole screen including browser controls. Stable page coordinates with visible movement can identify a browser content-surface/compositor change that cannot be diagnosed by page coordinates alone. Normal visits show no diagnostic UI and upload no data.

The old illustrative Safari wrapper (390×690 content, 44px status, 110px toolbar) was not a physical measurement.

## Primary references

- [Google app can open pages inside the app or externally](https://support.google.com/websearch/answer/7013866?co=GENIE.Platform%3DAndroid&hl=en)
- [Safari Compact, Bottom and Top layouts](https://support.apple.com/en-gb/guide/iphone/ipha9ffea1a3/ios)
- [Chrome Android bottom address bar](https://blog.google/products-and-platforms/products/chrome/address-bar-position-change/)
- [Chrome iPhone layout options](https://support.google.com/chrome/answer/14181646?co=GENIE.Platform%3DiOS&hl=en)
- [Chromium native controls / content offsets](https://chromium.googlesource.com/chromium/src/+/main/docs/ui/android/browser_controls.md)
- [Chrome fixed positioning and URL bar resizing](https://developer.chrome.com/blog/url-bar-resizing)
- [Chrome Android edge-to-edge and safe areas](https://developer.chrome.com/docs/css-ui/edge-to-edge)
- [Dynamic viewport sizes are not updated every animation frame](https://web.dev/blog/viewport-units)
