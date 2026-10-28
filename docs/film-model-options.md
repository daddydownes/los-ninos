## Current selection — close-up removed

Portrait still remains in the intro. Campaign film omits source frames 1658–1695 (extreme cap close-up) and 1734–1772 (repeated portrait). Remaining source ranges: [1563,1658), [1696,1734), [1773,2061). Both formats: 421 frames / 14.0333 seconds at 30 fps. New close-up-removal join is output frame 95 / 3.1667 seconds. Encoded directly from the original 4K master at the existing CRF 18 quality, preserving phone crop timing. Local demo only. Earlier revision notes follow.

# Model openings and original continuity — 26 October 2026

Local studies only. This replaces the recommendation in film-edit-plan.md;
that car/hat-first edit was rejected for its freeze frame and rearranged cuts.

## Decisions

The opening still and the film's starting point are separate design decisions.
Use a model-led still, inspect it as a phone advertisement, and preserve source
continuity after playback starts. Fewer angles alone does not make an edit flow.

The new common media retains every source frame from 1543 through 2060, at
30 fps: 51.433–68.700 seconds, 518 frames / 17.266667 seconds. Desktop is a
single trim. The phone uses consecutive ranges for horizontal reframing; the
encoder asserts that each range starts exactly where the previous one ended.
All original camera edits remain; no internal frames are omitted or reordered.

The three candidates are:

| Candidate | Still | Playback | Purpose |
| --- | --- | --- | --- |
| Full scene | Source frame 1563, eyes open beside the car | 52.100–68.700s, 16.60s | A body-led opening with time for the walk and putting the cap on |
| Portrait | Source frame 1742, wearing cap and looking left | 58.067–68.700s, 10.63s | Closest to the previously liked model opening; same frame continues into motion |
| Portrait to full film | Same portrait at frame 1742 | 52.100–68.700s, 16.60s | Hold the portrait during the site intro, then deliberately cut into the longer original scene |

The third option has an intentional presentation cut from the portrait still
to the wide car scene when the flying hat lands. The film itself remains in
source order. It avoids trying to move the portrait take to the front of the
film and then splicing back to earlier events. The normal Portrait option
remains the local homepage default while these options are reviewed.

The first 20 frames of the common media remain in the file, but the Full scene
and campaign candidates start after the initial blink. The Portrait candidate
starts eight frames into its source shot, avoiding the earlier blink. Its
remaining portrait shot is inherently brief; the next 0.63-second cut is
already present in the supplied, edited master. Longer uninterrupted takes
would require the original camera footage.

## Image fidelity

The source is 3840×2160 / 30 fps / BT.709. New exports come directly from it,
at 2560×1440 desktop and a native 1000×2160 phone crop, H.264 CRF18 / slow,
faststart, without audio. The former walking-shot crop reduced the source
to 820×1770 then enlarged it; that extra enlargement is removed here. A phone
still necessarily crops the sides of the landscape master. Source motion,
focus softness and night noise remain; no AI detail or heavy sharpening was added.

The final files are 32,022,968 bytes desktop and 20,144,760 bytes phone. The
existing full-download gate and 15-second still fallback remain. These larger
quality-study files must be considered in later network delivery work; this
does not establish slow-network readiness.

Both files fully decoded and contain exactly 518 native frames. A normalized
frame-for-frame comparison of the desktop export with the same source passage
produced 518 SSIM entries, aggregate 0.990632. The same portrait frame compared
at native phone crop improved from 0.981016 (previous CRF20) to 0.984941 (CRF18).
These support retained detail and alignment; they do not prove subjective
perfection or invent detail that is absent from the source.

## Review and reproduction

http://127.0.0.1:8793/model-openings.html provides all three first frames,
phone/desktop film playback, and the actual website intro embedded at the
selected width. Each candidate also has a direct full-site link.

Encode with `python scripts/encode-film-continuous.py --source "C:/Users/jacob/Downloads/Los Ninos FINAL.MP4"`,
then `python scripts/build-film-demo.py`. The original master stays untouched.
Current media and source ranges are recorded in `assets/film/continuous.json`.

Evidence: `diagnostics/video-layouts/continuous-source-ssim.txt`,
`portrait-source-reference.png`, `portrait-previous-reference.png`,
`portrait-continuous-reference.png`, and browser records for these candidates.

Earlier edit/gallery files are retained for reference, not offered as the
recommended direction. No production website, orders or emails were changed.

## Browser verification

- Portrait phone playback ran from 6.633 to 17.267 seconds and reached ended,
  without a mid-play waiting or error event in that local observation.
- Portrait-to-full-film was exercised through the actual site intro in a
  phone iframe (373×840 usable viewport) and desktop iframe (1010×720 usable
  viewport). Both started around media time 0.667 only with opening phase
  complete, used their correct assets and portrait posters, and completed loops.
- Desktop preview now maintains a real 1024px iframe layout and scales its
  presentation to the available pane. It no longer silently uses the phone
  breakpoint when the outer browser pane is narrow.
- The main demo used the portrait poster and continuous phone asset, first
  visible frame 6.666667, with active playback after the handover and no media
  error. The comparison tab had no captured console errors.
- Evidence: `model-campaign-phone-browser.json`,
  `model-campaign-desktop-browser.json`, `model-portrait-main-browser.json`,
  `model-opening-options-browser.png`. These are local browser observations,
  not physical iPhone/Safari or slow-network certification.

## Selected revision — portrait removed from the moving film

Jacob selected Portrait to full film and requested removing the source take
used for its portrait. The local homepage now defaults to this candidate.
The portrait still (source frame 1742) remains unchanged during the intro.
The moving film retains source frames 1563–1733 and 1773–2060: only the
39-frame / 1.30-second portrait take is omitted. The new join is at output
frame 171 / 5.70 seconds. Total: 459 frames / 15.30 seconds in both formats.
Remaining source order, speed, CRF18 quality and phone crops are preserved.
The boot closes fully. The source master is untouched.

Reproduce using scripts/encode-film-campaign.py with --source pointing to
the original master, then scripts/build-film-demo.py. Earlier comparison
assets remain available. This change is local only.
