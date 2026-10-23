const { test, expect } = require('@playwright/test');

const updatedAt = '2026-10-24T00:00:00.000Z';
function order(overrides = {}) {
  return {
    id: 'test-order-1', reference: 'LN-TEST-001', preview: true,
    status: 'awaiting_payment', createdAt: updatedAt, updatedAt,
    quantity: 1, unitPriceCents: 5000, totalCents: 5000, shippingCents: 0,
    customer: { name: 'Test Customer', email: 'test@example.com' },
    shippingAddress: { line1: '1 Test Street', suburb: 'Sydney', state: 'NSW', postcode: '2000', country: 'AU' },
    bank: {}, emails: [], history: [], ...overrides,
  };
}

async function dashboard(page, orders, { testCheckout = { enabled: false, recipient: null }, onDelete } = {}) {
  await page.route('**/api/catalog', route => route.fulfill({ json: { mode: 'preview' } }));
  await page.route('**/api/admin/settings', route => route.fulfill({ json: { settings: {}, missingSetup: [], testCheckout } }));
  await page.route('**/api/admin/orders**', async route => {
    const request = route.request();
    if (request.method() === 'DELETE') return onDelete(route);
    const path = new URL(request.url()).pathname;
    if (path === '/api/admin/orders') return route.fulfill({ json: { orders } });
    const selected = orders.find(item => path === `/api/admin/orders/${item.id}`);
    return route.fulfill({ status: selected ? 200 : 404, json: selected ? { order: selected } : { error: 'Order not found.' } });
  });
  await page.goto('/admin.html');
}

test('test deletion requires confirmation, disables while pending and removes only the selected test order', async ({ page }) => {
  const orders = [order(), order({ id: 'live-1', reference: 'LN-LIVE-001', preview: false })];
  const requests = [];
  let pending;
  await dashboard(page, orders, { onDelete: route => { requests.push(route.request()); pending = route; } });
  await page.getByRole('button', { name: /LN-TEST-001/ }).click();
  await page.getByRole('button', { name: 'Delete test order', exact: true }).click();
  await page.getByRole('button', { name: 'Delete this test order', exact: true }).click();
  expect(requests).toHaveLength(0);
  await page.getByRole('button', { name: 'Keep order', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: /finished testing/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Delete test order', exact: true }).click();
  await page.getByRole('checkbox', { name: /finished testing/ }).check();
  await page.getByRole('button', { name: 'Delete this test order', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Deleting…', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Keep order', exact: true })).toBeDisabled();
  expect(requests).toHaveLength(1);
  expect(requests[0].postDataJSON()).toEqual({ updatedAt });
  expect(requests[0].headers()['x-requested-with']).toBe('LosNinos');
  orders.shift();
  await pending.fulfill({ json: { ok: true, deletedId: 'test-order-1' } });
  await expect(page.getByRole('heading', { name: 'Test order removed.' })).toBeVisible();
  await expect(page.getByRole('button', { name: /LN-TEST-001/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /LN-LIVE-001/ })).toBeVisible();
  await expect(page.locator('#order-count')).toHaveText('(1)');
});

test('live orders have no delete control; unavailable email tests stay disabled', async ({ page }) => {
  await dashboard(page, [order({ preview: false })]);
  await page.getByRole('button', { name: /LN-TEST-001/ }).click();
  await expect(page.getByRole('button', { name: 'Delete test order', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Test purchase', exact: true })).toBeDisabled();
  await expect(page.locator('#test-purchase-help')).toContainText('once the test inbox and sender are connected');
});

test('rejected deletion retains the order and confirmation for an explicit retry', async ({ page }) => {
  let deletes = 0;
  await dashboard(page, [order()], { onDelete: route => { deletes++; return route.fulfill({ status: 409, json: { error: 'A test email is still sending. Try again shortly.' } }); } });
  await page.getByRole('button', { name: /LN-TEST-001/ }).click();
  await page.getByRole('button', { name: 'Delete test order', exact: true }).click();
  await page.getByRole('checkbox', { name: /finished testing/ }).check();
  await page.getByRole('button', { name: 'Delete this test order', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete this test order', exact: true })).toBeEnabled();
  await expect(page.locator('#admin-message')).toContainText('still sending');
  await expect(page.getByRole('checkbox', { name: /finished testing/ })).toBeChecked();
  await expect(page.getByRole('heading', { name: 'LN-TEST-001', exact: true })).toBeVisible();
  expect(deletes).toBe(1);
});

test('a stalled deletion times out without an automatic retry or a false success', async ({ page }) => {
  await page.clock.install();
  let deletes = 0, pending;
  await dashboard(page, [order()], { onDelete: route => { deletes++; pending = route; } });
  await page.getByRole('button', { name: /LN-TEST-001/ }).click();
  await page.getByRole('button', { name: 'Delete test order', exact: true }).click();
  await page.getByRole('checkbox', { name: /finished testing/ }).check();
  await page.getByRole('button', { name: 'Delete this test order', exact: true }).click();
  await expect.poll(() => Boolean(pending)).toBe(true);
  await page.clock.fastForward(15_100);
  await expect(page.getByRole('button', { name: 'Delete this test order', exact: true })).toBeEnabled();
  await expect(page.locator('#admin-message')).toContainText('connection took too long');
  await expect(page.getByRole('heading', { name: 'Test order removed.' })).toHaveCount(0);
  expect(deletes).toBe(1);
  await pending.abort().catch(() => {});
});

test('private email test setup names its inbox and opens the real test checkout', async ({ page }) => {
  await dashboard(page, [order({ testDelivery: true, testEmailRecipient: 'test@example.com' })], {
    testCheckout: { enabled: true, recipient: 'test@example.com' },
  });
  await expect(page.getByRole('button', { name: 'Test purchase', exact: true })).toBeEnabled();
  await expect(page.locator('#test-purchase-help')).toContainText('test@example.com');
  await page.getByRole('button', { name: /LN-TEST-001/ }).click();
  await expect(page.locator('#order-detail')).toContainText('Test emails go to test@example.com');
  await page.getByRole('button', { name: 'Confirm test payment', exact: true }).click();
  await expect(page.locator('#order-action')).toContainText('email will go to the test inbox');
  await expect(page.locator('#order-action')).not.toContainText('No customer email will be sent.');
  await page.getByRole('button', { name: 'Test purchase', exact: true }).click();
  await expect(page).toHaveURL(/\/checkout\.html\?test=1$/);
});
