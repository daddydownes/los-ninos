"""Build a display-ready loop from the approved photographic views.

RIFE synthesizes motion offline; the browser only decodes a normal video.
Inputs remain untouched. Angles are editorial timing estimates, not scan data.
"""
from pathlib import Path
import sys, json, subprocess, shutil, bisect, os
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[3]
import cv2
SITE = ROOT / 'demo/zoom-storefront'
OUT = Path(os.environ.get('ROTATION_BUILD_DIR', ROOT / '.local/rotation-build'))
ASSETS = SITE / 'rotation-assets'
SOURCE = Path(os.environ.get('HAT_SPIN_SOURCE', ROOT / 'assets/hat-spin'))
RIFE_BIN = os.environ.get('RIFE_BIN') or shutil.which('rife-ncnn-vulkan')
RIFE_MODEL = os.environ.get('RIFE_MODEL') or (str(Path(RIFE_BIN).resolve().parent / 'rife-v4.6') if RIFE_BIN else '')
FFMPEG = os.environ.get('FFMPEG') or shutil.which('ffmpeg')
GPU = os.environ.get('RIFE_GPU', '0')
if '--keys-only' not in sys.argv and (not RIFE_BIN or not FFMPEG):
    raise SystemExit('Install FFmpeg and RIFE, or set FFMPEG, RIFE_BIN and RIFE_MODEL. See qa/REBUILD.md.')
manifest = json.loads((SOURCE / 'sequence.json').read_text())
angles = [0, 8, 25, 40, 55, 85, 92, 125, 135, 160, 175, 180, 184, 215, 230, 240, 255, 270, 290, 303, 320, 335, 350, 360]
W, H, CROWN = 1440, 960, 540
BG = (238, 236, 229)
FRAMES = 240
TOP = (H - manifest['bottom'] * CROWN) / 2
for p in [OUT, OUT/'keys', OUT/'frames', ASSETS]:
    p.mkdir(parents=True, exist_ok=True)

def register(entry):
    im = np.array(Image.open(SOURCE / entry['src']).convert('RGBA'))
    scale = CROWN / entry['crownHeight']
    mat = np.float32([[scale, 0, W/2-entry['x']*scale], [0, scale, TOP-entry['y']*scale]])
    rgba = cv2.warpAffine(im, mat, (W,H), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_CONSTANT)
    alpha = rgba[:,:,3:4].astype(np.float32)/255
    return np.clip(rgba[:,:,:3]*alpha + np.array(BG)*(1-alpha),0,255).astype(np.uint8)

for i, entry in enumerate(manifest['frames']):
    dest = OUT/'keys'/f'{i:02}.png'
    if not dest.exists(): Image.fromarray(register(entry)).save(dest)

if '--keys-only' in sys.argv:
    print(f'Registered source views saved in {OUT / "keys"}')
    raise SystemExit(0)

boundaries = [round(a/360*FRAMES) for a in angles]
for i in range(23):
    count = boundaries[i+1]-boundaries[i]
    target = OUT/'frames'/f'{boundaries[i+1]-1:04}.png'
    guided = SITE/'qa/rife/guided'/f'{i:02}-mid.png'
    done = OUT/f'pair-{i:02}'/'guided.done'
    if target.exists() and (not guided.exists() or done.exists()): continue
    pair = OUT/f'pair-{i:02}'
    inp, generated = pair/'in', pair/'out'
    inp.mkdir(parents=True,exist_ok=True)
    generated.mkdir(exist_ok=True)
    shutil.copy2(OUT/'keys'/f'{i:02}.png',inp/'0.png')
    shutil.copy2(OUT/'keys'/f'{(i+1)%23:02}.png',inp/'1.png')
    command = [RIFE_BIN,'-i',str(inp),'-o',str(generated),'-n',str(count*2),'-m',RIFE_MODEL,'-g',GPU,'-j','1:2:2','-z']
    print(f'Interpolating {i+1}/23: {count} moving frames',flush=True)
    with (pair/'render.log').open('w') as log:
        subprocess.run(command,stdout=log,stderr=log,check=True)
    files = sorted(generated.glob('*.png'))
    if len(files)!=count*2: raise RuntimeError(f'Missing frames in {pair}')
    if guided.exists():
        split = count//2
        guided_keys=[OUT/'keys'/f'{i:02}.png',guided,OUT/'keys'/f'{(i+1)%23:02}.png']
        files=[]
        for part,n in enumerate([split,count-split]):
            pi,po=pair/f'guided-in-{part}',pair/f'guided-out-{part}'
            pi.mkdir(exist_ok=True);po.mkdir(exist_ok=True)
            shutil.copy2(guided_keys[part],pi/'0.png');shutil.copy2(guided_keys[part+1],pi/'1.png')
            cmd=[RIFE_BIN,'-i',str(pi),'-o',str(po),'-n',str(n*2),'-m',RIFE_MODEL,'-g',GPU,'-j','1:2:2','-z']
            with (pair/f'guided-{part}.log').open('w') as log:subprocess.run(cmd,stdout=log,stderr=log,check=True)
            files.extend(sorted(po.glob('*.png'))[:n])
        done.write_text('Guided embroidery midpoint integrated.\n')
    for k in range(count): shutil.copy2(files[k],OUT/'frames'/f'{boundaries[i]+k:04}.png')

for width, suffix, crf in [(1440,'hd',17),(960,'mobile',18)]:
    path=ASSETS/f'photo-turn-{suffix}.mp4'
    command=[str(FFMPEG),'-hide_banner','-loglevel','error','-y','-framerate','30','-i',str(OUT/'frames/%04d.png'),'-frames:v',str(FRAMES),'-vf',f'scale={width}:-2:flags=lanczos','-c:v','libx264','-preset','slow','-crf',str(crf),'-pix_fmt','yuv420p','-movflags','+faststart','-an',str(path)]
    print(f'Encoding {path.name}',flush=True)
    subprocess.run(command,check=True)

Image.open(OUT/'keys/00.png').save(ASSETS/'photo-turn-poster.webp',quality=95)
sheet=Image.new('RGB',(1200, len(angles[:-1])*180),BG)
for row,i in enumerate(range(23)):
    indices=[boundaries[i],round((boundaries[i]+boundaries[i+1])/2),boundaries[i+1]%240]
    for col,n in enumerate(indices):
        im=Image.open(OUT/'frames'/f'{n:04}.png');im.thumbnail((400,266))
        # Contact sheet concentrates on the actual product instead of empty margins.
        crop=im.crop((0,40,400,220))
        ImageDraw.Draw(crop).text((8,8),f'{i:02} / {n:03}',fill='black')
        sheet.paste(crop,(col*400,row*180))
sheet.save(OUT/'all-transitions.jpg',quality=95)
(OUT/'manifest.json').write_text(json.dumps({'frames':FRAMES,'fps':30,'duration':8,'angles':angles,'boundaries':boundaries,'source':'approved original photo renders','method':'RIFE v4.6 temporal TTA, fixed crown registration','limitations':'Synthetic source views are not a calibrated product scan.'},indent=2))
print('Finished photographic loop',flush=True)
