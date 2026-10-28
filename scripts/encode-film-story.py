"""Rebuild the calmer campaign edit from the untouched 4K master.

Frame ranges are half-open at the source's native 30 fps. Each camera angle
has its own phone framing; both deliveries use exactly the same frames.
"""
import argparse
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / 'assets/film'
SHOTS = [
    dict(name='Hold and straighten the hat', first=1315, end=1390, x='425'),
    dict(name='Walk forward and put it on', first=1543, end=1658,
         x='480-210*(1-pow(1-min(1,t/1.7),2))'),
    dict(name='Finish adjusting, then move', first=1792, end=1850,
         x='205+110*sin(1.570796*min(1,t/.6))-135*pow(max(0,min(1,(t-.6)/1.3)),1.5)'),
    dict(name='Walk through the street', first=1850, end=1907,
         x='235-100*min(1,max(0,t-.133333)/1.7)', raised=True),
    dict(name='Return to the boot', first=1907, end=1926, x='250', raised=True),
    dict(name='Open the boot', first=1926, end=1964, x='430'),
    dict(name='Hat lands, boot closes', first=1964, end=2061,
         x='355-120*min(1,max(0,(t-.933333)/.5))'),
]


def run(*args):
    subprocess.run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error',
                    *map(str, args)], check=True)


def encode(source):
    source = source.resolve(strict=True)
    for mobile in (False, True):
        inputs, filters = [], []
        for index, shot in enumerate(SHOTS):
            count = shot['end'] - shot['first']
            inputs += ['-ss', shot['first'] / 30, '-i', source]
            crop = ''
            if shot.get('raised'):
                crop = (f"crop=trunc(iw*250/960*.82/2)*2:trunc(ih*.82/2)*2:"
                        f"x='iw*({shot['x']})/960+(iw*250/960-ow)/2':y=ih-oh,"
                        if mobile else
                        'crop=trunc(iw*.82/2)*2:trunc(ih*.82/2)*2:x=(iw-ow)/2:y=ih-oh,')
            elif mobile:
                crop = f"crop=trunc(iw*250/960/2)*2:ih:x='iw*({shot['x']})/960':y=0,"
            size = '1000:2160' if mobile else '2560:1440'
            filters.append(f'[{index}:v]trim=end_frame={count},setpts=PTS-STARTPTS,'
                           f'{crop}scale={size}:flags=lanczos,setsar=1,format=yuv420p[v{index}]')
        filters.append(''.join(f'[v{i}]' for i in range(len(SHOTS))) +
                       f'concat=n={len(SHOTS)}:v=1:a=0[v]')
        suffix = '-mobile' if mobile else ''
        target = MEDIA / f'story-cut{suffix}.mp4'
        run(*inputs, '-filter_complex', ';'.join(filters), '-map', '[v]', '-an',
            '-c:v', 'libx264', '-preset', 'slow', '-crf', '20',
            '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
            '-movflags', '+faststart', target)
        # The exact first encoded frame is also the cover. No mid-shot seek.
        run('-i', target, '-frames:v', '1', '-q:v', '2', MEDIA / f'story-cut{suffix}.jpg')
    frame = 0
    timeline = []
    for shot in SHOTS:
        count = shot['end'] - shot['first']
        timeline.append({**shot, 'outputFirst': frame, 'outputEnd': frame + count})
        frame += count
    (MEDIA / 'story-cut.json').write_text(json.dumps(dict(fps=30, frames=frame, shots=timeline), indent=2))
    print(f'Encoded {frame} frames / {frame / 30:.3f}s, {len(SHOTS)} shots in both formats.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    encode(parser.parse_args().source)
