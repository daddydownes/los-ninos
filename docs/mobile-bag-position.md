# Mobile purchase card position

30 October 2026: the mobile purchase card uses the browser’s current dynamic viewport height (`100dvh`), its own `safe-area-inset-bottom`, and a 14px gap. There are no Apple-specific offsets or toolbar dimensions. Android and iOS use the same rule, with the values each browser reports.

The user chose a small bottom gap over a frozen screen position. The earlier frozen small-viewport pixel anchor was removed because it left extra space below the card after browser toolbars collapsed. The card now moves as the browser viewport changes. Dynamic viewport updates may be throttled by the browser, so perfect frame-by-frame motion is not promised.

Native sticky containment still stops the card beneath the rotating hat, and the docked hat stays inside the card. Desktop positioning, bag actions, the 40% transparent surface, and opaque navy corner bag button remain unchanged.

For card height H, dynamic viewport height D, and bottom safe-area inset I, the sticky top is D − H − 14 − I, so its bottom is D − 14 − I until the native track endpoint. The safe area is a browser-supplied inset, not a measurement of the entire address bar. It can be nonzero on Android too. The exact physical relationship to browser controls still requires device validation.

Validation uses local WebKit and Chromium to check bidirectional scrolling, changing viewport sizes, width/orientation changes, the stopping boundary, bag actions, and synthetic bottom-inset values. These are engine and layout checks, not physical iPhone/Samsung measurements. A prior illustrative phone wrapper used a 390×690 content area, 44px status region, and 110px bottom region; those wrapper dimensions were not measured Safari chrome and must not be treated as such.

Real-device confirmation should record browser/version, expanded and collapsed toolbars, `100svh`/`100dvh`/`100lvh`, computed safe-area insets, visual-viewport dimensions/offset/scale, and the card bounding rectangle, alongside screen recordings. Include initial load with controls expanded/collapsed and orientation changes. No physical-device validation is claimed here.

References: [Google’s viewport-unit explanation](https://web.dev/blog/viewport-units), [Chrome Android edge-to-edge guide](https://developer.chrome.com/docs/css-ui/edge-to-edge), and [WebKit safe-area explanation](https://webkit.org/blog/7929/designing-websites-for-iphone-x/).
