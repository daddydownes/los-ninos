"""Build the film candidate separately from the deployed storefront."""
import importlib.util
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('storefront_build', ROOT / 'scripts/build-site.py')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
base.OUTPUT = ROOT / '.local/film-demo-base'
base.OUTPUT.parent.mkdir(exist_ok=True)
base.build(commerce_enabled=True)
output = ROOT / '.local/film-demo-site'
shutil.copytree(base.OUTPUT, output, dirs_exist_ok=True)
for source in (ROOT / 'demo/film-storefront').iterdir():
    if source.is_file() and source.suffix in {'.html', '.css', '.js'}:
        shutil.copyfile(source, output / source.name)
shutil.copytree(ROOT / 'assets/film', output / 'assets/film', dirs_exist_ok=True)
shutil.copytree(ROOT / 'assets/photos-vault', output / 'assets/photos-vault', dirs_exist_ok=True)
for name in ('checkout.html', 'order.html'):
    page = output / name
    page.write_text(page.read_text(encoding='utf-8').replace('href="./"', 'href="./?return=shop"'), encoding='utf-8')
print(f'Film demo ready in {output}; run node scripts/commerce-local.mjs --film')
