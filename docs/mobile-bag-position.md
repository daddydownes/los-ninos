# Mobile purchase card position

30 October 2026: the user confirmed that movement while scrolling is unacceptable. The dynamic-bottom-gap change is reverted. Stable positioning takes priority over reclaiming the space left by collapsed browser controls.

The mobile sticky top is calculated from 100svh, card height, a 14px gap and the browser’s own safe-area inset, then frozen in pixels per viewport width/orientation. Height-only toolbar changes do not recalculate it. Width/orientation changes remeasure; desktop remains unchanged. No Apple-specific spacing is applied to Android.

Tradeoff: a gap can appear below the card when browser controls hide. Native sticky containment still stops the card beneath the rotating hat. The docked hat remains inside the card; bag controls and 40% transparency remain unchanged.

This locks the CSS viewport position, not the browser UI itself. Physical-screen behaviour when a top toolbar changes the viewport origin still requires a real-device check.

Validation uses local WebKit and Chromium to check bidirectional scrolling, changing viewport sizes, width/orientation changes, the stopping boundary, bag actions, and synthetic bottom-inset values. These are engine and layout checks, not physical iPhone/Samsung measurements. A prior illustrative phone wrapper used a 390×690 content area, 44px status region, and 110px bottom region; those wrapper dimensions were not measured Safari chrome and must not be treated as such.

Real-device confirmation should record browser/version, expanded and collapsed toolbars, `100svh`/`100dvh`/`100lvh`, computed safe-area insets, visual-viewport dimensions/offset/scale, and the card bounding rectangle, alongside screen recordings. Include initial load with controls expanded/collapsed and orientation changes. No physical-device validation is claimed here.

References: [Google’s viewport-unit explanation](https://web.dev/blog/viewport-units), [Chrome Android edge-to-edge guide](https://developer.chrome.com/docs/css-ui/edge-to-edge), and [WebKit safe-area explanation](https://webkit.org/blog/7929/designing-websites-for-iphone-x/).
