"""Preserve every source frame from the rear-car walk through boot closure.

The camera edits are already in the master. Phone framing changes at those
exact cuts, but never changes frame order, shot length or playback speed.
"""
import argparse
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / 'assets/film'
FIRST, END = 1543, 2061
SHOTS = [
    (1543, 1658, '480-210*(1-pow(1-min(1,t/1.7),2))'),
    (1658, 1696, '200'),
    (1696, 1734, '400+90*min(1,t/1.25)'),
    (1734, 1773, '330'),
    (1773, 1792, '435'),
    (1792, 1850, '205+110*sin(1.570796*min(1,t/.6))-135*pow(max(0,min(1,(t-.6)/1.3)),1.5)'),
    (1850, 1907, '235-100*min(1,max(0,t-.133333)/1.7)'),
    (1907, 1926, '250'),
    (1926, 1964, '430'),
    (1964, 2061, '355-120*min(1,max(0,(t-.933333)/.5))'),
]
OPENINGS = [('model', 1563), ('portrait', 1742)]


def run(*args):
    subprocess.run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', *map(str, args)], check=True)


def encode(source):
    source = source.resolve(strict=True)
    assert SHOTS[0][0] == FIRST and SHOTS[-1][1] == END
    assert all(a[1] == b[0] for a, b in zip(SHOTS, SHOTS[1:]))
    codec = ['-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
             '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709',
             '-color_trc', 'bt709', '-movflags', '+faststart']
    # One uninterrupted trim for desktop; no reconstruction of its original cuts.
    run('-ss', FIRST / 30, '-i', source, '-vf',
        f'trim=end_frame={END-FIRST},setpts=PTS-STARTPTS,scale=2560:1440:flags=lanczos,setsar=1',
        *codec, MEDIA / 'continuous.mp4')
    inputs, filters = [], []
    for i, (first, end, x) in enumerate(SHOTS):
        inputs += ['-ss', first / 30, '-i', source]
        # Native 1000x2160 pixels: no vertical crop or enlargement.
        filters.append(f'[{i}:v]trim=end_frame={end-first},setpts=PTS-STARTPTS,'
                       f"crop=1000:2160:x='iw*({x})/960':y=0,setsar=1[v{i}]")
    filters.append(''.join(f'[v{i}]' for i in range(len(SHOTS))) +
                   f'concat=n={len(SHOTS)}:v=1:a=0[v]')
    run(*inputs, '-filter_complex', ';'.join(filters), '-map', '[v]',
        *codec, MEDIA / 'continuous-mobile.mp4')
    for suffix in ('', '-mobile'):
        for name, first in OPENINGS:
            run('-i', MEDIA / f'continuous{suffix}.mp4', '-vf',
                f'select=eq(n\\,{first-FIRST})', '-frames:v', '1', '-q:v', '1',
                MEDIA / f'model-{name}{suffix}.jpg')
    manifest = dict(sourceFirst=FIRST, sourceEnd=END, frames=END-FIRST, fps=30,
                    sourceOrderUnchanged=True, phoneNativeCrop=[1000, 2160], crf=18,
                    shots=[dict(first=a, end=b, x=x) for a,b,x in SHOTS],
                    openings=[dict(id=name, sourceFrame=n, posterSourceFrame=n, outputFrame=n-FIRST,
                                   time=(n-FIRST)/30, duration=(END-n)/30) for name,n in OPENINGS] +
                             [dict(id='campaign', sourceFrame=1563, posterSourceFrame=1742,
                                   outputFrame=20, time=20/30, duration=498/30)])
    (MEDIA / 'continuous.json').write_text(json.dumps(manifest, indent=2))
    print(json.dumps(manifest, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    encode(parser.parse_args().source)
