"""Build an isolated local storefront snapshot. Never publish this directory."""
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
subprocess.run([sys.executable, str(ROOT / 'scripts/build-zoom-shop.py')], cwd=ROOT, check=True)
output = ROOT / '.local/commerce-review-site'
shutil.copytree(ROOT / '_site', output, dirs_exist_ok=True)
shutil.copyfile(ROOT / 'scripts/commerce-review.html', output / 'demo.html')
subprocess.run(['node', str(ROOT / 'scripts/render-email-examples.mjs')], cwd=ROOT, check=True)
print('Review ready. Start: node scripts/commerce-local.mjs --review')
print('Open http://127.0.0.1:8784/demo.html (orders are preserved between runs).')
