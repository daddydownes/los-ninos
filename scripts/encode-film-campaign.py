"""Portrait still for the intro; omit its take and the tight cap close-up from the moving film."""
import argparse,json,runpy,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
MEDIA=ROOT/'assets/film'
SHOTS=runpy.run_path(str(ROOT/'scripts/encode-film-continuous.py'))['SHOTS']
def run(*args):
    subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','error',*map(str,args)],check=True)
def encode(source):
    source=source.resolve(strict=True)
    shots=[(a,b,x) for a,b,x in SHOTS if (a,b) not in {(1658,1696),(1734,1773)}]
    assert sum(b-max(a,1563) for a,b,_ in shots)==421
    for mobile in (False,True):
        inputs,filters=[],[]
        if mobile:
            for i,(a,b,x) in enumerate(shots):
                inputs+=['-ss',a/30,'-i',source]
                # Preserve the crop's original clock before trimming the lead-in.
                filters.append(f'[{i}:v]trim=end_frame={b-a},setpts=PTS-STARTPTS,'
                    f"crop=1000:2160:x='iw*({x})/960':y=0,"
                    f'trim=start_frame={max(0,1563-a)},setpts=PTS-STARTPTS,setsar=1[v{i}]')
            count=len(shots)
        else:
            for i,(a,b) in enumerate([(1563,1658),(1696,1734),(1773,2061)]):
                inputs+=['-ss',a/30,'-i',source]
                filters.append(f'[{i}:v]trim=end_frame={b-a},setpts=PTS-STARTPTS,'
                    f'scale=2560:1440:flags=lanczos,setsar=1[v{i}]')
            count=3
        filters.append(''.join(f'[v{i}]' for i in range(count))+f'concat=n={count}:v=1:a=0[v]')
        suffix='-mobile' if mobile else ''
        run(*inputs,'-filter_complex',';'.join(filters),'-map','[v]',
            '-an','-c:v','libx264','-preset','slow','-crf','18','-pix_fmt','yuv420p',
            '-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709',
            '-movflags','+faststart',MEDIA/f'campaign{suffix}.mp4')
    (MEDIA/'campaign.json').write_text(json.dumps(dict(fps=30,frames=421,duration=421/30,
        posterSourceFrame=1742,sourceRanges=[[1563,1658],[1696,1734],[1773,2061]],
        removedSourceRanges=[[1658,1696],[1734,1773]],removedSeconds=77/30,
        joinOutputFrames=[95,133],joinSeconds=[95/30,133/30],phoneNativeCrop=[1000,2160],crf=18),indent=2))
    print('Campaign: 421 frames / 14.03s. Tight close-up 1658-1695 and portrait 1734-1772 omitted.')
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,required=True)
    encode(parser.parse_args().source)
