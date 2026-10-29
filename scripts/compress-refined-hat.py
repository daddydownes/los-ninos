"""Build web delivery images without changing the approved registration geometry."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import json, hashlib
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'demo/zoom-storefront'
manifest_path = BASE / 'rotation-assets/refined-hat.json'
data = json.loads(manifest_path.read_text())
def encode(frame):
    original = BASE / ('rotation-assets/refined-hat-%02d.png' % frame['index'])
    with Image.open(original) as source:
        for key, suffix, edge, quality in [('src', '', 1200, 78), ('srcSmall', '-mobile', 720, 74)]:
            image = source.convert('RGB')
            image.thumbnail((edge, edge), Image.Resampling.LANCZOS)
            target = original.with_name(original.stem + suffix + '.webp')
            image.save(target, 'WEBP', quality=quality, method=6)
            frame[key] = str(target.relative_to(BASE))
        frame['originalSha256'] = hashlib.sha256(original.read_bytes()).hexdigest()
        frame['sha256'] = hashlib.sha256((BASE / frame['src']).read_bytes()).hexdigest()
    return frame
with ThreadPoolExecutor(max_workers=6) as pool:
    data['frames'] = list(pool.map(encode, data['frames']))
manifest_path.write_text(json.dumps(data, indent=2) + '\n')
for key in ['src', 'srcSmall']:
    print(key, sum((BASE / f[key]).stat().st_size for f in data['frames']))
