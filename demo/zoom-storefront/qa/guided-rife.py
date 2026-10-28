from pathlib import Path
import sys,subprocess,os,shutil
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[3]
import cv2
BASE=Path(__file__).resolve().parent
OUT=BASE/'rife/guided';OUT.mkdir(exist_ok=True)
KEYS=Path(os.environ.get('ROTATION_BUILD_DIR',ROOT/'.local/rotation-build'))/'keys'
RIFE_BIN=os.environ.get('RIFE_BIN') or shutil.which('rife-ncnn-vulkan')
if not RIFE_BIN:raise SystemExit('Install RIFE or set RIFE_BIN and RIFE_MODEL. See qa/REBUILD.md.')
RIFE_MODEL=os.environ.get('RIFE_MODEL') or str(Path(RIFE_BIN).resolve().parent/'rife-v4.6')
GPU=os.environ.get('RIFE_GPU','0')
W,H=1440,960

def warp(im,src,dst):
    # Solve an inverse TPS field: output landmarks map to the input landmarks.
    p=np.asarray(dst,dtype=np.float64)/W
    target=(np.asarray(src)-np.asarray(dst))/W
    r2=((p[:,None]-p[None])**2).sum(axis=2)
    k=r2*np.log(r2+1e-14)
    poly=np.c_[np.ones(len(p)),p]
    lhs=np.block([[k+np.eye(len(p))*1e-8,poly],[poly.T,np.zeros((3,3))]])
    weights=np.linalg.solve(lhs,np.vstack([target,np.zeros((3,2))]))
    grid=np.stack(np.meshgrid(np.linspace(0,W-1,360),np.linspace(0,H-1,240)),axis=-1).reshape(-1,2)/W
    d2=((grid[:,None]-p[None])**2).sum(axis=2)
    eval=np.c_[d2*np.log(d2+1e-14),np.ones(len(grid)),grid]
    displacement=cv2.resize((eval@weights*W).reshape(240,360,2).astype(np.float32),(W,H),interpolation=cv2.INTER_CUBIC)
    coords=np.stack(np.meshgrid(np.arange(W),np.arange(H)),axis=-1).astype(np.float32)+displacement
    return cv2.remap(im,coords[:,:,0],coords[:,:,1],cv2.INTER_CUBIC,borderMode=cv2.BORDER_REPLICATE)

# Hand-picked corresponding embroidery and crown landmarks, in registered pixels.
# This constrains large logo movement that the flow network missed on its own.
fixed=[[0,0],[720,0],[1439,0],[0,480],[1439,480],[0,959],[720,959],[1439,959],[720,160],[360,400],[1110,400]]
pairs={
 6: (
 [[720,525],[833,545],[833,635],[720,606],[366,600],[1120,580],[1080,655],[520,660]],
 [[460,508],[551,535],[550,630],[460,590],[350,600],[1112,580],[835,674],[630,680]]
 ),
 8: (
 [[440,505],[524,532],[522,630],[438,590],[375,600],[1100,580],[805,665],[560,675]],
 [[397,478],[425,493],[421,566],[390,549],[370,600],[1090,580],[630,666],[470,650]]
 )
}
for i,(aa,bb) in pairs.items():
    a=np.asarray(Image.open(KEYS/f'{i:02}.png'))
    b=np.asarray(Image.open(KEYS/f'{i+1:02}.png'))
    pa=np.float64(fixed+aa[:4]);pb=np.float64(fixed+bb[:4]);mid=(pa+pb)/2
    for tag,im,points in [('A',a,pa),('B',b,pb)]:Image.fromarray(warp(im,points,mid)).save(OUT/f'{i:02}-{tag}.png')
    cmd=[RIFE_BIN,'-0',str(OUT/f'{i:02}-A.png'),'-1',str(OUT/f'{i:02}-B.png'),'-o',str(OUT/f'{i:02}-mid.png'),'-m',RIFE_MODEL,'-g',GPU,'-z']
    subprocess.run(cmd,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True)
    print(f'Guided midpoint {i}',flush=True)
