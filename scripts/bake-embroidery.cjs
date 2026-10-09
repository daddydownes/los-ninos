/* Bake the existing static logo-thread filter once instead of on every masked
 * intro frame. The source coordinates, filter and lossless pixel output stay
 * unchanged. Keep the live header filter: filtering at its small display size
 * produces different antialiasing than downsampling the baked image.
 *
 * Requires npm dependencies, Playwright WebKit and Python with Pillow:
 *   npm ci && npx playwright install webkit
 *   python3 -m pip install Pillow
 *   node scripts/bake-embroidery.cjs
 * Set PYTHON to choose a different Python executable.
 */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { webkit } = require('playwright');

const root = path.resolve(__dirname, '..');
const destination = path.join(root, 'assets/hat-embroidery.webp');
const python = process.env.PYTHON || 'python3';
const dimension = 1254;

function runPython(source, ...args) {
  const result = spawnSync(python, ['-c', source, ...args], { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'Python verification failed');
}

function dataImage(file) {
  return 'data:image/webp;base64,' + fs.readFileSync(file).toString('base64');
}

function markup(src, filter, filtered) {
  return `<html><head><style>html,body{margin:0;background:transparent}svg{display:block}</style></head><body><svg xmlns="http://www.w3.org/2000/svg" width="${dimension}" height="${dimension}" viewBox="0 0 ${dimension} ${dimension}"><defs>${filter}</defs><image href="${src}" width="${dimension}" height="${dimension}" ${filtered ? 'filter="url(#logo-thread)"' : ''}/></svg></body></html>`;
}

(async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'los-ninos-embroidery-'));
  let browser;
  try {
    const html = fs.readFileSync(path.join(root, 'demo/directions/pages/index.html'), 'utf8');
    const filter = html.match(/<filter id="logo-thread"[\s\S]*?<\/filter>/)?.[0];
    if (!filter) throw new Error('The original logo-thread SVG filter is missing');
    const original = dataImage(path.join(root, 'assets/hat-front-logo-v1.webp'));
    browser = await webkit.launch();
    const page = await browser.newPage({ viewport: { width: dimension, height: dimension }, deviceScaleFactor: 1 });
    const reference = path.join(temporary, 'filtered.png');
    const optimized = path.join(temporary, 'baked.webp');
    const comparison = path.join(temporary, 'baked-render.png');
    await page.setContent(markup(original, filter, true));
    await page.screenshot({ path: reference, omitBackground: true });
    runPython(`
from PIL import Image
import sys
with Image.open(sys.argv[1]) as source:
    rgba = source.convert('RGBA')
    if rgba.size != (1254, 1254) or rgba.getchannel('A').getextrema() != (0, 255):
        raise ValueError('Unexpected dimensions or missing transparency')
    rgba.save(sys.argv[2], 'WEBP', lossless=True, method=6, exact=True)
    with Image.open(sys.argv[2]) as output:
        if output.convert('RGBA').tobytes() != rgba.tobytes():
            raise ValueError('WebP did not preserve the exact RGBA pixels')
`, reference, optimized);
    await page.setContent(markup(dataImage(optimized), filter, false));
    await page.screenshot({ path: comparison, omitBackground: true });
    runPython(`
from PIL import Image
import sys
with Image.open(sys.argv[1]) as a, Image.open(sys.argv[2]) as b:
    if a.size != b.size or a.convert('RGBA').tobytes() != b.convert('RGBA').tobytes():
        raise ValueError('Native WebKit rendering differs from the original filter')
`, reference, comparison);
    fs.copyFileSync(optimized, destination);
    console.log(`Wrote assets/hat-embroidery.webp (${fs.statSync(destination).size.toLocaleString('en-US')} bytes).`);
    console.log('Verified lossless RGBA and pixel-identical native WebKit rendering at 1254×1254.');
  } finally {
    try { if (browser) await browser.close(); }
    finally { fs.rmSync(temporary, { recursive: true, force: true }); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
