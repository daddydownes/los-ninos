import { api, money, text, announce, statusLabel, formatAddress, safeDate, copyValue } from './commerce.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.hash.slice(1));
const orderId = params.get('id');
let token = params.get('token');
let currentOrder;
let loading = false;

if (orderId) {
  try {
    if (token) {
      sessionStorage.setItem(`ln-order-token:${orderId}`, token);
      // The private key stays out of the address bar when session storage works.
      const cleanUrl = new URL(location.href);
      cleanUrl.hash = new URLSearchParams({ id: orderId }).toString();
      history.replaceState(null, '', cleanUrl.href);
    } else token = sessionStorage.getItem(`ln-order-token:${orderId}`);
  } catch (_) { /* Keep the original fragment as a fallback when storage is blocked. */ }
}

function bankValue(value, placeholder) {
  return typeof value === 'string' && value.trim() ? value : placeholder;
}

function setupCopy(id, value, label, enabled) {
  const button = $(id);
  button.disabled = !enabled;
  button.setAttribute('aria-label', `Copy ${label.toLowerCase()}`);
  button.onclick = enabled ? () => copyValue(button, value, $('copy-message'), label) : null;
}

function render(order) {
  currentOrder = order;
  const preview = order.preview === true;
  const testDelivery = preview && order.testDelivery === true;
  const awaiting = order.status === 'awaiting_payment';
  const completeBank = [order.bank?.accountName, order.bank?.bsb, order.bank?.accountNumber].every((value) => typeof value === 'string' && value.trim());
  const canPay = !preview && completeBank && typeof order.totalCents === 'number';
  document.title = `${order.reference || 'Your order'} — Los Niños`;
  $('preview-banner').hidden = !preview;
  $('test-dashboard-link').hidden = !testDelivery;
  text($('preview-copy'), testDelivery ? 'This is an email test order. Emails go only to the approved test inbox. No payment or shipment is required.' : 'This is a test order. No payment is due and no email has been sent. Bank details below are placeholders.');
  text($('order-reference'), order.reference);
  text($('order-date'), safeDate(order.createdAt));
  text($('order-status'), preview ? `Test order · ${statusLabel(order.status)}` : statusLabel(order.status));
  $('order-status').className = `pill pill-${['paid', 'shipped', 'cancelled'].includes(order.status) ? order.status : 'awaiting'}`;
  text($('product-name'), order.productName || 'Navy snapback');
  text($('product-quantity'), `Navy · Quantity ${order.quantity}`);
  text($('subtotal'), money(typeof order.unitPriceCents === 'number' ? order.unitPriceCents * order.quantity : null));
  text($('shipping-cost'), order.shippingCents === 0 ? 'Free' : money(order.shippingCents, 'To be determined'));
  text($('order-total'), money(order.totalCents, typeof order.unitPriceCents === 'number' ? 'Pending shipping' : 'To be set'));
  text($('shipping-address'), [order.customer?.name, formatAddress(order.shippingAddress)].filter(Boolean).join('\n'));
  text($('customer-email'), order.customer?.email);
  $('payment-panel').hidden = !awaiting;
  $('state-panel').hidden = awaiting;
  $('tracking-details').hidden = true;
  if (awaiting) {
    text($('order-title'), preview ? 'Test order received.' : 'Order received. One more step.');
    text($('order-intro'), preview ? 'This is how your customer’s order page will look. No payment is due.' : 'Thanks for your order. It’s awaiting payment—please complete the bank transfer using the details below.');
    text($('payment-eyebrow'), preview ? 'Preview · no payment due' : 'Pay by bank transfer');
    text($('payment-heading'), preview ? 'Payment details preview' : 'Your payment details');
    text($('payment-description'), testDelivery ? 'These are the configured payment details for checking the purchase flow. Do not make a transfer for this test order.' : preview ? 'The account holder, BSB and account number will appear here once the owner has confirmed them. Do not make a transfer for this test order.' : canPay ? 'Open your banking app and transfer the exact amount to this account. Include your payment reference.' : 'Payment details are temporarily unavailable. Do not transfer money yet. Please reply to your order email for help.');
    if (!preview && !canPay) text($('order-intro'), 'Your order is saved and awaiting payment. Please wait until the payment details have been confirmed.');
    text($('payment-total'), preview ? 'No payment due' : money(order.totalCents));
    text($('bank-name'), preview && !testDelivery ? '[Account name]' : bankValue(order.bank?.accountName, 'To be confirmed'));
    text($('bank-bsb'), preview && !testDelivery ? '[BSB]' : bankValue(order.bank?.bsb, 'To be confirmed'));
    text($('bank-account'), preview && !testDelivery ? '[Account number]' : bankValue(order.bank?.accountNumber, 'To be confirmed'));
    text($('bank-reference'), order.reference);
    text($('reference-help'), preview ? 'Each real order gets a unique reference so the owner can match the transfer to the order.' : 'Enter this in your banking app’s reference or description field so we can match your payment.');
    text($('payment-next-copy'), preview ? 'For a real order, the owner checks the bank payment and confirms it. The customer is then emailed, with dispatch within 1–3 business days after payment is confirmed.' : 'We’ll email you when we’ve confirmed your payment. We dispatch within 1–3 business days after payment is confirmed.');
    setupCopy('copy-amount', typeof order.totalCents === 'number' ? (order.totalCents / 100).toFixed(2) : '', 'Amount', canPay);
    setupCopy('copy-name', order.bank?.accountName, 'Account name', canPay);
    setupCopy('copy-bsb', order.bank?.bsb, 'BSB', canPay);
    setupCopy('copy-account', order.bank?.accountNumber, 'Account number', canPay);
    setupCopy('copy-reference', order.reference, 'Payment reference', !preview && canPay);
  } else if (order.status === 'paid') {
    text($('order-title'), 'Payment confirmed.');
    text($('order-intro'), preview ? 'Test payment marked as confirmed. No real payment has been taken.' : 'Thank you—we’ve confirmed your payment. Your hat is getting ready to go.');
    text($('state-eyebrow'), 'Next up · dispatch');
    text($('state-heading'), 'We’re getting it ready.');
    text($('state-description'), preview ? 'In the live shop, the owner packs the hat and confirms when it is dispatched.' : 'We dispatch within 1–3 business days after payment is confirmed. We’ll email you again when your order has been shipped.');
  } else if (order.status === 'shipped') {
    text($('order-title'), 'On its way.');
    text($('order-intro'), preview ? 'This test order has been marked as shipped. No parcel has been sent.' : 'Your hat has been dispatched. Thanks for being part of Los Niños.');
    text($('state-eyebrow'), 'Order dispatched');
    text($('state-heading'), 'Keep an eye out.');
    text($('state-description'), preview ? 'The customer receives a dispatch confirmation after the owner sends the parcel.' : 'Your order has been sent. Reply to your confirmation email if you need help.');
    if (order.trackingNumber) {
      $('tracking-details').hidden = false;
      text($('tracking-number'), order.trackingNumber);
    }
  } else {
    text($('order-title'), 'Order cancelled.');
    text($('order-intro'), preview ? 'This test order has been cancelled.' : 'This order has been cancelled. Please do not send a payment for it.');
    text($('state-eyebrow'), 'No payment due');
    text($('state-heading'), 'Need a hand?');
    text($('state-description'), preview ? 'The owner can cancel an unpaid order manually from the dashboard.' : 'If you have already sent a bank transfer, reply to your order email with your order reference so we can help.');
  }
  text($('order-help-copy'), testDelivery ? 'Use the owner dashboard to simulate payment confirmation and dispatch, inspect email delivery, then delete this test order. Real stock is unchanged. Keep this private order link to yourself.' : preview ? 'Preview orders are separate from real orders. You can test the owner’s payment and shipping workflow from the dashboard.' : 'Need to change something? Reply to your order email and include your order reference. Keep this order link private—it contains your delivery details.');
  $('order-content').hidden = false;
}

async function loadOrder(refresh = false) {
  if (loading) return;
  if (!orderId || !token) {
    $('order-loading').hidden = true;
    $('order-error').hidden = false;
    announce($('order-error'), 'This order link is incomplete. Open the order confirmation in the browser you used at checkout, or reply to your order email for help.', true);
    return;
  }
  loading = true;
  $('order-retry-wrap').hidden = true;
  if (!currentOrder) {
    $('order-error').hidden = true;
    $('order-loading').hidden = false;
  }
  $('refresh-order').disabled = true;
  try {
    const { order } = await api(`/api/orders/${encodeURIComponent(orderId)}`, { headers: { 'X-Order-Token': token } });
    if (!order?.id) throw new Error('Your order could not be loaded. Please try again.');
    render(order);
    $('order-error').hidden = true;
    if (refresh) announce($('refresh-message'), `Order updated. ${statusLabel(order.status)}.`);
  } catch (error) {
    if (currentOrder) announce($('refresh-message'), error.message, true);
    else {
      $('order-error').hidden = false;
      $('order-retry-wrap').hidden = [401, 403, 404].includes(error.status);
      announce($('order-error'), error.status === 401 || error.status === 403 || error.status === 404 ? 'We couldn’t open this private order link. Open the order confirmation in the browser you used at checkout, or reply to your order email for help.' : error.message, true);
    }
  } finally {
    loading = false;
    $('order-loading').hidden = true;
    $('refresh-order').disabled = false;
  }
}

$('refresh-order').addEventListener('click', () => loadOrder(true));
$('order-retry').addEventListener('click', () => loadOrder());
loadOrder();
