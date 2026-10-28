# Film editorial rebuild — 26 October 2026

Superseded: this recommendation was rejected. See `film-model-options.md` for
the model-led stills and continuous-source approach now under review.

Local candidate only. The live shop has not changed.

## Diagnosis and approach

The old default starts 0.50 seconds into a 1.30-second portrait shot. Only
0.80 seconds of movement remains before a 0.63-second phone-looking insert,
followed by a jump backwards to putting the hat on. Three separate brim/side
adjustments fragment the action. Some full source angles were also trimmed
inside their natural beginnings or endings.

The supplied 75-second file is an already edited film, not the uncut camera
footage. A source shot cannot be made longer without changing speed, holding
frames or inventing material. The solution here is selection and continuity.

The recommended version opens on the hat already presented in his hands,
with legible embroidery and no frozen facial expression. It lets that gesture
finish, follows him putting the hat on, keeps one complete front adjustment,
then uses the uninterrupted source sequence from the street walk to the boot.
The seat pickup, car exit and rejected walk alongside the car remain omitted.

## Exact edit

All ranges are half-open native 30 fps frame ranges. No slow motion, optical
flow, speed ramps, repeated frames or crossfades are used.

| Output | Source | Editorial purpose |
| --- | --- | --- |
| 0–2.50s | 43.833–46.333s, frames 1315–1389 | Hold the embroidered hat, straighten it and lower it |
| 2.50–6.333s | 51.433–55.267s, frames 1543–1657 | Complete rear-car walk into putting the hat on |
| 6.333–8.267s | 59.733–61.667s, frames 1792–1849 | Match hands on the hat, finish adjusting, begin moving |
| 8.267–10.167s | 61.667–63.567s, frames 1850–1906 | Full street angle |
| 10.167–10.80s | 63.567–64.20s, frames 1907–1925 | Complete return angle from the source |
| 10.80–12.067s | 64.20–65.467s, frames 1926–1963 | Open the boot |
| 12.067–15.30s | 65.467–68.70s, frames 1964–2060 | Toss, landing, full closure and brief settle |

Seven angles / six internal cuts, versus nine angles / eight cuts previously.
The first moving shot lasts 2.50 seconds rather than 0.80. The 0.63-second
return angle remains because it is a complete source shot connecting the walk
to the boot handle. The last 7.03 seconds preserve original source order and
all frames, including the original camera cuts. The loop is an intentional
straight cut from the closed boot to holding the hat; it is not a seamless loop.

## Opening and delivery

- The poster is the first encoded frame, and playback starts at frame zero.
  There is no preparatory mid-shot seek for this version. The existing decoded
  frame cover and hat-handover gate remain.
- Both outputs contain the same 459 frames at 30 fps / 15.30 seconds.
- 2560×1440 desktop; 1000×2160 phone, H.264 CRF20 / slow, BT.709, faststart,
  encoded directly from the untouched 4K master, with no audio track.
- Portrait framing follows the rear-car walk and front adjustment. The two
  raised walking compositions remain; each framing decision belongs to its
  named shot rather than an implicit position in an unrelated edit.
- File sizes remain around the earlier HD exports. Full-file buffering and
  the existing 15-second still-image fallback remain. This is an editorial
  change, not evidence of improved slow-network delivery.

## Review and reproduction

Main: http://127.0.0.1:8793/

Comparison: http://127.0.0.1:8793/film-review.html — new/previous edit, desktop/
phone framing, full playback and chapter buttons. The old full intro remains
at `/?opening=02`; old frame-picker links still point to the old matching film.

Encode with `python scripts/encode-film-story.py --source "C:/Users/jacob/Downloads/Los Ninos FINAL.MP4"`.
Then run `python scripts/build-film-demo.py`.

Media checks: `diagnostics/video-layouts/inspect-story-cut.py`,
`story-media-check.json`, `story-boundaries.jpg`, `story-boundaries-mobile.jpg`.
The checks validate frame counts, duration, frame rate, full decoding and
produce two frames on either side of every cut for visual inspection.

Full-master and source inspection sheets are in the same diagnostics folder.
Do not use older frame contacts as evidence for this edit.

## Verification of this candidate

- Both final files decoded fully and contain exactly 459 frames at 30 fps.
  Desktop is 18,850,369 bytes; phone is 13,360,970 bytes.
- Two frames before and after every cut were inspected in both formats. Each
  camera change begins under its own crop, with no leftover frame of another
  angle. Phone tracking was corrected at the rear-car and front-adjustment shots.
- Both versions played to the 15.30-second end on the review page. The recorded
  event lists contained initial buffering, playing and ended, with no mid-play
  waiting or error event in those local observations.
- Main demo checked at 1440×900 and 390×844: correct format, 15.30-second media,
  opening phase complete, first visible frame 0.033 seconds, active playback
  and no horizontal overflow. The main tab had no captured console errors.
- New/previous switching selected the correct separate files and matching
  posters; previous-edit chapters are hidden and its intro link uses `opening=02`.
- Temporary viewport overrides were reset. Browser evidence is in
  `story-desktop-browser.json`, `story-phone-browser.json` and
  `story-edit-review-browser.png`. JavaScript syntax checks and `git diff --check`
  passed. These are local browser checks, not physical phone certification or
  a fresh slow-network benchmark.
