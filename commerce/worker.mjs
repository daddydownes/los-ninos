import { authorizeAdmin, isLocalPreview } from './auth.mjs';
import { renderEmail } from './emails.mjs';
import { ownerAuthAction, ownerEmailAuthReady, cleanupOwnerAuth } from './email-auth.mjs';

const PRODUCT = { id: 'navy-snapback', name: 'OG Snapback' };
const STATES = new Set(['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT']);
const STATUSES = new Set(['awaiting_payment', 'paid', 'shipped', 'cancelled']);
const EMAIL_KINDS = new Set(['awaiting_payment', 'paid', 'shipped', 'owner_order']);
const encoder = new TextEncoder();
const nowISO = () => new Date().toISOString();
const seconds = () => Math.floor(Date.now() / 1000);
const stmt = (env, sql, ...values) => env.DB.prepare(sql).bind(...values);
const fail = (status, message, code = 'request_failed') => { throw Object.assign(new Error(message), { status, code }); };

function response(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...extra },
  });
}

function text(value, label, { min = 0, max = 200 } = {}) {
  if (typeof value !== 'string') fail(400, `${label} must be text.`, 'invalid_input');
  const result = value.trim();
  if (result.length < min || result.length > max || /[\u0000-\u001f\u007f]/.test(result)) {
    fail(400, `Please check ${label.toLowerCase()}.`, 'invalid_input');
  }
  return result;
}

function email(value, label = 'Email', optional = false) {
  const result = text(value ?? '', label, { max: 254 }).toLowerCase();
  if (!result && optional) return '';
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(result)) fail(400, `Please enter a valid ${label.toLowerCase()}.`, 'invalid_input');
  return result;
}

function integer(value, label, min, max, nullable = false) {
  if (nullable && value === null) return null;
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(400, `Please check ${label.toLowerCase()}.`, 'invalid_input');
  return value;
}

export async function sha256(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function orderToken(env, orderId, idempotencyKey, local) {
  const secret = env.ORDER_TOKEN_SECRET || (local ? 'local-preview-only-not-a-production-secret' : '');
  if (!secret) fail(503, 'Ordering is not ready yet.', 'setup_incomplete');
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const result = await crypto.subtle.sign('HMAC', key, encoder.encode(`${orderId}:${idempotencyKey}`));
  return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function readJSON(request) {
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) fail(415, 'Send JSON data.', 'invalid_input');
  if (Number(request.headers.get('content-length')) > 16384) fail(413, 'This request is too large.', 'invalid_input');
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'Please supply the required details.', 'invalid_input');
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16384) { await reader.cancel(); fail(413, 'This request is too large.', 'invalid_input'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { fail(400, 'Please supply valid order details.', 'invalid_input'); }
}

function requireSameOrigin(request) {
  const origin = new URL(request.url).origin;
  if (request.headers.get('origin') !== origin || request.headers.get('x-requested-with') !== 'LosNinos') {
    fail(403, 'Please use the shop page to submit this request.', 'invalid_origin');
  }
  const site = request.headers.get('sec-fetch-site');
  if (site && !['same-origin', 'none'].includes(site)) fail(403, 'Please use the shop page to submit this request.', 'invalid_origin');
}

async function limited(env, key, limit, period = 60) {
  const current = seconds();
  const window = Math.floor(current / period);
  const bucket = await sha256(`${key}:${window}`);
  const result = await stmt(env, `INSERT INTO rate_limits(bucket, count, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count`, bucket, (window + 2) * period).first();
  if (result.count > limit) fail(429, 'Please wait a moment before trying again.', 'rate_limited');
}

async function settings(env) {
  const row = await stmt(env, 'SELECT value, revision FROM settings WHERE id=1').first();
  if (!row) fail(503, 'Shop setup is not complete yet.', 'setup_incomplete');
  const value = JSON.parse(row.value);
  const stock = await stmt(env, 'SELECT stock_on_hand, reserved FROM inventory WHERE mode=?', 'live').first();
  return { ...value, stockOnHand: value.stockOnHand === null ? null : stock.stock_on_hand,
    reserved: stock.reserved, available: stock.stock_on_hand - stock.reserved, revision: row.revision };
}

function validAddressEmail(value) { return typeof value === 'string' && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value); }
function validPublicURL(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash; }
  catch { return false; }
}

function shippingTier(config) {
  const hasQuantity = Object.hasOwn(config, 'shippingTierFromQuantity');
  const hasFee = Object.hasOwn(config, 'shippingTierCents');
  const fromQuantity = config.shippingTierFromQuantity ?? null;
  const feeCents = config.shippingTierCents ?? null;
  const disabled = fromQuantity === null && feeCents === null;
  return { fromQuantity, feeCents, valid: hasQuantity === hasFee && (disabled || (Number.isSafeInteger(fromQuantity) && fromQuantity >= 2 && fromQuantity <= 10
    && Number.isSafeInteger(feeCents) && feeCents >= 0 && feeCents <= 100000)) };
}

function publicShipping(config) {
  const tier = shippingTier(config);
  return { country: 'AU', feeCents: config.shippingCents, tierFromQuantity: tier.fromQuantity, tierFeeCents: tier.feeCents };
}

function orderShippingCents(config, quantity) {
  const tier = shippingTier(config);
  if (!tier.valid) fail(503, 'The shop is updating its delivery charges. Please try again later.', 'setup_incomplete');
  return tier.fromQuantity !== null && quantity >= tier.fromQuantity ? tier.feeCents : config.shippingCents;
}

export function missingSetup(config, env) {
  const missing = [];
  if (!Number.isSafeInteger(config.productPriceCents) || config.productPriceCents <= 0) missing.push('Set the hat price');
  if (!Number.isSafeInteger(config.stockOnHand) || config.stockOnHand < 0) missing.push('Count and set available stock');
  if (!Number.isSafeInteger(config.shippingCents) || config.shippingCents < 0 || config.shippingConfirmed !== true) missing.push('Confirm packed postage and shipping charge');
  if (!shippingTier(config).valid) missing.push('Correct the shipping quantity tier and its charge');
  if (!config.bank?.accountName?.trim() || /[\[\]]|placeholder|to be|example/i.test(config.bank.accountName) ||
      !/^\d{6}$/.test((config.bank.bsb || '').replace(/[- ]/g, '')) || !/^\d{5,12}$/.test(config.bank.accountNumber || '')) missing.push('Confirm the account name, BSB and account number');
  if (!validAddressEmail(config.ownerEmail)) missing.push('Set the owner notification email');
  if (!validAddressEmail(config.supportEmail)) missing.push('Set the customer reply email');
  const ownerReady = env.OWNER_AUTH_MODE === 'email' ? ownerEmailAuthReady(env)
    : (!env.OWNER_AUTH_MODE || env.OWNER_AUTH_MODE === 'cloudflare') && /^https:\/\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN || '') && env.ACCESS_AUD && env.OWNER_EMAILS;
  if (!ownerReady) missing.push('Configure protected owner login');
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM || /@resend\.dev\b/i.test(env.EMAIL_FROM)) missing.push('Verify the sending domain and configure email delivery');
  if (!validPublicURL(env.PUBLIC_STORE_URL)) missing.push('Set the public shop domain');
  if (typeof env.ORDER_TOKEN_SECRET !== 'string' || env.ORDER_TOKEN_SECRET.length < 32) missing.push('Set the private order token secret');
  if (env.STORE_MODE !== 'live') missing.push('Enable live ordering after the launch checks');
  if (env.LAUNCH_CONFIRMED !== 'true') missing.push('Complete the owner launch checklist and confirm launch');
  return missing;
}

function testEmailRecipient(env) {
  if (env.STORE_MODE !== 'preview' || env.LOCAL_PREVIEW === 'true' || env.TEST_EMAILS_ENABLED !== 'true') return null;
  const recipient = String(env.TEST_EMAIL_TO || '').trim().toLowerCase();
  return validAddressEmail(recipient) ? recipient : null;
}

function testCheckoutSetup(config, env) {
  const recipient = testEmailRecipient(env);
  const missing = missingSetup(config, { ...env, STORE_MODE: 'live', LAUNCH_CONFIRMED: 'true' });
  if (!recipient) missing.unshift('Configure the approved test inbox and enable owner-only test emails');
  return { enabled: missing.length === 0, recipient, missingSetup: missing };
}

function canSendOrderEmail(env, order) {
  if (!order.preview) return env.STORE_MODE === 'live';
  return order.testDelivery === true && !!testEmailRecipient(env) && order.testEmailRecipient === testEmailRecipient(env);
}

function previewCheckoutAllowed(request, env) {
  if (isLocalPreview(request, env)) return true;
  // Hosted tests use separate preview inventory and never queue real email or
  // expose bank details. This does not grant access to any owner route.
  return env.STORE_MODE === 'preview' && env.HOSTED_TEST_CHECKOUT === 'true' &&
    new URL(request.url).protocol === 'https:' &&
    typeof env.ORDER_TOKEN_SECRET === 'string' && env.ORDER_TOKEN_SECRET.length >= 32;
}

async function catalog(request, env) {
  const config = await settings(env);
  const mode = env.STORE_MODE === 'live' ? 'live' : 'preview';
  const stock = await stmt(env, 'SELECT stock_on_hand, reserved FROM inventory WHERE mode=?', mode).first();
  return response({ mode, revision: config.revision, acceptingOrders: shippingTier(config).valid && (mode === 'live' ? missingSetup(config, env).length === 0 : previewCheckoutAllowed(request, env)),
    product: { ...PRODUCT, priceCents: config.productPriceCents,
      available: stock.stock_on_hand - stock.reserved, maxQuantity: config.maxQuantity },
    shipping: publicShipping(config),
    dispatchDays: '1–3 business days' });
}

async function testCheckoutCatalog(request, env) {
  const config = await settings(env);
  const readiness = testCheckoutSetup(config, env);
  const stock = await stmt(env, 'SELECT stock_on_hand, reserved FROM inventory WHERE mode=?', 'preview').first();
  return response({ catalog: { mode: 'preview', revision: config.revision, acceptingOrders: readiness.enabled,
    product: { ...PRODUCT, priceCents: config.productPriceCents, available: stock.stock_on_hand - stock.reserved, maxQuantity: config.maxQuantity },
    shipping: publicShipping(config), dispatchDays: '1–3 business days' },
    recipient: readiness.recipient, missingSetup: readiness.missingSetup });
}

function validateCheckout(body, config) {
  const idempotencyKey = text(body.idempotencyKey, 'Order key', { min: 16, max: 128 });
  if (!/^[a-zA-Z0-9_-]+$/.test(idempotencyKey)) fail(400, 'Please refresh the checkout and try again.', 'invalid_input');
  const quantity = integer(body.quantity, 'Quantity', 1, 10);
  const catalogRevision = integer(body.catalogRevision, 'Current shop details', 1, Number.MAX_SAFE_INTEGER);
  const customer = { name: text(body.customer?.name, 'Name', { min: 2, max: 120 }), email: email(body.customer?.email),
    phone: text(body.customer?.phone ?? '', 'Mobile number', { min: 8, max: 30 }) };
  if (!/^\+?[\d ()-]+$/.test(customer.phone) || !/^\d{8,15}$/.test(customer.phone.replace(/\D/g, ''))) fail(400, 'Please enter a valid mobile number for delivery updates.', 'invalid_input');
  const input = body.shippingAddress || {};
  const shippingAddress = { line1: text(input.line1, 'Street address', { min: 3, max: 160 }),
    line2: text(input.line2 ?? '', 'Address line two', { max: 160 }),
    suburb: text(input.suburb, 'Suburb', { min: 2, max: 100 }),
    state: text(input.state, 'State', { min: 2, max: 3 }).toUpperCase(),
    postcode: text(input.postcode, 'Postcode', { min: 4, max: 4 }), country: input.country };
  if (!STATES.has(shippingAddress.state) || !/^\d{4}$/.test(shippingAddress.postcode) || input.country !== 'AU') {
    fail(400, 'Please enter an Australian shipping address.', 'invalid_input');
  }
  return { idempotencyKey, catalogRevision, quantity, customer, shippingAddress, shippingQuoteCents: body.shippingQuoteCents };
}

function baseOrder(row) {
  return { ...JSON.parse(row.snapshot), id: row.id, reference: row.reference, status: row.status,
    createdAt: row.created_at, updatedAt: row.updated_at, preview: row.mode === 'preview', quantity: row.quantity,
    trackingNumber: row.tracking_number };
}

async function presentOrder(env, row, admin = false) {
  const [messages, history] = await Promise.all([
    stmt(env, 'SELECT id, kind, status, created_at, attempts, failure_code FROM email_outbox WHERE order_id=? ORDER BY created_at', row.id).all(),
    stmt(env, 'SELECT status, created_at, actor, note FROM order_history WHERE order_id=? ORDER BY created_at, rowid', row.id).all(),
  ]);
  const { testEmailRecipient: testRecipient, ...order } = baseOrder(row);
  return { ...order, ...(admin && testRecipient ? { testEmailRecipient: testRecipient } : {}),
    emails: messages.results.filter(message => admin || message.kind !== 'owner_order').map(message => ({
      id: message.id, kind: message.kind, status: message.status, createdAt: message.created_at,
      ...(admin ? { attempts: message.attempts, failureCode: message.failure_code } : {}),
    })),
    history: history.results.map(item => ({ status: item.status, createdAt: item.created_at,
      ...(admin ? { actor: item.actor, note: item.note } : {}) })),
  };
}

function outboxInsert(env, order, kind, config, id = crypto.randomUUID(), condition = null, recentCutoff = null) {
  const testRecipient = order.preview && order.testDelivery === true ? order.testEmailRecipient : null;
  const rendered = renderEmail(kind, order, { supportEmail: testRecipient || config.supportEmail, publicUrl: env.PUBLIC_STORE_URL });
  const payload = JSON.stringify({ from: env.EMAIL_FROM || 'preview@invalid.test',
    to: [testRecipient || (kind === 'owner_order' ? (config.ownerEmail || 'owner@invalid.test') : order.customer.email)],
    reply_to: testRecipient || config.supportEmail || undefined, ...rendered });
  const params = [id, order.id, kind, payload, order.preview && !testRecipient ? 'preview' : 'queued', nowISO(), seconds()];
  let sql = 'INSERT INTO email_outbox(id, order_id, kind, payload, status, created_at, next_attempt_at) SELECT ?,?,?,?,?,?,?';
  if (condition) { sql += ' WHERE EXISTS (SELECT 1 FROM orders WHERE id=? AND mutation_id=?)'; params.push(order.id, condition); }
  if (recentCutoff) {
    sql += ` WHERE EXISTS (SELECT 1 FROM orders WHERE id=? AND status=?) AND NOT EXISTS (
      SELECT 1 FROM email_outbox WHERE order_id=? AND kind=? AND (status IN ('queued','sending') OR created_at>?))`;
    params.push(order.id, order.status, order.id, kind, recentCutoff);
  }
  return stmt(env, sql, ...params);
}

async function placeOrder(request, env, ctx, testDelivery = false) {
  const config = await settings(env);
  const local = isLocalPreview(request, env);
  const preview = env.STORE_MODE !== 'live';
  if (!shippingTier(config).valid) fail(503, 'The shop is updating its delivery charges. Please try again later.', 'setup_incomplete');
  if (testDelivery) {
    if (new URL(request.url).protocol !== 'https:' || !testCheckoutSetup(config, env).enabled) fail(503, 'Complete the owner-only test email setup before testing a purchase.', 'setup_incomplete');
  } else if (preview ? !previewCheckoutAllowed(request, env) : missingSetup(config, env).length) fail(503, 'The shop is being prepared. Ordering will open soon.', 'setup_incomplete');
  const body = validateCheckout(await readJSON(request), config);
  if (testDelivery && body.customer.email !== testEmailRecipient(env)) fail(400, 'Use the approved test inbox shown on this checkout.', 'test_recipient_mismatch');
  const mode = preview ? 'preview' : 'live';
  const idempotencyHash = await sha256(`${testDelivery ? 'preview-email' : mode}:${body.idempotencyKey}`);
  const requestHash = await sha256(JSON.stringify({ quantity: body.quantity, customer: body.customer, shippingAddress: body.shippingAddress }));
  const existing = await stmt(env, 'SELECT * FROM orders WHERE idempotency_hash=?', idempotencyHash).first();
  if (existing) return existingOrderResponse(env, existing, body, requestHash, local);
  const deleted = await stmt(env, 'SELECT idempotency_hash FROM deleted_test_orders WHERE idempotency_hash=?', idempotencyHash).first();
  if (deleted) fail(409, 'This test order was deleted. Start a new checkout to test again.', 'test_order_deleted');
  if (body.catalogRevision !== config.revision) fail(409, 'Price or delivery options changed. Please review your order again.', 'catalog_changed');
  if (body.quantity > config.maxQuantity) fail(400, 'Please review the quantity in your bag.', 'invalid_input');
  const shippingCents = orderShippingCents(config, body.quantity);
  // A tab running the previous flat-rate checkout can fetch a new catalog but
  // still display the base fee. Require acknowledgement of any different tier
  // charge before saving, while allowing already-saved retries above to recover.
  if (body.shippingQuoteCents === undefined && shippingCents !== config.shippingCents) {
    fail(409, 'Refresh this page to load the current shipping charge before placing your order.', 'checkout_update_required');
  }
  if (body.shippingQuoteCents !== undefined && (!Number.isSafeInteger(body.shippingQuoteCents) || body.shippingQuoteCents !== shippingCents)) {
    fail(409, 'The shipping charge changed. Please review your order total and try again.', 'catalog_changed');
  }
  await limited(env, `order:${request.headers.get('cf-connecting-ip') || 'local'}`, 6, 600);
  const id = crypto.randomUUID();
  const token = await orderToken(env, id, body.idempotencyKey, local);
  const createdAt = nowISO();
  const snapshot = { productName: PRODUCT.name, unitPriceCents: config.productPriceCents,
    shippingCents,
    totalCents: Number.isSafeInteger(config.productPriceCents) && Number.isSafeInteger(shippingCents)
      ? config.productPriceCents * body.quantity + shippingCents : null,
    customer: body.customer, shippingAddress: body.shippingAddress,
    bank: preview && !testDelivery ? { accountName: '', bsb: '', accountNumber: '' } : { ...config.bank },
    ...(testDelivery ? { testDelivery: true, testEmailRecipient: testEmailRecipient(env) } : {}) };
  const order = { ...snapshot, id, reference: '', status: 'awaiting_payment', quantity: body.quantity, preview,
    createdAt, updatedAt: createdAt, trackingNumber: '' };
  for (let attempt = 0; attempt < 8; attempt++) {
    // Live references count from 001 to 999. Test orders have their own prefix
    // and sequence, so rehearsals never consume a customer's number. Existing
    // longer references are retained and excluded from this numeric sequence.
    const prefix = preview ? 'TEST-' : '';
    const last = await stmt(env, `SELECT MAX(CAST(substr(reference, ?) AS INTEGER)) AS number
      FROM orders WHERE mode=? AND reference GLOB ?`, prefix.length + 1, mode, `${prefix}[0-9][0-9][0-9]`).first();
    const nextNumber = Number(last?.number || 0) + 1;
    if (nextNumber > 999) {
      const duplicate = await stmt(env, 'SELECT * FROM orders WHERE idempotency_hash=?', idempotencyHash).first();
      if (duplicate) return existingOrderResponse(env, duplicate, body, requestHash, local);
      fail(503, 'Ordering is temporarily paused. Please contact the shop for help.', 'reference_range_exhausted');
    }
    order.reference = prefix + String(nextNumber).padStart(3, '0');
    try {
      // A failed insert or a competing last-item purchase rolls back every statement.
      await env.DB.batch([
        stmt(env, `INSERT INTO orders(id, reference, status, mode, quantity, created_at, updated_at, idempotency_hash, request_hash, token_hash, snapshot)
          SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM settings WHERE id=1 AND revision=?)`,
        id, order.reference, order.status, mode, body.quantity, createdAt, createdAt, idempotencyHash, requestHash, await sha256(token), JSON.stringify(snapshot), config.revision),
        stmt(env, 'INSERT INTO order_history(id, order_id, status, created_at, actor, note) VALUES (?,?,?,?,?,?)', crypto.randomUUID(), id, order.status, createdAt, 'customer', ''),
        outboxInsert(env, order, 'awaiting_payment', config), outboxInsert(env, order, 'owner_order', config),
      ]);
      break;
    } catch (error) {
      const duplicate = await stmt(env, 'SELECT * FROM orders WHERE idempotency_hash=?', idempotencyHash).first();
      if (duplicate) return existingOrderResponse(env, duplicate, body, requestHash, local);
      if (/UNIQUE constraint failed:\s*orders\.reference/i.test(String(error.message))) {
        // Another checkout claimed this number. The failed batch rolled back;
        // read the next number and retry without duplicating stock or emails.
        if (attempt < 7) continue;
        fail(503, 'We could not create your payment reference. Please try placing the order again.', 'reference_unavailable');
      }
      if (String(error.message).includes('test_order_deleted')) fail(409, 'This test order was deleted. Start a new checkout to test again.', 'test_order_deleted');
      if (String(error.message).includes('insufficient_stock')) fail(409, 'That quantity is no longer available. Please update your bag.', 'insufficient_stock');
      if (String(error.message).includes('FOREIGN KEY')) fail(409, 'Price or delivery options changed. Please review your order again.', 'catalog_changed');
      throw error;
    }
  }
  if (canSendOrderEmail(env, order)) ctx?.waitUntil?.(processOutbox(env));
  return response({ order: await presentOrder(env, await stmt(env, 'SELECT * FROM orders WHERE id=?', id).first()), token }, 201);
}

async function existingOrderResponse(env, row, body, requestHash, local) {
  if (row.request_hash !== requestHash) fail(409, 'This order key was already used for different details. Please start a new order.', 'idempotency_conflict');
  const token = await orderToken(env, row.id, body.idempotencyKey, local);
  if (await sha256(token) !== row.token_hash) fail(409, 'This order was already received. Please contact the shop with your email address.', 'order_already_received');
  return response({ order: await presentOrder(env, row), token });
}

async function customerOrder(request, env, id) {
  const token = request.headers.get('x-order-token') || '';
  if (!/^[a-f0-9]{64}$/.test(token)) fail(404, 'Order not found.', 'not_found');
  const row = await stmt(env, 'SELECT * FROM orders WHERE id=? AND token_hash=?', id, await sha256(token)).first();
  if (!row) fail(404, 'Order not found.', 'not_found');
  return response({ order: await presentOrder(env, row) });
}

async function adminOrders(request, env) {
  const url = new URL(request.url);
  const status = url.searchParams.get('status') || '';
  const query = text(url.searchParams.get('q') || '', 'Search', { max: 100 });
  if (status && status !== 'active' && !STATUSES.has(status)) fail(400, 'Unknown order status.', 'invalid_input');
  const conditions = ['1=1']; const values = [];
  if (status === 'active') conditions.push("status IN ('awaiting_payment','paid')");
  else if (status) { conditions.push('status=?'); values.push(status); }
  if (query) {
    conditions.push("(reference LIKE ? ESCAPE '\\' OR json_extract(snapshot,'$.customer.name') LIKE ? ESCAPE '\\' OR json_extract(snapshot,'$.customer.email') LIKE ? ESCAPE '\\')");
    const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`; values.push(pattern, pattern, pattern);
  }
  const rows = await stmt(env, `SELECT orders.*, COALESCE((SELECT json_group_array(json_object(
    'id',id,'kind',kind,'status',status,'createdAt',created_at,'attempts',attempts,'failureCode',failure_code))
    FROM email_outbox WHERE order_id=orders.id), '[]') AS emails_json
    FROM orders WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT 500`, ...values).all();
  return response({ orders: rows.results.map(row => ({ ...baseOrder(row), emails: JSON.parse(row.emails_json), history: [] })) });
}

async function setOrderStatus(request, env, ctx, id, actor) {
  const body = await readJSON(request);
  const row = await stmt(env, 'SELECT * FROM orders WHERE id=?', id).first();
  if (!row) fail(404, 'Order not found.', 'not_found');
  if (body.expectedUpdatedAt && body.expectedUpdatedAt !== row.updated_at) fail(409, 'This order changed. Refresh it before continuing.', 'order_changed');
  if (body.status === row.status) return response({ order: await presentOrder(env, row, true) });
  const allowed = row.status === 'awaiting_payment' ? ['paid', 'cancelled'] : row.status === 'paid' ? ['shipped'] : [];
  if (!allowed.includes(body.status)) fail(409, 'That status change is not available. Paid cancellations and refunds need to be handled directly with the customer.', 'invalid_transition');
  const note = text(body.note ?? '', 'Note', { max: 1000 });
  const trackingNumber = body.status === 'shipped' ? text(body.trackingNumber || '', 'Tracking number', { max: 60 }) : row.tracking_number;
  if (trackingNumber && !/^[a-zA-Z0-9 -]+$/.test(trackingNumber)) fail(400, 'Please enter the tracking number only.', 'invalid_input');
  const updatedAt = new Date(Math.max(Date.now(), Date.parse(row.updated_at) + 1)).toISOString();
  const mutationId = crypto.randomUUID();
  const order = { ...baseOrder(row), status: body.status, updatedAt, trackingNumber };
  const config = await settings(env);
  const batch = [
    stmt(env, 'UPDATE orders SET status=?, updated_at=?, tracking_number=?,mutation_id=? WHERE id=? AND updated_at=? AND status=?', body.status, updatedAt, trackingNumber, mutationId, id, row.updated_at, row.status),
    stmt(env, `INSERT INTO order_history(id,order_id,status,created_at,actor,note) SELECT ?,?,?,?,?,?
      WHERE EXISTS (SELECT 1 FROM orders WHERE id=? AND mutation_id=?)`, crypto.randomUUID(), id, body.status, updatedAt, actor.email, note, id, mutationId),
    stmt(env, `UPDATE email_outbox SET status='cancelled' WHERE order_id=? AND kind IN ('awaiting_payment','owner_order') AND status IN ('queued','failed','needs_review')
      AND EXISTS (SELECT 1 FROM orders WHERE id=? AND mutation_id=?)`, id, id, mutationId),
  ];
  if (['paid', 'shipped'].includes(body.status)) batch.push(outboxInsert(env, order, body.status, config, crypto.randomUUID(), mutationId));
  const result = await env.DB.batch(batch);
  if (result[0].meta.changes === 0) fail(409, 'This order changed. Refresh it before continuing.', 'order_changed');
  if (canSendOrderEmail(env, order)) ctx?.waitUntil?.(processOutbox(env));
  return response({ order: await presentOrder(env, await stmt(env, 'SELECT * FROM orders WHERE id=?', id).first(), true) });
}

async function deleteTestOrder(request, env, id) {
  const body = await readJSON(request);
  const expectedUpdatedAt = text(body.updatedAt, 'Order version', { min: 1, max: 40 });
  const row = await stmt(env, 'SELECT mode, updated_at FROM orders WHERE id=?', id).first();
  if (!row) fail(404, 'Order not found.', 'not_found');
  if (row.mode !== 'preview') fail(409, 'Only test orders can be deleted. Keep real orders for your records.', 'live_order_delete_forbidden');
  if (row.updated_at !== expectedUpdatedAt) fail(409, 'This order changed. Refresh it before deleting.', 'order_changed');
  const current = seconds();
  const sending = await stmt(env, "SELECT id FROM email_outbox WHERE order_id=? AND (status='sending' OR lease_until>?) LIMIT 1", id, current).first();
  if (sending) fail(409, 'An email is being processed. Refresh the order and try again when it finishes.', 'email_in_progress');

  const mutationId = crypto.randomUUID();
  // Claim the current order and perform all cleanup in one transaction. A sender
  // that has already claimed an email blocks deletion; an unclaimed sender sees
  // no outbox row after deletion and cannot start a new send.
  const claimed = 'EXISTS (SELECT 1 FROM orders WHERE id=? AND mode=\'preview\' AND mutation_id=?)';
  const result = await env.DB.batch([
    stmt(env, `UPDATE orders SET mutation_id=? WHERE id=? AND mode='preview' AND updated_at=?
      AND NOT EXISTS (SELECT 1 FROM email_outbox WHERE order_id=orders.id AND (status='sending' OR lease_until>?))`, mutationId, id, expectedUpdatedAt, current),
    stmt(env, `INSERT INTO deleted_test_orders(idempotency_hash, deleted_at)
      SELECT idempotency_hash, ? FROM orders WHERE id=? AND mode='preview' AND mutation_id=?`, nowISO(), id, mutationId),
    stmt(env, `UPDATE inventory SET
      reserved=reserved-(SELECT CASE WHEN status IN ('awaiting_payment','paid') THEN quantity ELSE 0 END FROM orders WHERE id=? AND mutation_id=?),
      stock_on_hand=stock_on_hand+(SELECT CASE WHEN status='shipped' THEN quantity ELSE 0 END FROM orders WHERE id=? AND mutation_id=?)
      WHERE mode='preview' AND ${claimed}`, id, mutationId, id, mutationId, id, mutationId),
    stmt(env, `DELETE FROM email_outbox WHERE order_id=? AND ${claimed}`, id, id, mutationId),
    stmt(env, `DELETE FROM order_history WHERE order_id=? AND ${claimed}`, id, id, mutationId),
    stmt(env, "DELETE FROM orders WHERE id=? AND mode='preview' AND mutation_id=?", id, mutationId),
  ]);
  if (!result[0].meta.changes) fail(409, 'This order changed or an email is being processed. Refresh it before deleting.', 'order_changed');
  return response({ ok: true, deletedId: id });
}

function validateSettings(body, previous = {}) {
  const bank = body.bank || {};
  const accountName = text(bank.accountName ?? '', 'Account name', { max: 150 });
  const bsb = text(bank.bsb ?? '', 'BSB', { max: 8 }).replace(/[- ]/g, '');
  const accountNumber = text(bank.accountNumber ?? '', 'Account number', { max: 12 });
  if (bsb && !/^\d{6}$/.test(bsb)) fail(400, 'The BSB must contain six digits.', 'invalid_input');
  if (accountNumber && !/^\d{5,12}$/.test(accountNumber)) fail(400, 'Please check the account number, keeping any leading zeros.', 'invalid_input');
  if (typeof body.shippingConfirmed !== 'boolean') fail(400, 'Please confirm whether postage has been checked.', 'invalid_input');
  const hasTierQuantity = Object.hasOwn(body, 'shippingTierFromQuantity');
  const hasTierFee = Object.hasOwn(body, 'shippingTierCents');
  if (hasTierQuantity !== hasTierFee) fail(400, 'Supply both the shipping tier quantity and charge, or clear both.', 'invalid_input');
  // Older settings forms omit both tier fields. Preserve the stored pair rather
  // than silently reverting a configured shop to flat shipping.
  const tier = shippingTier(hasTierQuantity ? body : previous);
  if (!tier.valid) fail(400, 'Set a shipping tier of 2–10 hats and a valid charge, or clear both fields.', 'invalid_input');
  return { productPriceCents: integer(body.productPriceCents, 'Hat price', 1, 1000000, true),
    stockOnHand: integer(body.stockOnHand, 'Stock count', 0, 100000, true),
    maxQuantity: integer(body.maxQuantity, 'Maximum quantity', 1, 10),
    shippingCents: integer(body.shippingCents, 'Shipping charge', 0, 100000, true), shippingConfirmed: body.shippingConfirmed,
    shippingTierFromQuantity: tier.fromQuantity, shippingTierCents: tier.feeCents,
    bank: { accountName, bsb, accountNumber }, ownerEmail: email(body.ownerEmail, 'Owner email', true),
    supportEmail: email(body.supportEmail, 'Customer reply email', true) };
}

async function updateSettings(request, env, actor) {
  if (env.OWNER_SETTINGS_EDITABLE === 'false') fail(403, 'Store settings are locked for now. Orders can still be managed normally.', 'settings_locked');
  const body = await readJSON(request);
  const previous = await settings(env);
  if (body.revision !== previous.revision) fail(409, 'Settings or stock changed. Refresh before saving.', 'settings_changed');
  const config = validateSettings(body, previous);
  if (config.stockOnHand === null && previous.stockOnHand !== null) fail(400, 'Use a stock count of zero to pause sales.', 'invalid_input');
  if (config.stockOnHand !== null && config.stockOnHand < previous.reserved) fail(409, `Stock cannot be lower than the ${previous.reserved} hats reserved for open orders.`, 'reserved_stock');
  const nextRevision = previous.revision + 1;
  const mutationId = crypto.randomUUID();
  const fields = Object.keys(config).filter(key => JSON.stringify(config[key]) !== JSON.stringify(previous[key]));
  try {
    const batch = [stmt(env, 'UPDATE settings SET value=?,revision=?,mutation_id=? WHERE id=1 AND revision=?', JSON.stringify(config), nextRevision, mutationId, previous.revision)];
    if (config.stockOnHand !== null) batch.push(stmt(env, `UPDATE inventory SET stock_on_hand=? WHERE mode='live'
      AND EXISTS (SELECT 1 FROM settings WHERE id=1 AND mutation_id=?)`, config.stockOnHand, mutationId));
    batch.push(stmt(env, `INSERT INTO settings_history(id,created_at,actor,changed_fields) SELECT ?,?,?,?
      WHERE EXISTS (SELECT 1 FROM settings WHERE id=1 AND mutation_id=?)`, crypto.randomUUID(), nowISO(), actor.email, JSON.stringify(fields), mutationId));
    const result = await env.DB.batch(batch);
    if (!result[0].meta.changes) fail(409, 'Settings changed. Refresh before saving.', 'settings_changed');
  } catch (error) {
    if (String(error.message).includes('CHECK')) fail(409, 'Stock changed while saving. Refresh the stock count and try again.', 'reserved_stock');
    throw error;
  }
  const saved = await settings(env);
  return response({ settings: saved, missingSetup: missingSetup(saved, env) });
}

async function resend(request, env, ctx, id) {
  const body = await readJSON(request);
  const row = await stmt(env, 'SELECT * FROM orders WHERE id=?', id).first();
  if (!row) fail(404, 'Order not found.', 'not_found');
  if (!EMAIL_KINDS.has(body.kind) || (body.kind !== 'owner_order' && body.kind !== row.status)) fail(400, 'Choose the email for the current order status.', 'invalid_input');
  const existing = await stmt(env, `SELECT id FROM email_outbox WHERE order_id=? AND kind=? AND
    (status IN ('queued','sending') OR created_at > ?) LIMIT 1`, id, body.kind, new Date(Date.now() - 60000).toISOString()).first();
  if (existing) return response({ ok: true, message: 'An email is already queued or was recently created.' });
  const config = await settings(env);
  if (row.mode === 'live' && missingSetup(config, env).length) fail(503, 'Complete email and shop setup before sending again.', 'setup_incomplete');
  await outboxInsert(env, baseOrder(row), body.kind, config, crypto.randomUUID(), null, new Date(Date.now() - 60000).toISOString()).run();
  if (canSendOrderEmail(env, baseOrder(row))) ctx?.waitUntil?.(processOutbox(env));
  return response({ ok: true });
}

function csvCell(value) {
  let item = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(item)) item = `'${item}`;
  return `"${item.replace(/"/g, '""')}"`;
}

async function exportOrders(env) {
  const rows = await stmt(env, 'SELECT * FROM orders ORDER BY created_at DESC LIMIT 10000').all();
  const header = ['Reference','Status','Preview','Created','Customer','Email','Phone','Quantity','Total AUD','Address','Suburb','State','Postcode','Tracking'];
  const lines = [header, ...rows.results.map(row => {
    const order = baseOrder(row); const address = order.shippingAddress;
    return [order.reference, order.status, order.preview ? 'Yes' : 'No', order.createdAt, order.customer.name, order.customer.email,
      order.customer.phone, order.quantity, order.totalCents === null ? '' : (order.totalCents / 100).toFixed(2),
      [address.line1, address.line2].filter(Boolean).join(', '), address.suburb, address.state, address.postcode, order.trackingNumber];
  })];
  return new Response('\ufeff' + lines.map(line => line.map(csvCell).join(',')).join('\r\n'), { headers: {
    'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="los-ninos-orders.csv"',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  } });
}

async function emailPreview(request, env, kind) {
  if (!EMAIL_KINDS.has(kind)) fail(404, 'Email not found.', 'not_found');
  const id = new URL(request.url).searchParams.get('orderId');
  const row = id && await stmt(env, 'SELECT * FROM orders WHERE id=?', id).first();
  if (!row) fail(404, 'Choose an order to preview its email.', 'not_found');
  const config = await settings(env);
  const order = baseOrder(row);
  if (!order.preview && kind !== 'owner_order' && kind !== order.status) fail(400, 'Choose the email for the current order status.', 'invalid_input');
  const rendered = renderEmail(kind, order, { supportEmail: order.preview && order.testDelivery === true ? order.testEmailRecipient : config.supportEmail, publicUrl: env.PUBLIC_STORE_URL });
  return new Response(rendered.html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } });
}

export async function processOutbox(env) {
  const testRecipient = testEmailRecipient(env);
  if ((env.STORE_MODE !== 'live' && !testRecipient) || !env.RESEND_API_KEY) return;
  const mode = env.STORE_MODE === 'live' ? 'live' : 'preview';
  const current = seconds();
  // Provider idempotency lasts 24 hours. Stop ambiguous retries before it expires.
  await stmt(env, `UPDATE email_outbox SET status='needs_review', failure_code='retry_window_expired'
    WHERE status IN ('queued','sending') AND lease_until<=? AND ambiguous_at IS NOT NULL AND ambiguous_at < ?
    AND EXISTS (SELECT 1 FROM orders WHERE id=email_outbox.order_id AND mode=?
      AND (mode='live' OR (json_extract(snapshot,'$.testDelivery')=1 AND json_extract(snapshot,'$.testEmailRecipient')=?)))`,
    current, current - 23 * 3600, mode, testRecipient).run();
  const due = await stmt(env, `SELECT e.*, o.mode, o.status AS order_status, o.snapshot FROM email_outbox e JOIN orders o ON o.id=e.order_id
    WHERE o.mode=? AND (o.mode='live' OR (json_extract(o.snapshot,'$.testDelivery')=1 AND json_extract(o.snapshot,'$.testEmailRecipient')=?))
    AND ((e.status='queued' AND e.next_attempt_at<=?) OR (e.status='sending' AND e.lease_until<?))
    ORDER BY e.created_at LIMIT 5`, mode, testRecipient, current, current).all();
  const sendFetch = env.FETCH || fetch;
  for (const entry of due.results) {
    if (['awaiting_payment','owner_order'].includes(entry.kind) && entry.order_status !== 'awaiting_payment') {
      await stmt(env, "UPDATE email_outbox SET status='cancelled' WHERE id=? AND status IN ('queued','sending')", entry.id).run(); continue;
    }
    if (entry.mode === 'preview') {
      // Recheck the immutable order and rendered payload at the actual send boundary.
      // No caller or stale queued payload may introduce another recipient or Reply-To.
      let payload;
      try { payload = JSON.parse(entry.payload); } catch { /* Mark unsafe payload below. */ }
      if (!payload || !Array.isArray(payload.to) || payload.to.length !== 1 || payload.to[0] !== testRecipient ||
          payload.reply_to !== testRecipient || Object.hasOwn(payload, 'cc') || Object.hasOwn(payload, 'bcc') ||
          typeof payload.subject !== 'string' || !payload.subject.startsWith('[TEST] ')) {
        await stmt(env, "UPDATE email_outbox SET status='failed',failure_code='test_recipient_guard',lease_until=0 WHERE id=? AND status IN ('queued','sending') AND lease_until<=?", entry.id, current).run();
        continue;
      }
    }
    const lease = current + 120;
    const claim = await stmt(env, `UPDATE email_outbox SET status='sending', lease_until=?, attempts=attempts+1,
      first_attempt_at=COALESCE(first_attempt_at,?), ambiguous_at=COALESCE(ambiguous_at,?) WHERE id=? AND
      ((status='queued' AND next_attempt_at<=?) OR (status='sending' AND lease_until<?))
      AND EXISTS (SELECT 1 FROM orders WHERE id=email_outbox.order_id AND mode=?
        AND (mode='live' OR (json_extract(snapshot,'$.testDelivery')=1 AND json_extract(snapshot,'$.testEmailRecipient')=?))
        AND (email_outbox.kind NOT IN ('awaiting_payment','owner_order') OR status='awaiting_payment'))`,
      lease, current, current, entry.id, current, current, mode, testRecipient).run();
    if (!claim.meta.changes) continue;
    let result;
    try {
      result = await sendFetch('https://api.resend.com/emails', { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15000),
        headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `los-ninos/${entry.id}` },
        body: entry.payload });
      if (result.ok) {
        const body = await result.json();
        if (typeof body.id !== 'string') throw new Error('invalid_provider_response');
        await stmt(env, "UPDATE email_outbox SET status='sent',provider_id=?,failure_code=NULL,lease_until=0 WHERE id=? AND status='sending' AND lease_until=?", body.id, entry.id, lease).run();
        continue;
      }
      let providerCode = '';
      try { providerCode = (await result.json()).name || ''; } catch { /* Do not store provider responses containing customer data. */ }
      const retry = result.status === 429 || result.status >= 500 || (result.status === 409 && providerCode === 'concurrent_idempotent_requests');
      // A definite 4xx rejection did not send this attempt. Keep an earlier uncertainty,
      // but do not let repeated daily-quota rejections exhaust the deduplication window.
      const ambiguousAt = result.status >= 500 || (result.status === 409 && providerCode === 'concurrent_idempotent_requests')
        ? (entry.ambiguous_at ?? current) : entry.ambiguous_at;
      await stmt(env, `UPDATE email_outbox SET status=?,failure_code=?,next_attempt_at=?,ambiguous_at=?,lease_until=0 WHERE id=? AND status='sending' AND lease_until=?`,
        retry ? 'queued' : 'failed', `provider_${result.status}`, current + Math.min(3600, 60 * 2 ** Math.min(entry.attempts, 6)), ambiguousAt, entry.id, lease).run();
    } catch {
      await stmt(env, `UPDATE email_outbox SET status='queued',failure_code='delivery_unconfirmed',next_attempt_at=?,lease_until=0
        WHERE id=? AND status='sending' AND lease_until=?`, current + Math.min(3600, 60 * 2 ** Math.min(entry.attempts, 6)), entry.id, lease).run();
    }
  }
}

async function updateDeliveryStatus(env) {
  const testRecipient = testEmailRecipient(env);
  if ((env.STORE_MODE !== 'live' && !testRecipient) || !env.RESEND_API_KEY) return;
  const mode = env.STORE_MODE === 'live' ? 'live' : 'preview';
  const current = seconds();
  const rows = await stmt(env, `SELECT e.id,e.provider_id FROM email_outbox e JOIN orders o ON o.id=e.order_id
    WHERE e.status='sent' AND e.checked_at<? AND e.created_at>? AND o.mode=?
    AND (o.mode='live' OR (json_extract(o.snapshot,'$.testDelivery')=1 AND json_extract(o.snapshot,'$.testEmailRecipient')=?)) LIMIT 5`,
    current - 300, new Date(Date.now() - 7 * 86400000).toISOString(), mode, testRecipient).all();
  const sendFetch = env.FETCH || fetch;
  for (const row of rows.results) {
    try {
      const result = await sendFetch(`https://api.resend.com/emails/${encodeURIComponent(row.provider_id)}`, {
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` }, redirect: 'manual', signal: AbortSignal.timeout(10000) });
      if (!result.ok) continue;
      const data = await result.json();
      const mapped = ({ delivered: 'delivered', bounced: 'bounced', complained: 'complained', failed: 'failed' })[data.last_event] || 'sent';
      await stmt(env, 'UPDATE email_outbox SET status=?,checked_at=? WHERE id=? AND status=?', mapped, current, row.id, 'sent').run();
    } catch { /* Delivery checks are retried by the next scheduled run. */ }
  }
}

async function fetchHandler(request, env, ctx) {
  const url = new URL(request.url);
  let path;
  try { path = decodeURIComponent(url.pathname); } catch { fail(400, 'This address is not valid.', 'invalid_path'); }
  if (/[\\\u0000-\u001f\u007f]/.test(path) || path.includes('%')) fail(400, 'This address is not valid.', 'invalid_path');
  path = new URL(url.origin + path.replace(/\/{2,}/g, '/')).pathname;
  const isAdmin = path === '/admin' || path === '/admin.html' || path.startsWith('/admin/') || path === '/api/admin' || path.startsWith('/api/admin/');
  if (!env.DB && (path.startsWith('/api/') || isAdmin)) fail(503, 'Shop setup is not complete yet.', 'setup_incomplete');
  if (path.startsWith('/api/owner-auth/')) {
    requireSameOrigin(request);
    return ownerAuthAction(path.slice('/api/owner-auth/'.length), request, env, await readJSON(request), ctx);
  }
  let actor;
  if (isAdmin) {
    try { actor = await authorizeAdmin(request, env); }
    catch (error) {
      if (env.OWNER_AUTH_MODE === 'email' && ['GET','HEAD'].includes(request.method) && !path.startsWith('/api/') && validPublicURL(env.PUBLIC_STORE_URL)) {
        return new Response(null, { status: 303, headers: { Location: `${env.PUBLIC_STORE_URL.replace(/\/$/, '')}/owner-login`, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
      }
      throw error;
    }
  }
  if (path.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method)) requireSameOrigin(request);
  if (path.startsWith('/api/admin/') && request.method !== 'GET') await limited(env, `admin:${actor.email}`, 60);
  if (path === '/api/catalog' && request.method === 'GET') return catalog(request, env);
  if (path === '/api/orders' && request.method === 'POST') return placeOrder(request, env, ctx);
  let match = path.match(/^\/api\/orders\/([a-f0-9-]{36})$/);
  if (match && request.method === 'GET') return customerOrder(request, env, match[1]);
  if (path === '/api/admin/orders' && request.method === 'GET') return adminOrders(request, env);
  if (path === '/api/admin/test-checkout' && request.method === 'GET') return testCheckoutCatalog(request, env);
  if (path === '/api/admin/test-orders' && request.method === 'POST') return placeOrder(request, env, ctx, true);
  if (path === '/api/admin/settings' && request.method === 'GET') { const config = await settings(env); return response({ settings: config, settingsEditable: env.OWNER_SETTINGS_EDITABLE !== 'false', ownerAuthMode: env.OWNER_AUTH_MODE || 'cloudflare', missingSetup: missingSetup(config, env), testCheckout: testCheckoutSetup(config, env) }); }
  if (path === '/api/admin/settings' && request.method === 'PUT') return updateSettings(request, env, actor);
  if (path === '/api/admin/export' && request.method === 'GET') return exportOrders(env);
  match = path.match(/^\/api\/admin\/orders\/([a-f0-9-]{36})(?:\/(status|resend))?$/);
  if (match) {
    if (!match[2] && request.method === 'DELETE') return deleteTestOrder(request, env, match[1]);
    if (match[2] === 'status' && request.method === 'POST') return setOrderStatus(request, env, ctx, match[1], actor);
    if (match[2] === 'resend' && request.method === 'POST') return resend(request, env, ctx, match[1]);
    if (!match[2] && request.method === 'GET') { const row = await stmt(env, 'SELECT * FROM orders WHERE id=?', match[1]).first(); if (!row) fail(404, 'Order not found.', 'not_found'); return response({ order: await presentOrder(env, row, true) }); }
  }
  match = path.match(/^\/api\/admin\/email-preview\/([a-z_]+)$/);
  if (match && request.method === 'GET') return emailPreview(request, env, match[1]);
  if (path.startsWith('/api/')) fail(404, 'This page was not found.', 'not_found');
  if (!env.ASSETS) fail(404, 'This page was not found.', 'not_found');
  const asset = await env.ASSETS.fetch(request);
  if (!isAdmin && path !== '/owner-login' && path !== '/owner-login.html') return asset;
  const headers = new Headers(asset.headers);
  headers.set('Cache-Control', 'no-store'); headers.set('X-Content-Type-Options', 'nosniff'); headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Frame-Options', 'DENY');
  return new Response(asset.body, { status: asset.status, headers });
}

export default {
  async fetch(request, env, ctx) {
    try { return await fetchHandler(request, env, ctx); }
    catch (error) {
      // Deliberately avoid logging request bodies, bank details, access tokens or email responses.
      return response({ error: error.status ? error.message : 'Something went wrong. Please try again or contact the shop.',
        code: error.code || (error.status === 403 ? 'forbidden' : 'internal_error') }, error.status || 500,
      error.status === 429 ? { 'Retry-After': '60' } : {});
    }
  },
  async scheduled(_event, env, ctx) {
    const task = (async () => { await processOutbox(env); await updateDeliveryStatus(env); await cleanupOwnerAuth(env);
      await stmt(env, 'DELETE FROM rate_limits WHERE expires_at<?', seconds()).run(); })();
    if (ctx?.waitUntil) ctx.waitUntil(task); else await task;
  },
};
