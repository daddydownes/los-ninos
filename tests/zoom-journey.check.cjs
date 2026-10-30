let playwright;
try { playwright = require('@playwright/test'); }
catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
  playwright = require('playwright/test');
}
const { test: base, expect } = playwright;

const PHOTOS = ['photo-06.webp', 'photo-29.webp', 'portrait.webp', 'photo-09.webp', 'caps.webp'];
const section = page => page.locator('.zoom-journey');
const canvas = page => page.locator('canvas.zoom-canvas');

const test = base.extend({
  browserErrors: [async ({ page }, use, testInfo) => {
    const exceptions = [], badResponses = [], failedPhotos = [];
    page.on('pageerror', error => exceptions.push(error.message));
    page.on('response', response => {
      if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`);
    });
    page.on('requestfailed', request => {
      if (request.url().includes('/zoom-photos/')) failedPhotos.push(`${request.failure()?.errorText}: ${request.url()}`);
    });
    await use();
    expect(exceptions, 'The renderer must not throw during scroll, resize or image failure').toEqual([]);
    if (!testInfo.annotations.some(item => item.type === 'expected-network-failure')) {
      expect(badResponses, 'The exported demo must include its referenced assets').toEqual([]);
      expect(failedPhotos, 'Unexpected failed photograph requests').toEqual([]);
    }
  }, { auto: true }],
});

async function ready(page, { allPhotos = true } = {}) {
  await page.goto('/?return=shop', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).not.toHaveClass(/intro-pending/);
  await page.evaluate(() => {
    const journey = document.querySelector('.zoom-journey');
    scrollTo({ top: scrollY + journey.getBoundingClientRect().top, behavior: 'instant' });
  });
  await expect(section(page)).toHaveAttribute('data-zoom-renderer', 'canvas');
  await expect(canvas(page)).toBeVisible();
  if (allPhotos) {
    await expect.poll(() => page.locator('.zoom-photo img').evaluateAll(images =>
      images.filter(image => image.complete && image.naturalWidth > 0).length
    ), { message: 'All five photographs should be ready before traversing the sequence' }).toBe(5);
    // A decoded image's paint callback may be queued for the next display frame.
    await displayFrames(page);
  }
}

async function displayFrames(page, count = 2) {
  await page.evaluate(async frames => {
    for (let index = 0; index < frames; index++) await new Promise(requestAnimationFrame);
  }, count);
}

async function jump(page, depth) {
  await page.evaluate(value => {
    const journey = document.querySelector('.zoom-journey');
    const distance = document.querySelector('.zoom-distance').clientHeight;
    const top = scrollY + journey.getBoundingClientRect().top;
    scrollTo({ top: top + distance * value / 4.65, behavior: 'instant' });
  }, depth);
  await expect.poll(() => section(page).evaluate(element => Number(element.dataset.zoomDepth)), {
    message: `The requested scroll position should produce depth ${depth}`,
  }).toBeCloseTo(Math.max(0, Math.min(4, depth)), 2);
}

async function expectFrame(page, photo, depth) {
  await expect(canvas(page)).toHaveAttribute('data-photo', String(photo));
  await expect.poll(() => canvas(page).evaluate(element => Number(element.dataset.depth))).toBeCloseTo(depth, 2);
  const pixels = await canvas(page).evaluate(element => {
    const context = element.getContext('2d');
    const samples = [];
    // Corners, edges, centre and intermediate locations must all be painted.
    for (const y of [.01, .1, .3, .5, .7, .9, .99]) {
      for (const x of [.01, .1, .3, .5, .7, .9, .99]) {
        samples.push([...context.getImageData(Math.floor(x * (element.width - 1)), Math.floor(y * (element.height - 1)), 1, 1).data]);
      }
    }
    return {
      minimumAlpha: Math.min(...samples.map(pixel => pixel[3])),
      colors: new Set(samples.map(pixel => pixel.slice(0, 3).map(value => Math.floor(value / 8)).join(','))).size,
      range: Math.max(...samples.flatMap(pixel => pixel.slice(0, 3))) - Math.min(...samples.flatMap(pixel => pixel.slice(0, 3))),
    };
  });
  expect(pixels.minimumAlpha, 'The image must cover the canvas, including all four corners').toBe(255);
  expect(pixels.colors, 'An opaque background alone does not count as a photograph').toBeGreaterThan(8);
  expect(pixels.range, 'The rendered photograph must retain visible image detail').toBeGreaterThan(40);
}

async function expectFullPhoto(page, photo, { includeCenter = false } = {}) {
  const comparison = await canvas(page).evaluate((element, options) => {
    const image = document.querySelectorAll('.zoom-photo img')[options.photo];
    const reference = document.createElement('canvas');
    reference.width = element.width;
    reference.height = element.height;
    const context = reference.getContext('2d');
    context.fillStyle = '#080f19';
    context.fillRect(0, 0, reference.width, reference.height);
    // WebKit can omit computed styles inside a hidden fallback figure.
    const cover = matchMedia('(max-width:700px)').matches;
    context.imageSmoothingQuality = 'high';
    const scale = Math[cover ? 'max' : 'min'](reference.width / image.naturalWidth, reference.height / image.naturalHeight);
    const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
    context.drawImage(image, (reference.width - width) / 2, (reference.height - height) / 2, width, height);
    const actual = element.getContext('2d');
    const errors = [];
    for (const yf of [.07, .2, .35, .5, .65, .8, .93]) {
      for (const xf of [.07, .2, .35, .5, .65, .8, .93]) {
        // The 20% inset is intentionally a different image during normal motion.
        if (!options.includeCenter && Math.abs(xf - .5) < .15 && Math.abs(yf - .5) < .15) continue;
        const x = Math.floor(xf * (element.width - 1)), y = Math.floor(yf * (element.height - 1));
        const a = actual.getImageData(x, y, 1, 1).data;
        const b = context.getImageData(x, y, 1, 1).data;
        errors.push(...[0, 1, 2].map(channel => Math.abs(a[channel] - b[channel])));
      }
    }
    return { averageError: errors.reduce((sum, value) => sum + value, 0) / errors.length, maxError: Math.max(...errors) };
  }, { photo, includeCenter });
  expect(comparison.averageError, 'The whole source photograph should remain framed, rather than an enlarged fragment').toBeLessThan(3);
  expect(comparison.maxError, 'Sampled source-photo pixels should match the displayed full frame').toBeLessThan(24);
}

async function expectBounds(page) {
  const bounds = await canvas(page).evaluate(element => {
    const rect = element.getBoundingClientRect();
    return {
      width: element.width, height: element.height,
      cssWidth: rect.width, cssHeight: rect.height,
      content: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    };
  });
  expect(bounds.width * bounds.height, 'The backing buffer must remain within the 3 MP budget').toBeLessThanOrEqual(3_005_000);
  expect(bounds.width).toBeGreaterThan(0);
  expect(bounds.height).toBeGreaterThan(0);
  expect(bounds.width / bounds.cssWidth, 'Do not allocate a native DPR 3 image buffer').toBeLessThanOrEqual(2.01);
  expect(bounds.height / bounds.cssHeight).toBeLessThanOrEqual(2.01);
  expect(bounds.content, 'The photographic journey must not introduce horizontal scrolling').toBeLessThanOrEqual(bounds.viewport + 1);
}

test('the same five photographs decode before the journey and remain accessible as fallback content', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLImageElement.prototype.decode;
    window.__zoomDecoded = [];
    HTMLImageElement.prototype.decode = function(...args) {
      return original.apply(this, args).then(result => {
        if (this.currentSrc.includes('/zoom-photos/')) window.__zoomDecoded.push(this.currentSrc.split('/').pop());
        return result;
      });
    };
  });
  await ready(page);
  await expect.poll(() => page.evaluate(() => [...new Set(window.__zoomDecoded)].sort()), {
    message: 'Warm and decode every photograph, rather than depend on lazy loading a scaled inset',
  }).toEqual([...PHOTOS].sort());
  const sources = await page.locator('.zoom-photo img').evaluateAll(images => images.map(image => ({
    name: new URL(image.src).pathname.split('/').pop(), alt: image.alt,
  })));
  expect(sources.map(image => image.name)).toEqual(PHOTOS);
  expect(sources.every(image => image.alt.length > 10)).toBe(true);
  expect(await page.locator('.zoom-photo').evaluateAll(figures => figures.every(figure =>
    getComputedStyle(figure).transform === 'none'
  )), 'Fallback figures must not become enormous GPU-scaled image layers').toBe(true);
  await jump(page, 0);
  await expectFrame(page, 0, 0);
  await expectFullPhoto(page, 0);
  await expectBounds(page);
});

test('rapid jumps and reversals across every stop leave a complete photograph painted', async ({ page }) => {
  await ready(page);
  for (const depth of [0, 4, 1, 3, 2, 0, 3.2, 1.2, 2.2, .2, 4, 0]) {
    await jump(page, depth);
    await expectFrame(page, Math.floor(depth), depth);
    if (Number.isInteger(depth)) await expectFullPhoto(page, depth);
  }
  await jump(page, 4.65);
  await expectFrame(page, 4, 4);
  await expect(page.locator('[data-zoom-hint]')).toHaveText('Scroll to shop');
  await expectBounds(page);
});

test('a deferred third photograph holds a full frame and repaints on decode without another scroll', async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let requested = false;
  await page.route('**/zoom-photos/portrait.webp', async route => {
    requested = true;
    await gate;
    await route.continue();
  });
  try {
    await ready(page, { allPhotos: false });
    await expect.poll(() => requested).toBe(true);
    await jump(page, 1);
    await expectFrame(page, 1, 1);
    await jump(page, 2.6);
    await expectFrame(page, 1, 1);
    await expectFullPhoto(page, 1, { includeCenter: true });
    const heldY = await page.evaluate(() => scrollY);
    release();
    await expectFrame(page, 2, 2.6);
    expect(await page.evaluate(() => scrollY), 'Image completion should repaint without moving the page').toBe(heldY);
    await jump(page, 0);
    await expectFrame(page, 0, 0);
  } finally {
    release();
  }
});

test('a failed photograph preserves full background coverage and later stops remain usable', async ({ page }, testInfo) => {
  testInfo.annotations.push({ type: 'expected-network-failure', description: 'The third photograph deliberately returns HTTP 503.' });
  await page.route('**/zoom-photos/portrait.webp', route => route.fulfill({ status: 503, contentType: 'text/plain', body: 'Image unavailable in regression test' }));
  await ready(page, { allPhotos: false });
  await jump(page, 1);
  await expectFrame(page, 1, 1);
  await jump(page, 2.8);
  await expectFrame(page, 1, 1);
  await expectFullPhoto(page, 1, { includeCenter: true });
  await jump(page, 4);
  await expectFrame(page, 4, 4);
  await expectFullPhoto(page, 4, { includeCenter: true });
  await jump(page, 0);
  await expectFrame(page, 0, 0);
});

test('reduced motion shows the selected full photograph without a nested zoom', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  for (const depth of [0, .8, 2.2, 3.7, 1.1]) {
    await jump(page, depth);
    const photo = Math.round(depth);
    await expectFrame(page, photo, photo);
    await expectFullPhoto(page, photo, { includeCenter: true });
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await displayFrames(page);
  // The section becomes taller when motion is enabled, changing scroll depth.
  await jump(page, 1.1);
  await expectFrame(page, 1, 1.1);
  await expectBounds(page);
});

test('orientation and width changes repaint correctly while bounding high-DPR buffers', async ({ page }) => {
  await ready(page);
  for (const viewport of [
    { width: 852, height: 393 },
    { width: 393, height: 852 },
    { width: 1200, height: 1800 },
    { width: 393, height: 660 },
  ]) {
    await page.setViewportSize(viewport);
    await displayFrames(page);
    for (const depth of [3, 0]) {
      await jump(page, depth);
      await expectFrame(page, depth, depth);
      await expectFullPhoto(page, depth);
      await expectBounds(page);
    }
  }
});

test('locking the body for the bag does not paint a different photograph', async ({ page }) => {
  await ready(page);
  await jump(page, 2.35);
  await expectFrame(page, 2, 2.35);
  const before = await page.evaluate(() => ({
    y: scrollY,
    image: document.querySelector('canvas.zoom-canvas').toDataURL(),
  }));
  await page.locator('.brandbar [data-bag-open]').click();
  const bag = page.getByRole('dialog', { name: 'Your bag.' });
  await expect(bag).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('position', 'fixed');
  await displayFrames(page, 4);
  await expectFrame(page, 2, 2.35);
  expect(await canvas(page).evaluate(element => element.toDataURL()), 'Opening the bag must preserve the rendered photo and framing').toBe(before.image);
  await bag.getByRole('button', { name: 'Close bag' }).click();
  await expect(bag).not.toBeVisible();
  await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(before.y, 0);
  await expectFrame(page, 2, 2.35);
  await jump(page, 0);
  await expectFrame(page, 0, 0);
});

test('an unavailable 2D context keeps the selected decoded photograph visible and accessible', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      if (type === '2d' && this.classList.contains('zoom-canvas')) return null;
      return original.call(this, type, ...args);
    };
  });
  await page.goto('/?return=shop', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).not.toHaveClass(/intro-pending/);
  await jump(page, 0);
  await expect(section(page)).toHaveAttribute('data-zoom-renderer', 'fallback');
  await expect.poll(() => page.locator('.zoom-photo img').evaluateAll(images =>
    images.filter(image => image.complete && image.naturalWidth > 0).length
  )).toBe(5);
  for (const index of [1, 3, 0]) {
    await jump(page, index);
    await expect(canvas(page)).toBeHidden();
    const selected = page.locator('.zoom-photo').nth(index);
    await expect(selected).toBeVisible();
    await expect(page.locator('.zoom-photo:not([hidden])')).toHaveCount(1);
    await expect(selected).not.toHaveAttribute('aria-hidden', 'true');
    const image = selected.locator('img');
    const description = await image.getAttribute('alt');
    await expect(section(page).getByRole('img', { name: description, exact: true })).toBeVisible();
    expect(await image.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true);
    await expect(page.locator('.zoom-dots button').nth(index)).toHaveAttribute('aria-current', 'true');
  }
});

test('the normal intro removes scroll guards and warms story photos without hiding them for reveal', async ({ page }) => {
  await page.addInitScript(() => {
    const add = window.addEventListener, remove = window.removeEventListener;
    const guards = [];
    window.__zoomIntroGuards = guards;
    window.__zoomIntroGuardAdds = 0;
    window.__zoomPhotoRevealViolations = [];
    window.addEventListener = function(type, listener, options) {
      if (['touchmove', 'wheel'].includes(type) && options?.passive === false) {
        const capture = Boolean(options.capture);
        if (!guards.some(guard => guard.type === type && guard.listener === listener && guard.capture === capture)) {
          guards.push({ type, listener, capture });
          window.__zoomIntroGuardAdds++;
        }
      }
      return add.call(this, type, listener, options);
    };
    window.removeEventListener = function(type, listener, options) {
      const capture = typeof options === 'boolean' ? options : Boolean(options?.capture);
      const index = guards.findIndex(guard => guard.type === type && guard.listener === listener && guard.capture === capture);
      if (index >= 0) guards.splice(index, 1);
      return remove.call(this, type, listener, options);
    };
    new MutationObserver(records => {
      for (const record of records) {
        if (record.target.matches?.('.photo-slot') &&
            (record.target.classList.contains('reveal-pending') || /\breveal-pending\b/.test(record.oldValue || ''))) {
          window.__zoomPhotoRevealViolations.push(record.target.className);
        }
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveClass(/intro-pending/);
  await expect(page.locator('.scene')).toHaveAttribute('data-opening-phase', 'complete', { timeout: 15_000 });
  await expect(page.locator('html')).not.toHaveClass(/intro-pending|opening-settling/);
  const input = await page.evaluate(() => ({ adds: window.__zoomIntroGuardAdds, remaining: window.__zoomIntroGuards.length }));
  expect(input.adds, 'The test should observe the actual opening input guards being installed').toBeGreaterThanOrEqual(2);
  expect(input.remaining, 'Wheel and touchmove blockers must be removed after the opening').toBe(0);
  await expect(page.locator('.photo-slot')).toHaveCount(3);
  expect(await page.locator('.photo-slot').evaluateAll(figures => figures.every(figure =>
    !figure.classList.contains('reveal-pending') && getComputedStyle(figure).opacity === '1'
  )), 'Story photographs must be visible without awaiting a reveal animation').toBe(true);
  expect(await page.locator('.photo-slot img').evaluateAll(images => images.every(image =>
    image.loading === 'eager'
  )), 'Prepare every story photograph as soon as the introduction completes').toBe(true);
  expect(await page.evaluate(() => window.__zoomPhotoRevealViolations), 'No story photograph should enter the hidden reveal state').toEqual([]);
});
