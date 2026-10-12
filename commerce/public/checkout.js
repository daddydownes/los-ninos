import { api, money, text, announce } from './commerce.js';

const $ = (id) => document.getElementById(id);
const form = $('checkout-form');
const quantityInput = $('quantity');
const submitButton = $('submit-order');
let catalog;
let submitting = false;
let retry = null;
let quantityWasAdjusted = false;
let completed = false;
const pendingKey = 'ln-checkout-pending-v1';

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

function updateSummary() {
  if (!catalog) return;
  const quantity = getQuantity();
  const unit = catalog.product.priceCents;
  const shipping = catalog.shipping.feeCents;
  text($('subtotal-label'), quantity === 1 ? 'Hat subtotal' : `Hat subtotal · ${quantity} hats`);
  text($('subtotal'), money(typeof unit === 'number' ? unit * quantity : null));
  text($('shipping-cost'), money(shipping, 'To be confirmed'));
  text($('total'), money(typeof unit === 'number' && typeof shipping === 'number' ? unit * quantity + shipping : null));
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
  if (preview) {
    text($('checkout-intro-copy'), 'Try the checkout with test details. No money will be taken and no emails will be sent.');
    text($('email-help'), 'Use a test email address. No email will be sent in this preview.');
    text($('checkout-fineprint'), 'This creates a preview order only. Do not enter real customer details or send a bank transfer.');
  }
  const accepting = catalog.acceptingOrders === true;
  form.setAttribute('aria-busy', String(submitting));
  form.querySelectorAll('input, select').forEach((input) => { input.disabled = submitting; });
  submitButton.disabled = !accepting || limit === 0 || submitting;
  text(submitButton, submitting ? 'Saving your order…' : !accepting ? 'Orders are not open yet' : limit === 0 ? 'Sold out' : preview ? 'Create test order' : 'Place order — pay by bank transfer');
  if (limit === 0) text($('stock-message'), 'This hat is currently sold out.');
  else text($('stock-message'), quantityWasAdjusted ? `Your quantity was adjusted to ${getQuantity()}. Up to ${limit} ${limit === 1 ? 'hat can' : 'hats can'} currently be ordered.` : `Up to ${limit} ${limit === 1 ? 'hat' : 'hats'} per order.`);
  if (!accepting) announce($('checkout-message'), preview ? 'Preview ordering is not available in this environment yet.' : 'We’re getting the shop ready. Ordering will open once the final details are confirmed.');
  updateSummary();
}

const initialQuantity = Number(new URLSearchParams(location.search).get('quantity'));
quantityInput.value = Number.isInteger(initialQuantity) && initialQuantity > 0 ? Math.min(initialQuantity, 10) : 1;

$('quantity-minus').addEventListener('click', () => {
  quantityInput.value = Math.max(1, getQuantity() - 1);
  updateSummary();
});
$('quantity-plus').addEventListener('click', () => {
  quantityInput.value = Math.min(quantityLimit(), getQuantity() + 1);
  updateSummary();
});
quantityInput.addEventListener('input', updateSummary);
quantityInput.addEventListener('change', () => {
  quantityInput.value = Math.min(Math.max(1, getQuantity()), Math.max(1, quantityLimit()));
  updateSummary();
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
  if (submitting || !catalog?.acceptingOrders || !form.reportValidity()) return;
  const read = (id) => $(id).value.trim();
  const payload = {
    catalogRevision: catalog.revision,
    quantity: getQuantity(),
    customer: { name: read('customer-name'), email: read('customer-email'), phone: read('customer-phone') },
    shippingAddress: { line1: read('address-line1'), line2: read('address-line2'), suburb: read('address-suburb'), state: read('address-state'), postcode: read('address-postcode'), country: 'AU' },
  };
  if (!payload.customer.name || !payload.shippingAddress.line1 || !payload.shippingAddress.suburb) {
    announce($('checkout-message'), 'Please complete your name and shipping address.', true);
    return;
  }
  submitting = true;
  renderCatalog();
  announce($('checkout-message'), 'Saving your order…');
  try {
    const idempotencyKey = await requestKey(payload);
    const { order, token } = await api('/api/orders', { method: 'POST', body: JSON.stringify({ ...payload, idempotencyKey }) });
    if (!order?.id || typeof token !== 'string') throw new Error('Your order response was incomplete. Please try again; the same request will be used to avoid a duplicate.');
    try { sessionStorage.setItem(`ln-order-token:${order.id}`, token); sessionStorage.removeItem(pendingKey); } catch (_) {}
    completed = true;
    const destination = new URL('order.html', location.href);
    destination.search = '';
    destination.hash = new URLSearchParams({ id: order.id, token }).toString();
    location.assign(destination.href);
  } catch (error) {
    let message = error.message || 'Your order could not be saved. Please try again.';
    if (error.status === 409) {
      if (error.data?.code === 'catalog_changed') {
        retry = null;
        try { sessionStorage.removeItem(pendingKey); } catch (_) {}
      }
      try {
        catalog = await api('/api/catalog');
        if (error.data?.code === 'catalog_changed') message = 'Price or delivery options changed. Please review your order again before submitting.';
      } catch (_) {
        catalog.acceptingOrders = false;
        message = 'Shop details changed, but we couldn’t reload them. Please refresh this page before trying again.';
      }
    }
    submitting = false;
    renderCatalog();
    announce($('checkout-message'), message, true);
    $('checkout-message').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
});

api('/api/catalog').then((result) => {
  if (!result.product || !result.shipping) throw new Error('The shop is still being prepared. Please check back soon.');
  catalog = result;
  renderCatalog();
}).catch((error) => {
  $('catalog-error').hidden = false;
  announce($('catalog-error'), error.message, true);
  text(submitButton, 'Checkout unavailable');
  text($('checkout-intro-copy'), 'The shop is still being prepared. You can return to the collection using the link above.');
});

// Returning from confirmation must not leave a cached form in its saving state.
window.addEventListener('pageshow', (event) => {
  if (event.persisted && catalog) {
    submitting = false;
    renderCatalog();
    if (completed) announce($('checkout-message'), 'Your previous order was received. Submitting the same details again will reopen that order.');
  }
});
