# Optional mobile bag measurements

Open the site with `?debug=bag`, for example `https://daddydownes.github.io/los-ninos/?debug=bag`. The ordinary URL has no diagnostic overlay, listeners or sampling. The diagnostic file exits immediately on ordinary visits.

Scroll until the movement occurs, then tap **Copy report**. If clipboard access is unavailable, a selectable text field appears instead. A screen recording alongside the report helps distinguish movement inside the page from movement of the browser’s content area. Close removes the overlay and stops its listeners. Reload the diagnostic URL to start again.

The overlay shows the motion-file release marker as its build label. Reports also include the stylesheet and diagnostic-file release markers, browser identification, screen dimensions and the most recent 180 event-driven samples. There is no continuous sampling timer, storage, upload or analytics.

Measurements include the purchase card’s layout top, visual top (`layoutTop − visualViewport.offsetTop`), computed top inset, anchor custom property, visual-viewport offset/height/scale, track bottom, distance from the parking boundary, corner bag rectangle, page scroll position and body scroll-lock state. The positioning controller’s state is shown when available. All positions are CSS pixels, not physical-screen coordinates. Browser UI dimensions cannot be inferred from these values alone.

Without a positioning-controller state, the near-boundary label marks the last 80px before the stopping point. Motion at or after that boundary can be intentional parking. To compare toolbar behavior, collect samples while the card is floating well before that boundary, with both expanded and collapsed browser controls. Include the browser and OS version when sharing the report.
