"""Encode the selected film edit directly from the original master."""
import argparse
import shutil
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / 'assets/film'


def run(*args):
    subprocess.run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', *map(str, args)], check=True)


def encode_opening_posters():
    for mobile in (False, True):
        suffix = '-mobile' if mobile else ''
        for number, time in enumerate((0, .5, .9), 1):
            run('-ss', time, '-i', MEDIA / f'preview{suffix}.mp4',
                '-frames:v', '1', '-q:v', '3', MEDIA / f'opening-{number:02d}{suffix}.jpg')
        shutil.copyfile(MEDIA / f'opening-02{suffix}.jpg', MEDIA / f'poster{suffix}.jpg')
        # Every native frame in the opening shot, for the local comparison.
        run('-i', MEDIA / f'preview{suffix}.mp4', '-frames:v', '39',
            '-start_number', '0', '-q:v', '3',
            MEDIA / f'opening-frame-%02d{suffix}.jpg')


def selected_story_shots():
    """One shared edit for desktop and phone; only phone framing differs.

    Source positions and lengths are native 30fps frame counts. Ending a shot
    before the next source angle prevents one-frame flashes under the old crop.
    """
    frames = [
        (1734, 39, '330'),                       # first clear looking-left frame
        (1773, 19, '435'),                       # stop before hat-adjusting angle
        (1543, 115, '500-190*min(1,t/2.2)'),      # walk across the rear of the car
        (1697, 37, '400+90*min(1,t/1.25)'),       # side view, adjusting the hat
        (1800, 45, '295'),                       # front adjustment
        (1854, 51, '235-100*min(1,t/1.7)'),       # street walk
        (1911, 15, '250'),                       # return ends before source cut at 64.20s
        (1926, 38, '430'),                       # boot opening; stop before inside-boot angle
        (1965, 96, '355-120*min(1,max(0,(t-.9)/.5))'),  # boot closes; brief settle, then loop
    ]
    return [(start / 30, count / 30, crop) for start, count, crop in frames]


def encode_car_boot(source, keep_street=False, portrait_opening=False, output_prefix='preview', include_boot_walk=False):
    source = Path(source).resolve(strict=True)
    # Pickup -> straighten the brim -> toss into the boot. Cuts use the motion
    # already in the film; no speed ramp, crossfade, padding or artificial fill.
    short_shots = [
        (41.30, 1.00, '400'),
        (43.00, 2.80, '425'),
        (65.50, 2.00, '355-120*min(1,max(0,(t-.9)/.5))'),
    ]
    for mobile in (False, True):
        shots = short_shots
        if include_boot_walk:
            shots = selected_story_shots()
        elif keep_street:
            # Preserve the accepted street edit between the requested bookends.
            # End the phone close-up before the next camera angle at 59.733 s.
            # 20 frames included one stray hat-adjusting frame before the walk;
            # 19 + 115 + 37 keeps the close-up -> wide walk -> side-view order.
            middle = [
                (59.1, 19 / 30, '435'),
                (51 + 13 / 30, 115 / 30, '500-190*min(1,t/2.2)'),
                (56 + 17 / 30, 37 / 30, '400+90*min(1,t/1.25)'),
                # Unused street moments: front brim adjustment, then the wide
                # walk. Track the walker horizontally in the portrait frame.
                (60.0, 1.5, '295'),
                (61.8, 1.7, '235-100*min(1,t/1.7)'),
            ] if mobile else (
                # Move the looking-left shot to the opening instead of also
                # repeating it at its old position in the desktop sequence.
                [(50, 7.8, '0'), (59.1, 4.4, '0')]
                if portrait_opening else [(50, 13.5, '0')]
            )
            opening = (57.8, 1.3, '330') if portrait_opening else (43.3, 2.4, '425')
            shots = [opening, *middle, short_shots[-1]]
        inputs = []
        for start, duration, _ in shots:
            inputs += ['-ss', start, '-t', duration, '-i', source]
        filters = []
        for index, (_, _, framing) in enumerate(shots):
            # The two wide walking shots sit low beneath empty sky. Keep their
            # bottom edge and remove 18% of headroom, lifting the subject while
            # retaining his feet. Phone framing keeps the existing horizontal
            # tracking centre; desktop retains a centred 16:9 crop.
            raise_walker = include_boot_walk and index in (5, 6)
            if raise_walker:
                crop = (f"crop=trunc(iw*250/960*.82/2)*2:trunc(ih*.82/2)*2:"
                        f"x='iw*({framing})/960+(iw*250/960-ow)/2':y=ih-oh,"
                        if mobile else
                        'crop=trunc(iw*.82/2)*2:trunc(ih*.82/2)*2:x=(iw-ow)/2:y=ih-oh,')
            else:
                crop = (f"crop=trunc(iw*250/960/2)*2:ih:x='iw*({framing})/960':y=0,"
                        if mobile else '')
            # Keep the full native portrait crop for high-density screens;
            # desktop gets a 1440p render directly from the 4K master.
            size = '1000:2160' if mobile else '2560:1440'
            filters.append(f'[{index}:v]setpts=PTS-STARTPTS,{crop}'
                           f'scale={size}:flags=lanczos,setsar=1,format=yuv420p[v{index}]')
        labels = ''.join(f'[v{index}]' for index in range(len(shots)))
        filters.append(f'{labels}concat=n={len(shots)}:v=1:a=0[v]')
        suffix = '-mobile' if mobile else ''
        target = MEDIA / f'{output_prefix}{suffix}.mp4'
        run(*inputs, '-filter_complex', ';'.join(filters), '-map', '[v]', '-an',
            '-c:v', 'libx264', '-preset', 'slow', '-crf', '20',
            '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
            '-movflags', '+faststart', target)
        run('-ss', '0.15', '-i', target, '-frames:v', '1', '-q:v', '3',
            MEDIA / (f'poster{suffix}.jpg' if output_prefix == 'preview' else f'{output_prefix}{suffix}.jpg'))
    if portrait_opening and output_prefix == 'preview':
        encode_opening_posters()


def encode(source=None):
    if source:
        source = Path(source).resolve(strict=True)
        # Extract the same campaign passage from the master, retaining native
        # 30fps. The 4K source stays outside the public assets and Git repository.
        run('-ss', '50', '-i', source, '-t', '10', '-an', '-sn', '-dn',
            '-vf', 'scale=1920:1080:flags=lanczos,setsar=1', '-c:v', 'libx264',
            '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart', MEDIA / 'preview.mp4')
        run('-ss', '8', '-i', MEDIA / 'preview.mp4', '-frames:v', '1',
            '-q:v', '3', MEDIA / 'poster.jpg')
        mobile_input = ['-ss', '50', '-i', source]
    else:
        mobile_input = ['-i', MEDIA / 'preview.mp4']

    # Framing coordinates were measured against the 960px reference. Scale them
    # to the input width, allowing the mobile crop to use all the master detail.
    # Preserve full frame height, with no top/bottom padding or artificial fill.
    composition = (
        '[0:v]trim=duration=10,setpts=PTS-STARTPTS,split=3[a][b][c];'
        "[a]trim=start=1.416667:end=5.25,setpts=PTS-STARTPTS,crop=trunc(iw*250/960/2)*2:ih:x='iw*(500-190*min(1,t/2.2))/960':y=0,scale=720:1560:flags=lanczos[v0];"
        "[b]trim=start=6.541667:end=7.791667,setpts=PTS-STARTPTS,crop=trunc(iw*250/960/2)*2:ih:x='iw*(400+90*min(1,t/1.25))/960':y=0,scale=720:1560:flags=lanczos[v1];"
        '[c]trim=start=9.083333:end=9.75,setpts=PTS-STARTPTS,crop=trunc(iw*250/960/2)*2:ih:iw*435/960:0,scale=720:1560:flags=lanczos[v2];'
        '[v2][v0][v1]concat=n=3:v=1:a=0,setsar=1,format=yuv420p[v]'
    )
    run(*mobile_input, '-filter_complex', composition, '-map', '[v]', '-an',
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '21',
        '-movflags', '+faststart', MEDIA / 'preview-mobile.mp4')
    run('-ss', '0.2', '-i', MEDIA / 'preview-mobile.mp4', '-frames:v', '1',
        '-q:v', '3', MEDIA / 'poster-mobile.jpg')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, help='Path to the original master')
    parser.add_argument('--posters-only', action='store_true', help='Regenerate choices from the current portrait-opening videos')
    parser.add_argument('--output-prefix', default='preview', help='Separate named edit, preserving the existing preview files')
    parser.add_argument('--edit', choices=['portrait-street-walk-boot', 'portrait-street-boot', 'car-street-boot', 'car-boot', 'street'], default='portrait-street-walk-boot',
                        help='Looking-left opening, car opening, the short cut, or street alone')
    args = parser.parse_args()
    if args.posters_only:
        encode_opening_posters()
    elif args.edit != 'street':
        if not args.source:
            parser.error('--source is required for this edit')
        encode_car_boot(args.source, keep_street=args.edit != 'car-boot',
                        portrait_opening=args.edit.startswith('portrait-'), output_prefix=args.output_prefix,
                        include_boot_walk=args.edit == 'portrait-street-walk-boot')
    else:
        encode(args.source)
