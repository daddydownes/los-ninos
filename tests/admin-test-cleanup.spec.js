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
  await expect(page.locator('#admin-message')).toContainText('Test order deleted.');
  await expect(page.getByRole('button', { name: /LN-TEST-001/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /LN-LIVE-001/ })).toBeVisible();
  await expect(page.locator('#order-count')).toHaveText('(1)');
});

test('live orders have no delete control; unavailable email tests stay disabled', async ({ page }) => {
  await dashboard(page, [order({ preview: false })]);
  await page.getByRole('button', { name: /LN-TEST-001/ }).click();
  await expect(page.getByRole('button', { name: 'Delete test order', exact: true })).toHaveCount(0);
  await page.locator('.admin-tools > summary').click();
  await expect(page.getByRole('button', { name: 'Test purchase', exact: true })).toBeDisabled();
  await expect(page.locator('#test-purchase-help')).toContainText('once the test inbox and sender are connected');
});

test('dispatch confirmation requires handover but no tracking number and sends no tracking in the request', async ({ page }) => {
  const orders = [order({ status: 'paid', preview: false })];
  await dashboard(page, orders);
  const submitted = [];
  await page.route('**/api/admin/orders/*/status', route => {
    submitted.push(route.request().postDataJSON());
    orders[0] = { ...orders[0], status: 'shipped', trackingNumber: '' };
    return route.fulfill({ json: { order: orders[0] } });
  });
  await page.getByRole('button', { name: /LN-TEST-001/ }).click();
  await page.getByRole('button', { name: 'Mark as shipped', exact: true }).click();
  await expect(page.getByLabel('Tracking number', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Mark shipped & send confirmation', exact: true }).click();
  expect(submitted).toHaveLength(0);
  await page.getByRole('checkbox', { name: 'I have handed this parcel over for delivery.' }).check();
  await page.getByRole('button', { name: 'Mark shipped & send confirmation', exact: true }).click();
  await expect(page.locator('#admin-message')).toContainText('dispatch confirmation has been queued');
  expect(submitted).toEqual([{ status: 'shipped', note: '', expectedUpdatedAt: updatedAt }]);
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
  await page.locator('.admin-tools > summary').click();
  await expect(page.getByRole('button', { name: 'Test purchase', exact: true })).toBeEnabled();
  await expect(page.locator('#test-purchase-help')).toContainText('test@example.com');
  await page.locator('.admin-tools > summary').click();
  await page.getByRole('button', { name: /LN-TEST-001/ }).click();
  await expect(page.locator('#order-detail')).toContainText('Test emails go to test@example.com');
  await page.getByRole('button', { name: 'Confirm test payment', exact: true }).click();
  await expect(page.locator('#order-action')).toContainText('email will go to the test inbox');
  await expect(page.locator('#order-action')).not.toContainText('No customer email will be sent.');
  await page.locator('.admin-tools > summary').click();
  await page.getByRole('button', { name: 'Test purchase', exact: true }).click();
  await expect(page).toHaveURL(/\/checkout\.html\?test=1$/);
});

test('email problems remain visible and mobile detail has a clear return to orders', async ({ page }) => {
  const orders = [order({ emails: [{ kind: 'awaiting_payment', status: 'bounced' }], preview: false })];
  await dashboard(page, orders);
  await expect(page.locator('.admin-order-card')).toContainText('Email needs attention');
  await page.getByRole('button', { name: /LN-TEST-001/ }).click();
  await expect(page.locator('.admin-detail-disclosure').filter({ has: page.locator('.admin-email-list') })).toHaveAttribute('open', '');
  await expect(page.locator('.admin-email-item')).toContainText('Bounced');
  await expect(page.getByRole('button', { name: 'Confirm payment', exact: true })).toBeVisible();
  if (page.viewportSize().width <= 800) {
    await expect(page.locator('#order-list-region')).toBeHidden();
    await page.getByRole('button', { name: '← Back to orders', exact: true }).click();
    await expect(page.locator('#order-list-region')).toBeVisible();
    await expect(page.locator('#order-detail')).toBeHidden();
  } else {
    orders[0].emails[0].status = 'delivered';
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(page.locator('.admin-email-item')).toContainText('Delivered');
    await expect(page.locator('.admin-order-card')).not.toContainText('Email needs attention');
  }
});

test('simple owner workspace filters orders and keeps list and detail separate on every screen', async ({page}) => {
  const orders = [order({id:'unpaid',reference:'001',preview:false}), order({id:'paid',reference:'002',status:'paid',preview:false}), order({id:'shipped',reference:'003',status:'shipped',preview:false})];
  await page.route('**/api/catalog', route => route.fulfill({json:{mode:'live'}}));
  await page.route('**/api/admin/settings', route => route.fulfill({json:{settingsEditable:false,ownerAuthMode:'email',testCheckout:{enabled:false}}}));
  await page.route('**/api/admin/orders**', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/admin/orders') {
      const filter = url.searchParams.get('status');
      return route.fulfill({json:{orders:orders.filter(o => filter === 'active' ? ['awaiting_payment','paid'].includes(o.status) : !filter || filter === o.status)}});
    }
    return route.fulfill({json:{order:orders.find(o => url.pathname.endsWith('/' + o.id))}});
  });
  await page.goto('/admin.html');
  await expect(page.locator('.admin-order-card')).toHaveCount(2);
  await expect(page.getByRole('button',{name:'Store settings',exact:true})).toBeHidden();
  await expect(page.locator('#order-detail')).toBeHidden();
  await page.getByRole('button',{name:'All orders',exact:true}).click();
  await expect(page.locator('.admin-order-card')).toHaveCount(3);
  await page.getByRole('button',{name:/003/}).click();
  await expect(page.locator('#order-list-region')).toBeHidden();
  await expect(page.getByRole('heading',{name:'003',exact:true})).toBeVisible();
  await page.getByText('Customer & delivery',{exact:true}).click();
  await expect(page.locator('address')).toContainText('1 Test Street');
  await page.getByRole('button',{name:'← Back to orders',exact:true}).click();
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await expect(page.locator('#order-list-region')).toBeVisible();
  await expect(page.locator('#order-detail')).toBeHidden();
  await page.getByRole('button',{name:'To do',exact:true}).click();
  await expect(page.locator('.admin-order-card')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('payment confirmation still requires the owner to check the bank before sending confirmation', async ({ page }) => {
  const orders = [order({ preview: false, unitPriceCents: 3000, shippingCents: 2500, quantity: 4, totalCents: 14500 })];
  await dashboard(page, orders);
  const submitted = [];
  await page.route('**/api/admin/orders/*/status', route => {
    submitted.push(route.request().postDataJSON());
    orders[0] = {...orders[0],status:'paid'};
    return route.fulfill({json:{order:orders[0]}});
  });
  await page.getByRole('button',{name:/LN-TEST-001/}).click();
  await page.getByRole('button',{name:'Confirm payment',exact:true}).click();
  await expect(page.locator('#order-action')).toContainText('$145.00 with reference LN-TEST-001');
  await page.getByRole('button',{name:'Mark paid & send confirmation',exact:true}).click();
  expect(submitted).toHaveLength(0);
  await page.getByRole('checkbox',{name:'I have checked the bank account and the full payment has arrived.'}).check();
  await page.getByRole('button',{name:'Mark paid & send confirmation',exact:true}).click();
  await expect(page.locator('#admin-message')).toContainText('Payment confirmed.');
  await expect(page.getByRole('button',{name:'Mark as shipped',exact:true})).toBeVisible();
  expect(submitted).toEqual([{status:'paid',note:'',expectedUpdatedAt:updatedAt}]);
});
