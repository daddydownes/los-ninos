# Campaign video framing

Requested 30 October 2026: after the phone shot, the person and hat sit too low. Raise this section until the boot-opening cut on phones only. Desktop framing is already correct and must remain unchanged.

- Applies only to the default `campaign` opening.
- Starts at output frame 152 / 30 = 5.0667 seconds (source frame 1792).
- Ends before output frame 286 / 30 = 9.5333 seconds (source frame 1926, boot opening).
- The source edit removes 77 frames before this section; output frame = source frame - 1563 - 77.
- Bottom-aligned cover crop moves the visible picture upwards when there is vertical overflow.
- Bottom-anchored scale is 1.20 on portrait phones only (viewport width at most 700px), providing upward reframing even when the video exactly fits the viewport. No scale or position override applies on desktop.
- The original framing resumes at the boot cut, including on replay and seeking.
- Implemented in `demo/zoom-storefront/film-framing.js` and `zoom.css`. The video files, shot lengths and order are unchanged.

Future adjustments: change the scale/crop in CSS or the two frame boundaries in the script. Check the hat remains visible across phone sizes; this is a responsive framing choice, not a re-encoded master.
