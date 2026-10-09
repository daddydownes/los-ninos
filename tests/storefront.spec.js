const { test: base, expect } = require('@playwright/test');

const test = base.extend({
  // A passing interaction must not hide an uncaught error elsewhere on the page.
  browserIssues: [async ({ page }, use, testInfo) => {
    const exceptions = [], consoleErrors = [], badResponses = [];
    page.on('pageerror', error => exceptions.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('response', response => {
      if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`);
    });
    await use();
    expect(exceptions, 'Uncaught browser exceptions').toEqual([]);
    // These two recovery tests deliberately fail resources. Browser network
    // console messages differ between engines, but JS exceptions never do.
    if (!testInfo.annotations.some(item => item.type === 'expected-network-failure')) {
      expect(consoleErrors, 'Browser console errors').toEqual([]);
      expect(badResponses, 'Missing or failed production resources').toEqual([]);
    }
  }, { auto: true }],
});

const bag = page => page.getByRole('dialog', { name: 'Your bag.' });
const quantity = page => bag(page).getByLabel('Quantity', { exact: true });

async function ready(page, path = '/#shop') {
  await page.goto(path);
  await expect(page.locator('html')).not.toHaveClass(/intro-pending/);
  await expect(page.getByRole('button', { name: 'Add to bag', exact: true })).toBeVisible();
}

async function noHorizontalOverflow(page) {
  const width = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(width.content, 'The page should fit without horizontal scrolling').toBeLessThanOrEqual(width.viewport + 1);
}

async function spinReady(page) {
  const stage = page.locator('[data-orbit-stage]');
  await stage.scrollIntoViewIfNeeded();
  const canvas = stage.getByRole('img', { name: 'Interactive AI-rendered 360-degree hat' });
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-orbit-status]')).toContainText(/ready/i);
  await expect(stage).not.toHaveAttribute('aria-busy', 'true');
  return canvas;
}

async function canvasImage(canvas) {
  return canvas.evaluate(async element => {
    // Compare every rendered pixel without embedding megabytes of PNG data in
    // assertion reports. Dimensions remain part of the exact image identity.
    const { width, height } = element;
    const pixels = element.getContext('2d').getImageData(0, 0, width, height).data;
    const digest = await crypto.subtle.digest('SHA-256', pixels);
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    return `${width}×${height}:sha256:${hash}`;
  });
}

async function waitForScroll(page, previous) {
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(previous + 20);
}

async function expectOpeningAtTop(page) {
  await expect(page.locator('html')).toHaveClass(/intro-pending/);
  await expect.poll(() => page.evaluate(() => Math.abs(scrollY)), { timeout: 3_000 }).toBeLessThanOrEqual(1);
  await expect(page.locator('.sewing-drawing')).toHaveCSS('opacity', '1');
  await expect.poll(() => page.locator('.sew-path').first().evaluate(path => parseFloat(getComputedStyle(path).strokeDashoffset)), {
    message: 'The first letter must actually start stitching after refresh', timeout: 3_000,
  }).toBeLessThan(.99);
  // Check again after animation has begun, when native reload restoration used
  // to move the page back down underneath the input-blocking opening.
  expect(Math.abs(await page.evaluate(() => scrollY))).toBeLessThanOrEqual(1);
}

test('opening reaches usable content and defers rotation downloads', async ({ page }) => {
  await page.addInitScript(() => {
    const add = window.addEventListener, remove = window.removeEventListener;
    const guards = [];
    window.__blockingScrollListeners = guards;
    window.addEventListener = function(type, listener, options) {
      if (['touchmove', 'wheel'].includes(type) && options?.passive === false) {
        guards.push({ type, listener, capture: Boolean(options.capture) });
      }
      return add.call(this, type, listener, options);
    };
    window.removeEventListener = function(type, listener, options) {
      const capture = typeof options === 'boolean' ? options : Boolean(options?.capture);
      const index = guards.findIndex(item => item.type === type && item.listener === listener && item.capture === capture);
      if (index >= 0) guards.splice(index, 1);
      return remove.call(this, type, listener, options);
    };
  });
  const rotationRequests = [];
  page.on('request', request => {
    if (/\/hat-spin\/sequence\.json|\/hat-spin\/.*frame-(?!000)\d+\.(png|webp)/.test(request.url())) {
      rotationRequests.push(request.url());
    }
  });
  await ready(page, '/');
  await expect(page.locator('#hero-hat')).toHaveCSS('opacity', '1');
  await expect(page.locator('#hero-hat')).toBeVisible();
  expect(await page.locator('#hero-hat').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await noHorizontalOverflow(page);
  expect(await page.evaluate(() => window.__blockingScrollListeners.length), 'Remove window scroll-blocking listeners once the intro is complete').toBe(0);
  // Allow deferred work and observer callbacks to run after the entrance.
  await page.waitForTimeout(350);
  expect(rotationRequests, 'Offscreen rotation must not compete with the opening').toEqual([]);
  await page.getByRole('button', { name: 'Add to bag', exact: true }).click();
  await expect(bag(page)).toBeVisible();
  await expect(quantity(page)).toHaveText('1');
});

test('early stitching leaves the unstarted lower letters free of white dots', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const start = new Date('2026-01-01T00:00:00Z');
  await page.clock.install({ time: start });
  // The installed clock runs until paused; a later target avoids trying to
  // rewind a few milliseconds when browser workers are busy starting up.
  await page.clock.pauseAt(new Date(start.getTime() + 1_000));
  await page.goto('/');
  await page.evaluate(async () => {
    await Promise.all([...document.querySelectorAll('.product-lockup img')].map(image => image.decode()));
    await document.fonts.ready;
  });
  // Run the real animation clock through image preparation and the first letter.
  // Later letters have not begun; their rounded stroke ends must remain invisible.
  await page.clock.runFor(400);
  await expect(page.locator('html')).toHaveClass(/intro-pending/);
  const drawing = page.locator('.sewing-drawing');
  await expect(drawing).toHaveCSS('opacity', '1');
  const bounds = await drawing.boundingBox();
  const region = (top, bottom) => ({
    x: bounds.x + bounds.width * 380 / 1254,
    y: bounds.y + bounds.height * top / 1254,
    width: bounds.width * 505 / 1254,
    height: bounds.height * (bottom - top) / 1254,
  });
  async function contrastingPixels(clip, name) {
    const screenshot = await page.screenshot({ clip });
    await testInfo.attach(name, { body: screenshot, contentType: 'image/png' });
    return page.evaluate(async dataUrl => {
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const background = [pixels[0], pixels[1], pixels[2]];
      let contrasting = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        if (Math.max(...background.map((value, channel) => pixels[index + channel] - value)) > 8) contrasting++;
      }
      return contrasting;
    }, `data:image/png;base64,${screenshot.toString('base64')}`);
  }
  const started = await contrastingPixels(region(485, 636), 'started-upper-stitching');
  const unstarted = await contrastingPixels(region(640, 813), 'unstarted-lower-letters');
  expect(started, 'The opening should visibly stitch the upper lettering').toBeGreaterThan(10);
  expect(unstarted, 'No bright stroke-cap dots should appear before the lower letters start').toBe(0);
});

test('changing Reduce Motion during the opening immediately unlocks the page', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('html')).not.toHaveClass(/intro-pending/, { timeout: 3_000 });
  await expect(page.locator('#hero-hat')).toHaveCSS('opacity', '1');
  await page.getByRole('link', { name: 'Photos', exact: true }).click();
  await expect(page).toHaveURL(/#worn$/);
  await expect(page.getByRole('heading', { name: 'Out in the world.' })).toBeFocused();
  await expect(page.locator('.worn-lead')).toHaveCSS('opacity', '1');
  const canvas = await spinReady(page);
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter(animation => {
    const timing = animation.effect?.getComputedTiming();
    return animation.playState === 'running' && timing?.iterations === Infinity;
  }).length)).toBe(0);
  const front = await canvasImage(canvas);
  await canvas.press('ArrowRight');
  await expect.poll(() => canvasImage(canvas)).not.toBe(front);
  await page.getByRole('button', { name: /^Open bag/ }).click();
  await expect(bag(page)).toBeVisible();
  await page.getByRole('button', { name: 'Close bag', exact: true }).click();
  await expect(bag(page)).not.toBeVisible({ timeout: 1_000 });
});

test('Skip intro and Escape both bypass the opening and leave shopping usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  for (const method of ['button', 'keyboard']) {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const skip = page.getByRole('button', { name: 'Skip intro', exact: true });
    await expect(skip).toBeVisible();
    if (method === 'button') await skip.click();
    else await page.keyboard.press('Escape');
    await expect(page.locator('html')).not.toHaveClass(/intro-pending/, { timeout: 1_500 });
    await expect(skip).not.toBeVisible();
    await page.getByRole('button', { name: /^Open bag/ }).click();
    await expect(bag(page)).toBeVisible();
    await page.getByRole('button', { name: 'Close bag', exact: true }).click();
    await expect(bag(page)).not.toBeVisible();
  }
});

test('refresh from shop, photos, rotation and an open bag replays the opening at the top', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  for (const start of ['shop', 'photos', 'rotation', 'bag']) {
    await ready(page, start === 'photos' ? '/#worn' : '/#shop');
    if (start === 'rotation') await spinReady(page);
    if (start === 'bag') {
      await page.getByRole('button', { name: /^Open bag/ }).click();
      await expect(bag(page)).toBeVisible();
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expectOpeningAtTop(page);
    expect(await page.evaluate(() => ({ hash: location.hash, bagOpen: Boolean(history.state?.lnBag) }))).toEqual({ hash: '', bagOpen: false });
    await expect(bag(page)).not.toBeVisible();
    await page.getByRole('button', { name: 'Skip intro', exact: true }).click();
    await expect(page.locator('html')).not.toHaveClass(/intro-pending/);
    await page.getByRole('link', { name: 'Photos', exact: true }).click();
    await expect(page).toHaveURL(/#worn$/);
    await waitForScroll(page, 0);
    await expect(page.getByRole('heading', { name: 'Out in the world.' })).toBeFocused();
  }
});

test('refresh plays and finishes the opening while font requests are still pending', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  let releaseFonts;
  const fontsHeld = new Promise(resolve => { releaseFonts = resolve; });
  const fontPattern = /\.woff2(?:\?|$)/;
  let requests = 0;
  const holdFont = async route => {
    requests++;
    await fontsHeld;
    await route.continue();
  };
  await page.route(fontPattern, holdFont);
  let scrollBeforeFontLoad;
  try {
    // Keep the fonts cold: a completed first navigation can populate WebKit's
    // font cache and bypass interception on refresh.
    await page.goto('/#shop', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).not.toHaveClass(/intro-pending/);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(() => requests).toBeGreaterThan(0);
    await expectOpeningAtTop(page);
    await expect(page.locator('html')).not.toHaveClass(/intro-pending/, { timeout: 6_000 });
    const completion = await page.evaluate(() => ({
      elapsed: Number(document.querySelector('.hero').dataset.introElapsed),
      fonts: document.fonts.status,
      readyState: document.readyState,
      scrollY,
    }));
    expect(completion.elapsed, 'The normal opening must play rather than hit its loading fallback').toBeGreaterThanOrEqual(3_900);
    expect(completion.elapsed).toBeLessThan(6_000);
    expect(completion.fonts, 'The font requests are deliberately unresolved').toBe('loading');
    expect(completion.readyState, 'The opening must not depend on the window load/pageshow event').toBe('interactive');
    expect(Math.abs(completion.scrollY)).toBeLessThanOrEqual(1);
    await expect(page.getByRole('button', { name: 'Add to bag', exact: true })).toBeEnabled();
    await page.getByRole('link', { name: 'Photos', exact: true }).click();
    await expect(page).toHaveURL(/#worn$/);
    await expect.poll(() => page.locator('#worn').evaluate(element => element.getBoundingClientRect().top)).toBeLessThan(150);
    scrollBeforeFontLoad = await page.evaluate(() => scrollY);
    expect(scrollBeforeFontLoad).toBeGreaterThan(100);
  } finally {
    releaseFonts();
    await page.waitForLoadState('load');
    await page.unroute(fontPattern, holdFont);
  }
  await page.waitForTimeout(150);
  await expect(page).toHaveURL(/#worn$/);
  expect(await page.evaluate(() => scrollY), 'Late load/pageshow must not jump the user back to the top after they start browsing').toBeGreaterThan(scrollBeforeFontLoad * .5);
});

test('legacy navigation timing distinguishes refresh from deep links and Back', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    const getEntriesByType = performance.getEntriesByType.bind(performance);
    performance.getEntriesByType = type => type === 'navigation' ? [] : getEntriesByType(type);
  });
  await ready(page, '/#worn');
  await expect(page).toHaveURL(/#worn$/);
  expect(await page.locator('.hero').getAttribute('data-intro-elapsed'), 'A first photo deep link must still bypass the opening').toBe('0');
  await page.reload({ waitUntil: 'domcontentloaded' });
  expect(await page.evaluate(() => performance.navigation.type)).toBe(1);
  await expectOpeningAtTop(page);
  await page.getByRole('button', { name: 'Skip intro', exact: true }).click();
  await expect(page.locator('html')).not.toHaveClass(/intro-pending/);
  await page.getByRole('link', { name: 'Photos', exact: true }).click();
  await waitForScroll(page, 0);
  await page.route('**/history-fixture', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><title>History test</title><p>Another page</p>',
  }));
  await page.goto('/history-fixture');
  await page.goBack();
  await expect(page).toHaveURL(/#worn$/);
  await expect(page.locator('html')).not.toHaveClass(/intro-pending/);
  await waitForScroll(page, 0);
  await page.getByRole('link', { name: 'Shop', exact: true }).click();
  await expect(page).toHaveURL(/#shop$/);
  await expect(page.getByRole('heading', { name: 'Los Niños snapback', exact: true })).toBeFocused();
});

test('shopping and navigation remain usable when browser storage is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    const deny = () => { throw new DOMException('Storage is blocked', 'SecurityError'); };
    Object.defineProperty(window, 'sessionStorage', { get: deny });
    Object.defineProperty(window, 'localStorage', { get: deny });
  });
  await ready(page);
  await page.getByRole('button', { name: 'Add to bag', exact: true }).click();
  await expect(quantity(page)).toHaveText('1');
  await page.getByRole('button', { name: 'Increase quantity' }).click();
  await expect(quantity(page)).toHaveText('2');
  await page.getByRole('button', { name: 'Close bag', exact: true }).click();
  await expect(bag(page)).not.toBeVisible();
  await page.getByRole('button', { name: 'Open bag, 2 items', exact: true }).click();
  await expect(quantity(page)).toHaveText('2');
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('button', { name: /Explore the snapback/ }).click();
  await expect(bag(page)).not.toBeVisible();
  await page.getByRole('link', { name: 'Photos', exact: true }).click();
  await expect(page).toHaveURL(/#worn$/);
});

test('photo and shop navigation retain readable layout and browser history', async ({ page }) => {
  await ready(page);
  expect(await page.locator('.hero').getAttribute('data-intro-elapsed'), 'A direct shop link should bypass the opening').toBe('0');
  await page.getByRole('link', { name: 'Photos', exact: true }).click();
  await expect(page).toHaveURL(/#worn$/);
  await expect(page.getByRole('heading', { name: 'Out in the world.' })).toBeFocused();
  await expect.poll(() => page.locator('#worn').evaluate(element => Math.round(element.getBoundingClientRect().top))).toBeLessThan(150);
  for (const photo of await page.locator('.photo-slot img').all()) {
    await photo.scrollIntoViewIfNeeded();
    await expect.poll(() => photo.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    await expect(photo).toHaveAttribute('alt', /\S.+/);
    await noHorizontalOverflow(page);
  }
  await page.getByRole('link', { name: 'Shop', exact: true }).click();
  await expect(page).toHaveURL(/#shop$/);
  await expect(page.getByRole('heading', { name: 'Los Niños snapback', exact: true })).toBeFocused();
  await page.goBack();
  await expect(page).toHaveURL(/#worn$/);
  await expect(page.locator('html')).not.toHaveClass(/intro-pending/);
  await page.goForward();
  await expect(page).toHaveURL(/#shop$/);
  await expect(page.locator('html')).not.toHaveClass(/intro-pending/);
  await noHorizontalOverflow(page);
});

test('rotation loads near the viewer, responds to keyboard and keeps swipes inside the hat', async ({ page, browserName }, testInfo) => {
  await ready(page);
  const canvas = await spinReady(page);
  await expect(canvas).toHaveCSS('touch-action', 'pinch-zoom');
  await expect(canvas).toHaveAttribute('aria-describedby', 'orbit-instructions');
  await expect(page.locator('#orbit-instructions')).toContainText('arrow keys');
  const front = await canvasImage(canvas);
  await canvas.press('ArrowRight');
  await expect.poll(() => canvasImage(canvas)).not.toBe(front);
  await canvas.press('Home');
  await expect.poll(() => canvasImage(canvas)).toBe(front);
  await expect(page.locator('[data-orbit-status]')).toContainText('returned to the front');
  const dimensions = await canvas.evaluate(element => {
    // Layout may use fractional CSS pixels; clientWidth/clientHeight truncate
    // them and can falsely report a one-pixel excess at a 2× backing scale.
    const bounds = element.getBoundingClientRect();
    return { width: element.width, height: element.height, displayWidth: bounds.width, displayHeight: bounds.height };
  });
  expect(dimensions.width).toBeLessThanOrEqual(Math.ceil(dimensions.displayWidth * 2));
  expect(dimensions.height).toBeLessThanOrEqual(Math.ceil(dimensions.displayHeight * 2));
  await noHorizontalOverflow(page);

  if (browserName === 'chromium' && testInfo.project.use.isMobile) {
    // CDP sends native touch input through Chromium's gesture handling. A
    // synthetic pointer event cannot verify that the browser avoids page pans.
    const session = await page.context().newCDPSession(page);
    const box = await canvas.boundingBox();
    const x = box.x + box.width * .65, y = box.y + box.height * .65;
    const scrollBefore = await page.evaluate(() => scrollY);
    async function swipe(startX, startY, deltaX, deltaY) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchStart', touchPoints: [{ x: startX, y: startY }],
      });
      for (let step = 1; step <= 8; step++) {
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove', touchPoints: [{ x: startX + deltaX * step / 8, y: startY + deltaY * step / 8 }],
        });
        await page.waitForTimeout(20);
      }
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(150);
    }
    // Include a mostly vertical diagonal: the accidental drift that used to
    // cancel the rotation and move the whole website under the finger.
    await swipe(x, y, -box.width * .25, -120);
    expect(Math.abs(await page.evaluate(() => scrollY) - scrollBefore), 'A diagonal hat swipe must not pan the page').toBeLessThanOrEqual(1);
    await expect.poll(() => canvasImage(canvas)).not.toBe(front);
    await swipe(x, y, 0, -120);
    expect(Math.abs(await page.evaluate(() => scrollY) - scrollBefore), 'A vertical finger drift inside the hat must not pan the page').toBeLessThanOrEqual(1);
    await swipe(8, y, 0, -120);
    await waitForScroll(page, scrollBefore);
    await session.detach();
  }
});

test('a quick swipe adds a restrained coast while a held release stops the hat', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await ready(page);
  const canvas = await spinReady(page);
  const box = await canvas.boundingBox();
  const response = await page.request.get('/assets/hat-spin/sequence.json');
  const frameCount = (await response.json()).frames.length;
  const readFrame = () => canvas.evaluate(element => Number(element.dataset.frame));
  const forwardDistance = (from, to) => (to - from + frameCount) % frameCount;

  async function drag(stepDelay, hold = 0) {
    await canvas.press('Home');
    await expect.poll(readFrame).toBe(0);
    const startX = box.x + box.width * .68, y = box.y + box.height * .5;
    await page.mouse.move(startX, y);
    await page.mouse.down();
    for (let step = 1; step <= 8; step++) {
      await page.waitForTimeout(stepDelay);
      await page.mouse.move(startX - box.width * .28 * step / 8, y);
    }
    if (hold) await page.waitForTimeout(hold);
    // Release immediately: measuring through browser round trips here can turn
    // a quick swipe into an intentional hold on a busy CI worker.
    await page.mouse.up();
  }

  // Measure the same drag's actual displacement with an intentional held
  // release. This gives a rendered baseline without delaying the fast release.
  await drag(12, 180);
  await canvas.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const dragged = await readFrame();
  expect(dragged, 'The drag itself must rotate the hat').not.toBe(0);
  await page.waitForTimeout(400);
  expect(await readFrame(), 'Holding the hat still before lifting should cancel momentum').toBe(dragged);

  await drag(110);
  await page.waitForTimeout(1_700);
  const slowCoast = forwardDistance(dragged, await readFrame());
  await drag(12);
  await page.waitForTimeout(1_700);
  const settled = await readFrame();
  const fastCoast = forwardDistance(dragged, settled);
  expect(fastCoast, 'A fast swipe should swivel farther than the same slow drag').toBeGreaterThan(slowCoast);
  expect(fastCoast, 'A quick release should visibly glide through several views').toBeGreaterThanOrEqual(2);
  expect(fastCoast, 'Momentum should stay below a third of a turn').toBeLessThan(frameCount / 3);
  await page.waitForTimeout(300);
  expect(await readFrame(), 'The hat should settle promptly instead of continuing to spin').toBe(settled);
});

test('dragging rotates the image and Reduce Motion stops momentum after release', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  const canvas = await spinReady(page);
  const front = await canvasImage(canvas);
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width * .72, box.y + box.height * .5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .28, box.y + box.height * .5, { steps: 8 });
  await page.mouse.up();
  // Pointer updates are intentionally drawn on the next display frame. Wait
  // for the final dragged view before checking that reduced motion stays still.
  await canvas.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect.poll(() => canvasImage(canvas)).not.toBe(front);
  const released = await canvasImage(canvas);
  await page.waitForTimeout(250);
  expect(await canvasImage(canvas), 'Reduce Motion should not continue spinning after the drag').toBe(released);
  await canvas.press('Home');
  await expect.poll(() => canvasImage(canvas)).toBe(front);
  // Also honour a preference changed while the hat is already coasting.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.mouse.move(box.x + box.width * .72, box.y + box.height * .5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .28, box.y + box.height * .5, { steps: 8 });
  await page.mouse.up();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(50);
  const motionDisabled = await canvasImage(canvas);
  await page.waitForTimeout(300);
  expect(await canvasImage(canvas), 'Enabling Reduce Motion should stop an existing coast').toBe(motionDisabled);
  // These mouse inputs do not claim to emulate physical iOS scroll physics.
});

test('bag quantities, boundaries, removal and reload persistence work', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Add to bag', exact: true }).click();
  await expect(quantity(page)).toHaveText('1');
  await expect(page.getByRole('button', { name: 'Decrease quantity' })).toBeDisabled();
  await page.getByRole('button', { name: 'Increase quantity' }).click();
  await expect(quantity(page)).toHaveText('2');
  await page.getByRole('button', { name: 'Decrease quantity' }).click();
  await expect(quantity(page)).toHaveText('1');
  for (let count = 1; count < 10; count++) {
    await page.getByRole('button', { name: 'Increase quantity' }).click();
  }
  await expect(quantity(page)).toHaveText('10');
  await expect(page.getByRole('button', { name: 'Increase quantity' })).toBeDisabled();
  await expect(bag(page).getByText('Maximum quantity: 10.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close bag', exact: true }).click();
  await expect(bag(page)).not.toBeVisible();
  // A restored quantity should survive a document reload in the same tab.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(page.locator('html')).not.toHaveClass(/intro-pending/);
  expect(await page.locator('.hero').getAttribute('data-intro-elapsed'), 'Reduced-motion refresh should show the completed hat without replaying').toBe('0');
  await page.getByRole('button', { name: 'Open bag, 10 items', exact: true }).click();
  await expect(quantity(page)).toHaveText('10');
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(bag(page).getByText('Your bag is empty.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Explore the snapback/ })).toBeFocused();
  await page.getByRole('button', { name: /Explore the snapback/ }).click();
  await expect(bag(page)).not.toBeVisible();
  await expect(page).toHaveURL(/#shop$/);
  await expect(page.getByRole('button', { name: 'Open bag, 0 items', exact: true })).toBeVisible();
});

test('bag traps focus and Back, Forward and Escape restore the scroll position', async ({ page }) => {
  await page.addInitScript(() => {
    // Browser scroll alignment may settle between the test's scroll command and
    // the actual click. Observe the opening position before the app handles it,
    // independently of the bag's history state or fixed-body offset.
    window.addEventListener('click', event => {
      if (event.target instanceof Element && event.target.closest('[data-bag-open]')) {
        window.__bagScrollAtClick = window.scrollY;
      }
    }, { capture: true });
  });
  await ready(page, '/#worn');
  await page.locator('.worn-pair').scrollIntoViewIfNeeded();
  const opener = page.getByRole('button', { name: /^Open bag/ });
  await opener.click();
  const scrollPosition = await page.evaluate(() => window.__bagScrollAtClick);
  expect(scrollPosition).toBeGreaterThan(100);
  await expect(page.getByRole('button', { name: 'Close bag', exact: true })).toBeFocused();
  for (let index = 0; index < 6; index++) {
    await page.keyboard.press('Tab');
    // Native dialogs may tab through browser chrome (reported as body), but
    // must never land on an interactive element behind the modal.
    const onBody = await page.evaluate(() => document.activeElement === document.body);
    if (onBody) {
      await page.keyboard.press('Tab');
      expect(await bag(page).evaluate(dialog => dialog.contains(document.activeElement))).toBe(true);
    } else {
      expect(await bag(page).evaluate(dialog => dialog.contains(document.activeElement))).toBe(true);
    }
  }
  await page.locator('[data-add-to-bag]').evaluate(button => button.focus());
  expect(await bag(page).evaluate(dialog => dialog.contains(document.activeElement) || document.activeElement === document.body)).toBe(true);
  await expect(page.locator('body')).toHaveCSS('position', 'fixed');
  await page.goBack();
  await expect(bag(page)).not.toBeVisible();
  await expect(opener).toBeFocused();
  await expect.poll(() => page.evaluate(position => Math.abs(scrollY - position), scrollPosition), { message: 'Restore scroll after Back' }).toBeLessThanOrEqual(2);
  await page.goForward();
  await expect(bag(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(bag(page)).not.toBeVisible();
  await expect(opener).toBeFocused();
  await expect.poll(() => page.evaluate(position => Math.abs(scrollY - position), scrollPosition)).toBeLessThanOrEqual(2);
  const restored = await page.evaluate(() => getComputedStyle(document.body).position);
  expect(restored).not.toBe('fixed');
  await page.evaluate(() => scrollBy(0, 100));
  await waitForScroll(page, scrollPosition);
  await noHorizontalOverflow(page);
});

test('failed hero and photo downloads expose working retry controls', async ({ page }, testInfo) => {
  testInfo.annotations.push({ type: 'expected-network-failure', description: 'Deliberately aborted hero and photo images' });
  await page.route('**/assets/hat-front-logo-v1.webp*', route => {
    return route.request().url().includes('?retry=') ? route.continue() : route.abort();
  });
  await page.route('**/assets/photos/photo-34*.webp*', route => {
    return route.request().url().includes('?retry=') ? route.continue() : route.abort();
  });
  await ready(page, '/');
  const retry = page.getByRole('button', { name: 'Retry image', exact: true });
  await expect(retry).toBeVisible();
  await retry.click();
  await expect(retry).not.toBeVisible();
  await expect(page.locator('[data-view-status]')).toContainText('Hat image loaded');
  expect(await page.locator('#hero-hat').evaluate(image => image.naturalWidth > 0)).toBe(true);
  const slot = page.locator('.worn-pair .photo-slot').first();
  await slot.scrollIntoViewIfNeeded();
  await slot.getByRole('button', { name: 'Retry photo', exact: true }).click();
  await expect(slot.getByRole('button', { name: 'Retry photo', exact: true })).not.toBeVisible();
  expect(await slot.locator('img').evaluate(image => image.naturalWidth > 0)).toBe(true);
  await page.getByRole('button', { name: /^Open bag/ }).click();
  await expect(bag(page)).toBeVisible();
});

test('failed manifest and rotation images retain the poster and can be retried', async ({ page }, testInfo) => {
  testInfo.annotations.push({ type: 'expected-network-failure', description: 'Deliberately aborted 360 manifest and one rotation frame' });
  for (const failure of ['manifest', 'frame']) {
    await test.step(failure, async () => {
      // A same-address goto may stay in the existing document in Chromium.
      // Each outage needs a fresh loader and decoded-image cache.
      await page.goto('about:blank');
      const urlMatches = url => failure === 'manifest'
        ? url.pathname.endsWith('/hat-spin/sequence.json')
        : /\/hat-spin\/.*frame-015/.test(url.pathname);
      await page.route(urlMatches, route => route.abort());
      await ready(page);
      await page.locator('[data-orbit-stage]').scrollIntoViewIfNeeded();
      await expect(page.locator('[data-orbit-status]')).toContainText(/could not load|photo is shown/i);
      await expect(page.locator('.orbit-poster')).toBeVisible();
      await expect.poll(() => page.locator('.orbit-poster').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
      await expect(page.locator('[data-orbit-stage]')).not.toHaveAttribute('aria-busy', 'true');
      await expect(page.getByRole('progressbar')).toHaveCount(0);
      await page.unroute(urlMatches);
      await page.getByRole('button', { name: 'Retry rotation', exact: true }).click();
      await spinReady(page);
      await expect(page.getByRole('button', { name: 'Retry rotation', exact: true })).toHaveCount(0);
    });
  }
  await page.getByRole('link', { name: 'Shop', exact: true }).click();
  await page.getByRole('button', { name: 'Add to bag', exact: true }).click();
  await expect(quantity(page)).toHaveText('1');
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('product, photographs and native navigation remain accessible', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Los Niños snapback', exact: true })).toBeAttached();
    await expect(page.locator('#hero-hat')).toBeVisible();
    await expect(page.locator('#hero-hat')).toHaveCSS('opacity', '1');
    await expect(page.locator('.noscript-note')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add to bag', exact: true })).toHaveCount(0);
    await page.getByRole('link', { name: 'Photos', exact: true }).click();
    await expect(page).toHaveURL(/#worn$/);
    await expect(page.locator('.worn-lead img')).toBeVisible();
    await expect(page.locator('.worn-lead')).toHaveCSS('opacity', '1');
    await expect(page.locator('.orbit-poster')).toBeAttached();
    await noHorizontalOverflow(page);
  });
});
