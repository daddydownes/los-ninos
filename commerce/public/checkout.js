import { api, money, text, announce } from './commerce.js';
import './bag-state.js';

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
let completed = history.state?.lnCheckoutCompleted === true;
let deletedCheckout = false;
let reviewedSignature = null;
let attemptPayload = null;
let emptyBagOnReturn = false;
const bag = window.LosNinosBagState;
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
if (!retry || typeof retry.signature !== 'string' || typeof retry.key !== 'string') retry = null;
// Old pending records had no explicit flag. They must also retain their key.
if (retry && retry.pending === undefined) retry.pending = true;

function saveRetry() {
  try {
    if (retry) sessionStorage.setItem(pendingKey, JSON.stringify(retry));
    else sessionStorage.removeItem(pendingKey);
  } catch (_) {}
}

function rememberBagQuantity(quantity) {
  const url = new URL(location.href);
  url.searchParams.set('quantity', String(quantity));
  // A saved zero means this checkout's bag was emptied. Keep it on reload,
  // while fresh checkout links may still choose a quantity.
  try { history.replaceState({ ...history.state, lnCheckoutUsesBag: true }, '', url); } catch (_) {}
}

function restoreBagQuantity(savedQuantity) {
  if (testCheckout || completed || retry?.pending) return;
  const quantity = savedQuantity ?? bag.read().quantity;
  emptyBagOnReturn = quantity === 0;
  quantityInput.value = quantity;
  reviewedSignature = null;
  rememberBagQuantity(quantity);
}

function syncBagQuantity() {
  const quantity = Number(quantityInput.value);
  if (!testCheckout && !completed && !emptyBagOnReturn && !retry?.pending && catalog && Number.isInteger(quantity) && quantity >= 1 && quantity <= Math.min(10, quantityLimit())) {
    bag.setQuantity(quantity);
    rememberBagQuantity(quantity);
  }
}

function quantityLimit() {
  const maximum = Number.isInteger(catalog?.product?.maxQuantity) ? catalog.product.maxQuantity : 10;
  const available = catalog?.product?.available;
  return Math.max(0, Math.min(maximum, typeof available === 'number' ? available : maximum));
}

function getQuantity() {
  if (emptyBagOnReturn) return 0;
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
  syncBagQuantity();
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
  const recovering = retry?.pending === true;
  const unit = recovering && Number.isSafeInteger(retry.unitPriceCents) ? retry.unitPriceCents : catalog.product.priceCents;
  const shipping = recovering && Number.isSafeInteger(retry.shippingQuoteCents) ? retry.shippingQuoteCents : shippingForQuantity(quantity);
  const reviewed = reviewedSignature !== null;
  const ready = !completed && !emptyBagOnReturn && !deletedCheckout && !submitting && (recovering || (catalog.acceptingOrders === true && quantityLimit() > 0));
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
  $('edit-details').disabled = submitting || recovering || completed;
  $('quantity-minus').disabled = submitting || recovering || completed || quantity <= 1;
  $('quantity-plus').disabled = submitting || recovering || completed || emptyBagOnReturn || quantity >= quantityLimit();
  quantityInput.disabled = submitting || recovering || completed || emptyBagOnReturn || quantityLimit() === 0;
}

function renderCatalog() {
  const preview = catalog.mode === 'preview';
  const limit = quantityLimit();
  text($('product-name'), catalog.product.name || 'OG Snapback');
  quantityInput.max = Math.max(1, limit);
  if (!retry?.pending && !completed && !emptyBagOnReturn) {
    if (getQuantity() > limit && limit > 0) quantityWasAdjusted = true;
    quantityInput.value = Math.min(Math.max(1, getQuantity()), Math.max(1, limit));
    syncBagQuantity();
  }
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
  form.querySelectorAll('input, select').forEach((input) => { input.disabled = submitting || completed || Boolean(retry?.pending && attemptPayload); });
  text(submitButton, submitting ? retry?.pending ? 'Checking your order…' : 'Saving your order…' : completed ? 'Order already received' : retry?.pending ? 'Check previous order' : deletedCheckout ? 'Test order deleted' : !accepting ? testCheckout ? 'Test setup is not ready yet' : 'Orders are not open yet' : limit === 0 ? 'Sold out' : testCheckout ? 'Place test order & send emails' : preview ? 'Create test order' : 'Place order — pay by bank transfer');
  text(reviewButton, completed ? 'Order already received' : retry?.pending ? 'Check previous order' : deletedCheckout ? 'Test order deleted' : !accepting ? testCheckout ? 'Test setup is not ready yet' : 'Orders are not open yet' : limit === 0 ? 'Sold out' : 'Review order');
  if (limit === 0) text($('stock-message'), 'This hat is currently sold out.');
  else text($('stock-message'), quantityWasAdjusted ? `Your quantity was adjusted to ${getQuantity()} based on availability.` : '');
  $('stock-message').hidden = !$('stock-message').textContent;
  if (emptyBagOnReturn) {
    text(submitButton, 'Your bag is empty');
    text(reviewButton, 'Your bag is empty');
    announce($('checkout-message'), 'Your bag was emptied. Return to the collection to choose your hats.');
  } else if (completed) announce($('checkout-message'), 'Your order was received. Return to the collection to start a new bag.');
  else if (retry?.pending) announce($('checkout-message'), attemptPayload ? 'We are checking your previous order before allowing changes. Choose Check previous order to retry safely.' : 'A previous order still needs checking. Enter the same contact and delivery details, then choose Check previous order. We will reuse its request rather than create another order.');
  else if (deletedCheckout) announce($('checkout-message'), 'This test order was deleted. Start a fresh checkout to test again.');
  else if (!accepting) announce($('checkout-message'), testCheckout ? `Finish the test setup in the owner dashboard. ${testSetupMissing.join('. ')}` : preview ? 'Preview ordering is not available in this environment yet.' : 'We’re getting the shop ready. Ordering will open once the final details are confirmed.');
  updateSummary();
}

const initialQuantity = Number(checkoutParams.get('quantity'));
const navigation = performance.getEntriesByType('navigation')[0]?.type;
quantityInput.value = retry?.pending && Number.isInteger(retry.quantity) ? retry.quantity
  : Number.isInteger(initialQuantity) && initialQuantity > 0 ? Math.min(initialQuantity, 10) : 1;
if (navigation === 'back_forward') restoreBagQuantity();
else if (navigation === 'reload' && history.state?.lnCheckoutUsesBag === true) {
  // The URL was updated on every edit and restoration, even if browser storage
  // could not persist the shared bag across documents.
  restoreBagQuantity(Number.isInteger(initialQuantity) && initialQuantity >= 0 ? Math.min(initialQuantity, 10) : 0);
}

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
  // Capture the submitted bag before hashing yields to a newer storefront edit.
  const bagSnapshot = testCheckout || retry?.pending ? null : bag.read();
  const { catalogRevision: _catalogRevision, ...stablePayload } = payload;
  const encoded = new TextEncoder().encode(JSON.stringify(stablePayload));
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  const signature = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  if (retry?.pending && retry.signature !== signature) {
    const error = new Error('These details differ from your previous attempt. Enter the original details to check that order first. If you cannot recover them, contact the shop before placing another order.');
    error.code = 'pending_details_changed';
    throw error;
  }
  if (!retry || retry.signature !== signature) retry = { signature, key: crypto.randomUUID() };
  if (!retry.pending) {
    retry.quantity = payload.quantity;
    retry.shippingQuoteCents = payload.shippingQuoteCents;
    retry.catalogRevision = payload.catalogRevision;
    retry.unitPriceCents = catalog.product.priceCents;
    retry.bagSnapshot = bagSnapshot;
  }
  retry.pending = true;
  saveRetry();
  return retry.key;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (submitting || completed || emptyBagOnReturn || deletedCheckout || !catalog || (!retry?.pending && !catalog.acceptingOrders) || (!attemptPayload && !form.reportValidity())) return;
  const payload = retry?.pending && attemptPayload ? attemptPayload : checkoutPayload();
  if (retry?.pending) {
    // Only non-personal quote metadata is persisted. After a refresh the buyer
    // re-enters the original details, which must match the saved digest.
    if (Number.isInteger(retry.quantity)) payload.quantity = retry.quantity;
    if (Number.isSafeInteger(retry.shippingQuoteCents)) payload.shippingQuoteCents = retry.shippingQuoteCents;
    if (Number.isInteger(retry.catalogRevision)) payload.catalogRevision = retry.catalogRevision;
  }
  if (!payload.customer.name || !payload.shippingAddress.line1 || !payload.shippingAddress.suburb) {
    announce($('checkout-message'), 'Please complete your name and shipping address.', true);
    return;
  }
  const signature = JSON.stringify(payload);
  if (!retry?.pending && reviewedSignature !== signature) {
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
    attemptPayload = payload;
    const { order, token } = await api(testCheckout ? '/api/admin/test-orders' : '/api/orders', { method: 'POST', body: JSON.stringify({ ...payload, idempotencyKey }) });
    if (!order?.id || typeof token !== 'string' || !token) throw new Error('Your order response was incomplete. Please try again; the same request will be used to avoid a duplicate.');
    if (!testCheckout) bag.clearIfUnchanged(retry.bagSnapshot);
    try { sessionStorage.setItem(`ln-order-token:${order.id}`, token); sessionStorage.removeItem(pendingKey); } catch (_) {}
    retry = null;
    completed = true;
    try { history.replaceState({ ...history.state, lnCheckoutCompleted: true }, '', location.href); } catch (_) {}
    const destination = new URL('order.html', location.href);
    destination.search = '';
    destination.hash = new URLSearchParams({ id: order.id, token }).toString();
    location.assign(destination.href);
  } catch (error) {
    let message = error.message || 'Your order could not be saved. Please try again.';
    const confirmedRejections = new Set(['invalid_input', 'test_recipient_mismatch', 'catalog_changed', 'checkout_update_required', 'insufficient_stock', 'reference_range_exhausted', 'reference_unavailable']);
    if (retry?.pending && confirmedRejections.has(error.data?.code)) {
      retry.pending = false;
      attemptPayload = null;
      reviewedSignature = null;
      saveRetry();
    }
    if (error.data?.code === 'test_order_deleted') {
      // Stop this old form, but let a fresh checkout choose a new key. Keeping
      // the rejected key in storage would trap subsequent rehearsals in retries.
      deletedCheckout = true;
      retry = null;
      attemptPayload = null;
      try { sessionStorage.removeItem(pendingKey); } catch (_) {}
      message = testCheckout ? 'This test order was deleted. Return to the owner dashboard and choose Test purchase to start again.' : 'This test order was deleted. Open a fresh checkout to test again.';
    } else if (error.status === 409) {
      reviewedSignature = null;
      if (error.data?.code === 'catalog_changed') {
        retry = null;
        attemptPayload = null;
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
    if (retry?.pending && error.code !== 'pending_details_changed') {
      message = 'We could not confirm the result yet. Your previous order details are protected. Choose Check previous order to recover the same attempt before making changes.';
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
  if (event.persisted) {
    submitting = false;
    // Reconcile before a delayed catalog response can render the old quantity.
    restoreBagQuantity();
    if (catalog) renderCatalog();
    if (completed && !deletedCheckout) announce($('checkout-message'), 'Your order was received. Return to the collection to start a new bag.');
  }
});
