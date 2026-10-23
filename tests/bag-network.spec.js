const { test, expect } = require('@playwright/test');

const catalog = {
  mode: 'preview', acceptingOrders: true,
  product: { id: 'navy-snapback', priceCents: 5000, available: 100, maxQuantity: 1 },
  shipping: { country: 'AU', feeCents: 0 },
};

async function enableCheckout(page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // The regression server intentionally builds a static preview. Turn on the
  // production entry point without needing a real order database in UI tests.
  await page.route(url => url.pathname === '/', async route => {
    const response = await route.fetch();
    const html = (await response.text()).replace('<head>', '<head><meta name="los-ninos-commerce" content="enabled">');
    await route.fulfill({ response, body: html });
  });
}

test('bag checkout recovers from a failed request without reloading the storefront', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await enableCheckout(page);
  let connected = false;
  await page.route('**/api/catalog', route => connected
    ? route.fulfill({ json: catalog })
    : route.abort());
  await page.goto('/#shop');
  await page.getByRole('button', { name: 'Add to bag', exact: true }).click();
  const retry = page.getByRole('button', { name: 'Retry checkout', exact: true });
  await expect(retry).toBeEnabled();
  await expect(page.locator('.journey-bag-checkout-note')).toContainText('Check your connection');
  connected = true;
  await retry.click();
  await expect(page.getByRole('button', { name: 'Preview checkout', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Increase quantity', exact: true })).toBeDisabled();
  await expect(page.locator('.journey-bag-number')).toHaveText('1');
  expect(errors).toEqual([]);
});

test('a stalled checkout request times out and retries when the connection returns', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await enableCheckout(page);
  await page.clock.install();
  let stalled, connected = false;
  await page.route('**/api/catalog', route => {
    if (connected) return route.fulfill({ json: catalog });
    stalled = route;
  });
  await page.goto('/#shop');
  await page.getByRole('button', { name: 'Add to bag', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Loading checkout…', exact: true })).toBeDisabled();
  await expect.poll(() => Boolean(stalled)).toBe(true);
  await page.clock.fastForward(12_100);
  await expect(page.getByRole('button', { name: 'Retry checkout', exact: true })).toBeEnabled();
  await stalled.abort().catch(() => {});
  connected = true;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByRole('button', { name: 'Preview checkout', exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
});
