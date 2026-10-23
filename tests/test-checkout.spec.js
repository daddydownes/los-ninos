const { test, expect } = require('@playwright/test');

const recipient = 'tester@example.com';
const catalog = {
  mode: 'preview', revision: 7, acceptingOrders: true,
  product: { id: 'navy-snapback', name: 'Navy snapback', priceCents: 5000, available: 100, maxQuantity: 1 },
  shipping: { country: 'AU', feeCents: 0 },
};

async function readyTest(page) {
  await page.route('**/api/admin/test-checkout', route => route.fulfill({ json: { catalog, recipient, missingSetup: [] } }));
  await page.goto('/checkout.html?test=1');
  await expect(page.getByRole('button', { name: 'Place test order & send emails' })).toBeEnabled();
}

async function fillAddress(page) {
  await page.getByLabel('Full name').fill('Test Customer');
  await page.getByLabel('Street address', { exact: true }).fill('1 Test Street');
  await page.getByLabel('Suburb or town').fill('Sydney');
  await page.getByLabel('State or territory', { exact: true }).selectOption('NSW');
  await page.getByLabel('Postcode', { exact: true }).fill('2000');
}

test('owner email test uses the approved inbox and retains its key after a failed submission', async ({ page }) => {
  let publicPosts = 0;
  const testPosts = [];
  await page.route('**/api/orders', route => { publicPosts++; return route.fulfill({ status: 500, json: { error: 'Unexpected public submission' } }); });
  await page.route('**/api/admin/test-orders', route => {
    testPosts.push(route.request().postDataJSON());
    return route.fulfill({ status: 503, json: { error: 'Temporary test service failure. Try again.' } });
  });
  await readyTest(page);
  await expect(page.getByLabel('Email address')).toHaveValue(recipient);
  await expect(page.getByLabel('Email address')).toHaveAttribute('readonly', '');
  await expect(page.locator('#preview-copy')).toContainText('No payment or shipment');
  await expect(page.locator('#total')).toContainText('50.00');
  await fillAddress(page);
  await page.getByRole('button', { name: 'Place test order & send emails' }).click();
  await expect(page.locator('#checkout-message')).toContainText('Temporary test service failure');
  await page.getByRole('button', { name: 'Place test order & send emails' }).click();
  await expect.poll(() => testPosts.length).toBe(2);
  expect(testPosts[0].customer.email).toBe(recipient);
  expect(testPosts[0].idempotencyKey).toBe(testPosts[1].idempotencyKey);
  expect(publicPosts).toBe(0);
});

test('test URL cannot enable purchase without owner access or complete setup', async ({ page }) => {
  let authorized = false;
  await page.route('**/api/admin/test-checkout', route => authorized
    ? route.fulfill({ json: { catalog: { ...catalog, acceptingOrders: false }, recipient, missingSetup: ['Connect the email provider'] } })
    : route.fulfill({ status: 403, json: { error: 'Owner access required' } }));
  await page.goto('/checkout.html?test=1');
  await expect(page.locator('#catalog-error')).toContainText('Sign in to the owner dashboard');
  await expect(page.locator('#submit-order')).toBeDisabled();
  authorized = true;
  await page.getByRole('button', { name: 'Retry checkout' }).click();
  await expect(page.locator('#checkout-message')).toContainText('Connect the email provider');
  await expect(page.locator('#submit-order')).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Owner dashboard' })).toBeVisible();
});

test('ordinary preview still uses the public checkout without email-test capabilities', async ({ page }) => {
  let ownerRequests = 0;
  await page.route('**/api/admin/**', route => { ownerRequests++; return route.fulfill({ status: 403, json: { error: 'Denied' } }); });
  await page.route('**/api/catalog', route => route.fulfill({ json: catalog }));
  await page.goto('/checkout.html');
  await expect(page.getByRole('button', { name: 'Create test order', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Email address')).toBeEditable();
  await expect(page.locator('#email-help')).toContainText('No email will be sent');
  expect(ownerRequests).toBe(0);
});

test('email-test receipt displays configured details while clearly forbidding payment', async ({ page }) => {
  await page.route('**/api/orders/test-order', route => route.fulfill({ json: { order: {
    id: 'test-order', reference: 'TEST-123', preview: true, testDelivery: true, status: 'awaiting_payment',
    createdAt: '2026-10-24T00:00:00Z', productName: 'Navy snapback', quantity: 1,
    unitPriceCents: 5000, shippingCents: 0, totalCents: 5000,
    customer: { name: 'Test Customer', email: recipient },
    shippingAddress: { line1: '1 Test Street', suburb: 'Sydney', state: 'NSW', postcode: '2000', country: 'AU' },
    bank: { accountName: 'Example Test Account', bsb: '000000', accountNumber: '12345678' },
  } } }));
  await page.goto('/order.html#id=test-order&token=test-only-token');
  await expect(page.locator('#order-content')).toBeVisible();
  await expect(page.locator('#preview-copy')).toContainText('Emails go only to the approved test inbox');
  await expect(page.locator('#bank-name')).toHaveText('Example Test Account');
  await expect(page.locator('#payment-total')).toHaveText('No payment due');
  await expect(page.locator('#copy-account')).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Owner dashboard' })).toBeVisible();
});
