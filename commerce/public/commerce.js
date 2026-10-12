export const money = (cents, placeholder = 'To be set') => typeof cents === 'number' && Number.isFinite(cents)
  ? new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(cents / 100)
  : placeholder;

export function text(element, value) {
  if (element) element.textContent = value ?? '';
}

export function el(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

export function announce(element, message, isError = false) {
  if (!element) return;
  element.classList.toggle('notice-error', isError);
  element.setAttribute('role', isError ? 'alert' : 'status');
  element.textContent = message;
}

export function statusLabel(status) {
  return ({ awaiting_payment: 'Awaiting payment', paid: 'Payment confirmed', shipped: 'Shipped', cancelled: 'Cancelled' })[status] || 'Order received';
}

export function formatAddress(address = {}) {
  return [address.line1, address.line2, [address.suburb, address.state, address.postcode].filter(Boolean).join(' '), address.country === 'AU' ? 'Australia' : address.country].filter(Boolean).join('\n');
}

export function safeDate(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

export async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  const method = (options.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD'].includes(method)) headers.set('X-Requested-With', 'LosNinos');
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  let response;
  try {
    response = await fetch(path, { ...options, headers, credentials: 'same-origin', cache: 'no-store' });
  } catch (_) {
    throw new Error('We couldn’t connect. Check your connection and try again.');
  }
  let result;
  try { result = await response.json(); } catch (_) { result = null; }
  if (!response.ok) {
    const serverMessage = typeof result?.error === 'string' ? result.error : (result?.error?.message || result?.message);
    const error = new Error(typeof serverMessage === 'string' ? serverMessage : response.status === 404
      ? 'Ordering is not connected on this preview website yet. Please return when the shop opens.'
      : response.status === 401 || response.status === 403
        ? 'Your session is not authorised. Please sign in again using the owner’s private link.'
        : 'Something went wrong. Please try again.');
    error.status = response.status;
    error.data = result;
    throw error;
  }
  if (!result || typeof result !== 'object') throw new Error('Ordering is not connected on this preview website yet. Please return when the shop opens.');
  return result;
}

export async function copyValue(button, value, messageElement, label) {
  try {
    await navigator.clipboard.writeText(String(value));
    button.textContent = 'Copied';
    announce(messageElement, `${label} copied.`);
    setTimeout(() => { button.textContent = 'Copy'; }, 1800);
  } catch (_) {
    announce(messageElement, `Copy is unavailable in this browser. Select the ${label.toLowerCase()} above and copy it manually.`);
  }
}
