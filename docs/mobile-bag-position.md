# Mobile purchase card position

30 October 2026: the purchase card and its docked hat moved vertically as Safari's toolbar expanded or collapsed. The dynamic viewport (`100dvh`) top offset followed the changing viewport height.

The mobile card now resolves its small-viewport (`100svh`) top inset into pixels once per viewport width/orientation. Height-only changes do not update this anchor. Width and orientation changes recalculate it; desktop remains unchanged. Native sticky containment still stops the card beneath the rotating hat. The docked hat stays inside the card.

Tradeoff: when Safari hides its toolbar, more space can appear below the card. This deliberately prioritizes a stable screen position over a constant bottom gap. The card surface remains 40% transparent and the corner bag button remains opaque navy.

Validation: focused WebKit and Chromium checks covered bidirectional scroll, same-width height changes, width/orientation changes, the native stopping boundary and bag actions. Build and syntax checks passed. Physical iPhone Safari toolbar/compositor behavior still needs confirmation on a real phone.
