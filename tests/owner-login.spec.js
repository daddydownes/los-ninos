const { test, expect } = require('@playwright/test');

test('owner sign-in handles email, resend cooldown, invalid code and a successful redirect', async ({ page }) => {
  const sent = [], codes = [];
  await page.route('**/api/owner-auth/request', route => {
    sent.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true, message: 'If this email has owner access, a sign-in code is on its way.' } });
  });
  await page.route('**/api/owner-auth/verify', route => {
    codes.push(route.request().postDataJSON());
    expect(route.request().headers()['x-requested-with']).toBe('LosNinos');
    return route.fulfill(codes.length === 1 ? { status: 400, json: { error: 'That code is invalid or expired. Request a new code if needed.' } } : { json: { ok: true } });
  });
  await page.route('**/admin', route => route.fulfill({ contentType: 'text/html', body: '<h1>Your orders.</h1>' }));
  await page.goto('/owner-login.html');
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await page.getByLabel('Owner email').fill('owner@example.test');
  await page.getByRole('button', { name: 'Send sign-in code' }).click();
  await expect(page.getByLabel('Six-digit code')).toBeFocused();
  await expect(page.locator('#resend-code')).toBeDisabled();
  await expect(page.locator('#login-message')).toContainText('If this email');
  expect(sent).toEqual([{ email: 'owner@example.test' }]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel('Six-digit code').fill('123456');
  await page.getByRole('button', { name: 'Open dashboard' }).click();
  await expect(page.locator('#login-message')).toContainText('invalid or expired');
  await expect(page.getByRole('button', { name: 'Open dashboard' })).toBeEnabled();
  await page.getByLabel('Six-digit code').fill('654321');
  await page.getByRole('button', { name: 'Open dashboard' }).click();
  await expect(page).toHaveURL(/\/admin$/); await expect(page.getByRole('heading')).toHaveText('Your orders.');
});

test('a stalled code request times out without retry or a false delivery claim', async ({ page }) => {
  await page.clock.install(); let calls = 0;
  await page.route('**/api/owner-auth/request', () => { calls++; });
  await page.goto('/owner-login.html');
  await page.getByLabel('Owner email').fill('owner@example.test');
  await page.getByRole('button', { name: 'Send sign-in code' }).click();
  await expect.poll(() => calls).toBe(1);
  await expect(page.getByRole('button', { name: 'Send sign-in code' })).toBeDisabled();
  await page.clock.fastForward(15100);
  await expect(page.locator('#login-message')).toContainText('could not connect');
  await expect(page.getByRole('button', { name: 'Send sign-in code' })).toBeEnabled();
  await expect(page.locator('#code-form')).toBeHidden(); expect(calls).toBe(1);
});

test('email-auth dashboard can sign out and provides a sign-in link after expiry', async ({ page }) => {
  await page.route('**/api/catalog', route => route.fulfill({ json: { mode: 'live' } }));
  await page.route('**/api/admin/settings', route => route.fulfill({ json: { ownerAuthMode: 'email', testCheckout: { enabled: false } } }));
  await page.route('**/api/admin/orders**', route => route.fulfill({ status: 403, json: { error: 'Owner sign-in is required.' } }));
  await page.route('**/api/owner-auth/logout', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/owner-login', route => route.fulfill({ contentType: 'text/html', body: '<h1>Welcome back.</h1>' }));
  await page.goto('/admin.html');
  await expect(page.getByRole('link', { name: 'Sign in again' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/owner-login$/);
});
