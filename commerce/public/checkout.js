import { api, money, text, announce } from './commerce.js';

const $ = (id) => document.getElementById(id);
const form = $('checkout-form');
const quantityInput = $('quantity');
const submitButton = $('submit-order');
const reviewButton = $('review-order');
const checkoutParams = new URLSearchParams(location.search);
const testCheckout = checkoutParams.get('test') === '1';
let testRecipient = null;
let testSetupMissing = [];
let catalog;
let submitting = false;
let retry = null;
let quantityWasAdjusted = false;
let completed = false;
let deletedCheckout = false;
let reviewedSignature = null;
const pendingKey = testCheckout ? 'ln-checkout-email-test-pending-v1' : 'ln-checkout-pending-v1';
$('test-dashboard-link').hidden = !testCheckout;

async function fetchCatalog() {
  if (!testCheckout) return api('/api/catalog');
  const result = await api('/api/admin/test-checkout');
  testRecipient = typeof result.recipient === 'string' ? result.recipient : null;
  testSetupMissing = Array.isArray(result.missingSetup) ? result.missingSetup : [];
  if (!result.catalog || result.catalog.mode !== 'preview') throw new Error('The owner test checkout is not available. Open it from the dashboard.');
  return result.catalog;
}

// Keep the same key after network errors or reloads without storing the address.
try { retry = JSON.parse(sessionStorage.getItem(pendingKey) || 'null'); } catch (_) {}

function quantityLimit() {
  const maximum = Number.isInteger(catalog?.product?.maxQuantity) ? catalog.product.maxQuantity : 10;
  const available = catalog?.product?.available;
  return Math.max(0, Math.min(maximum, typeof available === 'number' ? available : maximum));
}

function getQuantity() {
  const value = Number(quantityInput.value);
  return Number.isInteger(value) && value >= 1 ? value : 1;
}

function checkoutPayload() {
  const read = (id) => $(id).value.trim();
  return {
    catalogRevision: catalog.revision,
    quantity: getQuantity(),
    shippingQuoteCents: shippingForQuantity(getQuantity()),
    customer: { name: read('customer-name'), email: read('customer-email'), phone: read('customer-phone') },
    shippingAddress: { line1: read('address-line1'), line2: read('address-line2'), suburb: read('address-suburb'), state: read('address-state'), postcode: read('address-postcode'), country: 'AU' },
  };
}

function shippingForQuantity(quantity) {
  const shipping = catalog.shipping;
  return Number.isInteger(shipping.tierFromQuantity) && Number.isInteger(shipping.tierFeeCents) && quantity >= shipping.tierFromQuantity
    ? shipping.tierFeeCents : shipping.feeCents;
}

function invalidateReview() {
  const wasReviewed = reviewedSignature !== null;
  reviewedSignature = null;
  if (catalog) updateSummary();
  if (wasReviewed) announce($('checkout-message'), 'Your details changed. Review shipping and your total again before placing the order.');
}

function renderTotal(value, label) {
  const total = $('total');
  total.setAttribute('aria-label', `${label}: ${value} Australian dollars`);
  // Typing an address must not keep replaying the price. Animate only a change
  // in the displayed amount, using the actual final amount throughout.
  if (total.dataset.value === value) return;
  total.dataset.value = value;
  total.dataset.amount = String(value.startsWith('$'));
  total.replaceChildren(...Array.from(value, (character, index) => {
    const span = document.createElement('span');
    span.className = 'checkout-price-character';
    span.textContent = character;
    span.setAttribute('aria-hidden', 'true');
    span.style.setProperty('--character-delay', `${index * 35}ms`);
    return span;
  }));
}

function updateSummary() {
  if (!catalog) return;
  const quantity = getQuantity();
  const unit = catalog.product.priceCents;
  const shipping = shippingForQuantity(quantity);
  const reviewed = reviewedSignature !== null;
  const ready = catalog.acceptingOrders === true && !deletedCheckout && quantityLimit() > 0 && !submitting;
  text(document.querySelector('.product-caption'), typeof unit === 'number' ? `${money(unit)} each · Adjustable fit` : 'Adjustable fit');
  text($('subtotal-label'), quantity === 1 ? 'Hat subtotal' : `Hat subtotal · ${quantity} hats`);
  text($('subtotal'), money(typeof unit === 'number' ? unit * quantity : null));
  text($('shipping-cost'), reviewed ? shipping === 0 ? 'Free' : money(shipping, 'To be determined') : '');
  text($('total-label'), reviewed ? 'Total' : 'Subtotal');
  renderTotal(money(typeof unit === 'number' && (!reviewed || typeof shipping === 'number') ? unit * quantity + (reviewed ? shipping : 0) : null, typeof unit === 'number' ? 'Pending shipping' : 'To be set'), reviewed ? 'Total' : 'Subtotal');
  text($('summary-heading'), reviewed ? 'Review your order' : 'Your order');
  $('shipping-basis').hidden = !reviewed;
  $('shipping-line').hidden = !reviewed;
  $('summary-breakdown').hidden = !reviewed;
  $('shipping-review-note').hidden = reviewed;
  $('review-actions').hidden = !reviewed;
  reviewButton.hidden = reviewed;
  reviewButton.disabled = !ready;
  submitButton.disabled = !ready || !reviewed;
  $('edit-details').disabled = submitting;
  $('quantity-minus').disabled = submitting || quantity <= 1;
  $('quantity-plus').disabled = submitting || quantity >= quantityLimit();
  quantityInput.disabled = submitting || quantityLimit() === 0;
}

function renderCatalog() {
  const preview = catalog.mode === 'preview';
  const limit = quantityLimit();
  text($('product-name'), catalog.product.name || 'Navy snapback');
  quantityInput.max = Math.max(1, limit);
  if (getQuantity() > limit && limit > 0) quantityWasAdjusted = true;
  quantityInput.value = Math.min(Math.max(1, getQuantity()), Math.max(1, limit));
  $('preview-banner').hidden = !preview;
  if (testCheckout) {
    text($('preview-label'), 'Email test');
    text($('preview-copy'), 'This is a test purchase. No payment or shipment is required.');
    text($('checkout-intro-copy'), 'Try the complete purchase flow. Test emails go only to the approved test inbox.');
    text($('email-help'), testRecipient ? `All test emails, including owner notifications, go to ${testRecipient}.` : 'The approved test inbox will appear when setup is ready.');
    text($('checkout-fineprint'), 'Creates a removable test order with separate test stock. Do not send a bank transfer.');
    $('customer-email').readOnly = true;
    $('customer-email').value = testRecipient || '';
  } else if (preview) {
    text($('checkout-intro-copy'), 'Try the checkout with test details. No money will be taken and no emails will be sent.');
    text($('email-help'), 'Use a test email address. No email will be sent in this preview.');
    text($('checkout-fineprint'), 'This creates a preview order only. Do not enter real customer details or send a bank transfer.');
  }
  const accepting = catalog.acceptingOrders === true && !deletedCheckout;
  form.setAttribute('aria-busy', String(submitting));
  form.querySelectorAll('input, select').forEach((input) => { input.disabled = submitting; });
  text(submitButton, submitting ? 'Saving your order…' : deletedCheckout ? 'Test order deleted' : !accepting ? testCheckout ? 'Test setup is not ready yet' : 'Orders are not open yet' : limit === 0 ? 'Sold out' : testCheckout ? 'Place test order & send emails' : preview ? 'Create test order' : 'Place order — pay by bank transfer');
  text(reviewButton, deletedCheckout ? 'Test order deleted' : !accepting ? testCheckout ? 'Test setup is not ready yet' : 'Orders are not open yet' : limit === 0 ? 'Sold out' : 'Review order');
  if (limit === 0) text($('stock-message'), 'This hat is currently sold out.');
  else text($('stock-message'), quantityWasAdjusted ? `Your quantity was adjusted to ${getQuantity()}. Up to ${limit} ${limit === 1 ? 'hat can' : 'hats can'} currently be ordered.` : `Up to ${limit} ${limit === 1 ? 'hat' : 'hats'} per order.`);
  if (deletedCheckout) announce($('checkout-message'), 'This test order was deleted. Start a fresh checkout to test again.');
  else if (!accepting) announce($('checkout-message'), testCheckout ? `Finish the test setup in the owner dashboard. ${testSetupMissing.join('. ')}` : preview ? 'Preview ordering is not available in this environment yet.' : 'We’re getting the shop ready. Ordering will open once the final details are confirmed.');
  updateSummary();
}

const initialQuantity = Number(checkoutParams.get('quantity'));
quantityInput.value = Number.isInteger(initialQuantity) && initialQuantity > 0 ? Math.min(initialQuantity, 10) : 1;

$('quantity-minus').addEventListener('click', () => {
  quantityInput.value = Math.max(1, getQuantity() - 1);
  invalidateReview();
});
$('quantity-plus').addEventListener('click', () => {
  quantityInput.value = Math.min(quantityLimit(), getQuantity() + 1);
  invalidateReview();
});
quantityInput.addEventListener('input', invalidateReview);
quantityInput.addEventListener('change', () => {
  quantityInput.value = Math.min(Math.max(1, getQuantity()), Math.max(1, quantityLimit()));
  invalidateReview();
});
form.addEventListener('input', invalidateReview);
form.addEventListener('change', invalidateReview);
$('edit-details').addEventListener('click', () => {
  invalidateReview();
  $('address-line1').focus();
});

async function requestKey(payload) {
  // A refreshed quote must not create a duplicate after a lost success response.
  // Only a confirmed quote rejection clears this key below.
  const { catalogRevision: _catalogRevision, ...stablePayload } = payload;
  const encoded = new TextEncoder().encode(JSON.stringify(stablePayload));
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  const signature = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  if (!retry || retry.signature !== signature || typeof retry.key !== 'string') retry = { signature, key: crypto.randomUUID() };
  try { sessionStorage.setItem(pendingKey, JSON.stringify(retry)); } catch (_) {}
  return retry.key;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (submitting || deletedCheckout || !catalog?.acceptingOrders || !form.reportValidity()) return;
  const payload = checkoutPayload();
  if (!payload.customer.name || !payload.shippingAddress.line1 || !payload.shippingAddress.suburb) {
    announce($('checkout-message'), 'Please complete your name and shipping address.', true);
    return;
  }
  const signature = JSON.stringify(payload);
  if (reviewedSignature !== signature) {
    if (!Number.isSafeInteger(catalog.product.priceCents) || !Number.isSafeInteger(shippingForQuantity(payload.quantity))) {
      announce($('checkout-message'), 'The price or shipping charge is not ready yet. Please try again later.', true);
      return;
    }
    reviewedSignature = signature;
    renderCatalog();
    announce($('checkout-message'), 'Your shipping and full total are ready to review. No order has been placed yet.');
    $('summary-heading').focus({ preventScroll: true });
    $('order-summary').scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    return;
  }
  submitting = true;
  renderCatalog();
  announce($('checkout-message'), 'Saving your order…');
  try {
    const idempotencyKey = await requestKey(payload);
    const { order, token } = await api(testCheckout ? '/api/admin/test-orders' : '/api/orders', { method: 'POST', body: JSON.stringify({ ...payload, idempotencyKey }) });
    if (!order?.id || typeof token !== 'string') throw new Error('Your order response was incomplete. Please try again; the same request will be used to avoid a duplicate.');
    try { sessionStorage.setItem(`ln-order-token:${order.id}`, token); sessionStorage.removeItem(pendingKey); } catch (_) {}
    completed = true;
    const destination = new URL('order.html', location.href);
    destination.search = '';
    destination.hash = new URLSearchParams({ id: order.id, token }).toString();
    location.assign(destination.href);
  } catch (error) {
    let message = error.message || 'Your order could not be saved. Please try again.';
    if (error.data?.code === 'test_order_deleted') {
      // Stop this old form, but let a fresh checkout choose a new key. Keeping
      // the rejected key in storage would trap subsequent rehearsals in retries.
      deletedCheckout = true;
      retry = null;
      try { sessionStorage.removeItem(pendingKey); } catch (_) {}
      message = testCheckout ? 'This test order was deleted. Return to the owner dashboard and choose Test purchase to start again.' : 'This test order was deleted. Open a fresh checkout to test again.';
    } else if (error.status === 409) {
      reviewedSignature = null;
      if (error.data?.code === 'catalog_changed') {
        retry = null;
        try { sessionStorage.removeItem(pendingKey); } catch (_) {}
      }
      try {
        catalog = await fetchCatalog();
        if (error.data?.code === 'catalog_changed') message = 'Price or delivery options changed. Please review your order again before submitting.';
      } catch (_) {
        catalog.acceptingOrders = false;
        message = 'Shop details changed, but we couldn’t reload them. Please refresh this page before trying again.';
      }
    }
    submitting = false;
    renderCatalog();
    announce($('checkout-message'), message, true);
    $('checkout-message').scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
});

let loadingCatalog = false;
async function loadCatalog() {
  if (loadingCatalog) return;
  loadingCatalog = true;
  $('catalog-error').hidden = true;
  $('catalog-retry-wrap').hidden = true;
  submitButton.disabled = true;
  reviewButton.disabled = true;
  reviewedSignature = null;
  text(reviewButton, 'Loading checkout…');
  try {
    const result = await fetchCatalog();
    if (!result.product || !result.shipping) throw new Error('The shop is still being prepared. Please check back soon.');
    catalog = result;
    renderCatalog();
  } catch (error) {
    $('catalog-error').hidden = false;
    $('catalog-retry-wrap').hidden = false;
    announce($('catalog-error'), testCheckout && [401, 403].includes(error.status) ? 'Sign in to the owner dashboard, then choose Test purchase to open this checkout.' : error.message, true);
    text(reviewButton, 'Checkout unavailable');
  } finally {
    loadingCatalog = false;
  }
}
$('catalog-retry').addEventListener('click', loadCatalog);
loadCatalog();

// Returning from confirmation must not leave a cached form in its saving state.
window.addEventListener('pageshow', (event) => {
  if (event.persisted && catalog) {
    submitting = false;
    renderCatalog();
    if (completed && !deletedCheckout) announce($('checkout-message'), 'Your previous order was received. Submitting the same details again will reopen that order.');
  }
});
