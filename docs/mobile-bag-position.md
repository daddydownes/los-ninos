# Mobile purchase card position

30 October 2026: the card appeared to drift up on downward scroll and return on upward scroll. The sticky top used `100svh`, leaving extra space below the card when mobile browser chrome collapsed.

The mobile override uses `100dvh` to preserve the 14px plus safe-area bottom gap within the current viewport. Native sticky containment is retained, so the card still stops beneath the hat section. Desktop positioning is unchanged. Unsupported dynamic viewport units fall back to the earlier `svh` declaration.

The product card surface is 60% opaque / 40% transparent. The corner bag button remains opaque navy.

Build checked. Real-device Safari address-bar motion still needs visual confirmation; desktop emulation cannot fully reproduce browser chrome animation.
