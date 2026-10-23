import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import SqliteD1 from '../../scripts/d1-sqlite.mjs';
import worker, { processOutbox, sha256 } from '../worker.mjs';
import { authorizeAdmin, isLocalPreview } from '../auth.mjs';

const schema = await readFile(new URL('../schema.sql', import.meta.url), 'utf8');
const origin = 'http://127.0.0.1:8787';
const complete = {
  productPriceCents: 4500, stockOnHand: 10, maxQuantity: 1, shippingCents: 2000, shippingConfirmed: true,
  bank: { accountName: 'Test account', bsb: '012345', accountNumber: '00123456' },
  ownerEmail: 'owner@example.test', supportEmail: 'help@example.test',
};

async function setup(t) {
  const DB = new SqliteD1(); await DB.exec(schema); t.after(() => DB.close());
  return { DB, STORE_MODE: 'preview', LOCAL_PREVIEW: 'true' };
}

function request(path, method = 'GET', body, headers = {}, host = origin) {
  return new Request(host + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json', 'Origin': host, 'X-Requested-With': 'LosNinos' } : {}), ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}) });
}

async function call(env, path, method = 'GET', body, headers = {}, host = origin) {
  if (path === '/api/orders' && method === 'POST' && body.catalogRevision === undefined) body = { ...body, catalogRevision: (await env.DB.prepare('SELECT revision FROM settings').first()).revision };
  if (path === '/api/admin/settings' && method === 'PUT' && body.revision === undefined) body = { ...body, revision: (await env.DB.prepare('SELECT revision FROM settings').first()).revision };
  const result = await worker.fetch(request(path, method, body, headers, host), env, {});
  const data = result.headers.get('content-type')?.includes('application/json') ? await result.json() : await result.text();
  return { status: result.status, data, headers: result.headers };
}

function checkout(key = crypto.randomUUID(), updates = {}) {
  return { idempotencyKey: key, quantity: 1, customer: { name: 'Sample Buyer', email: 'buyer@example.test', phone: '' },
    shippingAddress: { line1: '10 Test Street', line2: '', suburb: 'Melbourne', state: 'VIC', postcode: '3000', country: 'AU' }, ...updates };
}

async function configure(env, values = {}) {
  const result = await call(env, '/api/admin/settings', 'PUT', { ...complete, ...values });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return result.data.settings;
}

async function live(env) {
  await configure(env);
  Object.assign(env, { STORE_MODE: 'live', LOCAL_PREVIEW: 'false', LAUNCH_CONFIRMED: 'true',
    ACCESS_TEAM_DOMAIN: 'https://unit-test.cloudflareaccess.com', ACCESS_AUD: 'test-audience', OWNER_EMAILS: 'owner@example.test',
    RESEND_API_KEY: 'test-key-never-real', EMAIL_FROM: 'Los Niños <orders@example.test>', PUBLIC_STORE_URL: 'https://shop.example.test',
    ORDER_TOKEN_SECRET: 'this-is-a-private-test-token-secret-never-real' });
  return env;
}

async function ownerToken(env) {
  const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...await crypto.subtle.exportKey('jwk', keys.publicKey), kid: 'test-owner', use: 'sig', alg: 'RS256' };
  env.FETCH = async url => { assert.equal(url, env.ACCESS_TEAM_DOMAIN + '/cdn-cgi/access/certs'); return Response.json({ keys: [jwk] }); };
  return async (changes = {}) => {
    const stamp = Math.floor(Date.now() / 1000);
    const payload = { iss: env.ACCESS_TEAM_DOMAIN, aud: [env.ACCESS_AUD], iat: stamp, exp: stamp + 600, email: 'owner@example.test', ...changes };
    const data = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-owner', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify(payload)).toString('base64url');
    return data + '.' + Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(data))).toString('base64url');
  };
}

test('preview shows AUD 50 with free shipping, keeps bank details private and stock separate, and requires loopback opt-in', async t => {
  const env = await setup(t);
  const catalog = await call(env, '/api/catalog');
  assert.equal(catalog.data.acceptingOrders, true);
  assert.equal(catalog.data.product.priceCents, 5000);
  assert.equal(catalog.data.product.maxQuantity, 1);
  assert.equal(catalog.data.shipping.feeCents, 0);
  const remote = await call(env, '/api/orders', 'POST', checkout(), {}, 'https://preview.example.test');
  assert.equal(remote.status, 503);
  const result = await call(env, '/api/orders', 'POST', checkout());
  assert.equal(result.status, 201, JSON.stringify(result.data));
  assert.equal(result.data.order.totalCents, 5000);
  assert.equal(result.data.order.unitPriceCents, 5000);
  assert.equal(result.data.order.shippingCents, 0);
  assert.equal(result.data.order.preview, true);
  assert.deepEqual(result.data.order.bank, { accountName: '', bsb: '', accountNumber: '' });
  assert.deepEqual(result.data.order.emails.map(item => item.status), ['preview']);
  const stock = await env.DB.prepare("SELECT * FROM inventory WHERE mode='live'").first();
  assert.equal(stock.reserved, 0);
  assert.equal(stock.stock_on_hand, 0);
});

test('all mutations reject cross-origin, missing CSRF header and oversized input', async t => {
  const env = await setup(t);
  for (const headers of [{ Origin: 'https://evil.example' }, { 'X-Requested-With': '' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    assert.equal((await call(env, '/api/orders', 'POST', checkout(), headers)).status, 403);
  }
  assert.equal((await call(env, '/api/orders', 'POST', { excess: 'x'.repeat(20000) })).status, 413);
  assert.equal((await call(env, '/api/orders', 'POST', checkout(undefined, { quantity: 2 }))).status, 400);
});

test('hosted checkout requires explicit HTTPS test mode and a private order secret', async t => {
  const env = await setup(t);
  env.LOCAL_PREVIEW = 'false';
  const host = 'https://preview.example.test';
  const catalog = () => call(env, '/api/catalog', 'GET', undefined, {}, host);
  assert.equal((await catalog()).data.acceptingOrders, false);
  env.HOSTED_TEST_CHECKOUT = 'true';
  assert.equal((await catalog()).data.acceptingOrders, false);
  env.ORDER_TOKEN_SECRET = 'a-private-hosted-test-secret-with-at-least-32-characters';
  assert.equal((await catalog()).data.acceptingOrders, true);
  assert.equal((await call(env, '/api/catalog', 'GET', undefined, {}, 'http://preview.example.test')).data.acceptingOrders, false);
  env.STORE_MODE = 'live';
  assert.equal((await catalog()).data.acceptingOrders, false);
  assert.equal((await call(env, '/api/orders', 'POST', checkout(), {}, host)).status, 503);
});

test('hosted test order saves once without login, real bank details, email delivery or live stock reservations', async t => {
  const env = await setup(t);
  await configure(env);
  await env.DB.prepare("UPDATE inventory SET stock_on_hand=100 WHERE mode='live'").run();
  Object.assign(env, { LOCAL_PREVIEW: 'false', HOSTED_TEST_CHECKOUT: 'true',
    ORDER_TOKEN_SECRET: 'another-private-hosted-test-secret-with-at-least-32-characters',
    FETCH: async () => { throw new Error('Hosted tests must never send email.'); } });
  const host = 'https://preview.example.test';
  const body = checkout();
  const placed = await call(env, '/api/orders', 'POST', body, {}, host);
  assert.equal(placed.status, 201, JSON.stringify(placed.data));
  assert.equal(placed.data.order.preview, true);
  assert.deepEqual(placed.data.order.bank, { accountName: '', bsb: '', accountNumber: '' });
  const retried = await call(env, '/api/orders', 'POST', body, {}, host);
  assert.equal(retried.status, 200);
  assert.equal(retried.data.token, placed.data.token);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM orders').first()).n, 1);
  const receipt = await call(env, `/api/orders/${placed.data.order.id}`, 'GET', undefined,
    { 'X-Order-Token': placed.data.token }, host);
  assert.equal(receipt.status, 200);
  assert.equal((await call(env, `/api/orders/${placed.data.order.id}`, 'GET', undefined, {}, host)).status, 404);
  assert.equal((await call(env, '/api/admin/orders', 'GET', undefined, {}, host)).status, 403);
  await processOutbox(env);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE status='preview'").first()).n, 2);
  const stock = await env.DB.prepare("SELECT * FROM inventory WHERE mode='live'").first();
  assert.equal(stock.stock_on_hand, 100);
  assert.equal(stock.reserved, 0);
  assert.equal((await env.DB.prepare("SELECT reserved FROM inventory WHERE mode='preview'").first()).reserved, 1);
});

test('incomplete live configuration and missing launch confirmation fail closed', async t => {
  const env = await setup(t);
  env.STORE_MODE = 'live';
  assert.equal((await call(env, '/api/orders', 'POST', checkout())).status, 503);
  env.STORE_MODE = 'preview'; await live(env);
  env.LAUNCH_CONFIRMED = 'false';
  assert.equal((await call(env, '/api/catalog')).data.acceptingOrders, false);
  assert.equal((await call(env, '/api/orders', 'POST', checkout())).status, 503);
});

test('duplicate submission creates one order, reservation and email pair; changed details rejected', async t => {
  const env = await setup(t);
  const body = checkout();
  const results = await Promise.all([call(env, '/api/orders', 'POST', body), call(env, '/api/orders', 'POST', body)]);
  assert.deepEqual(results.map(item => item.status).sort(), [200, 201]);
  assert.equal(results[0].data.token, results[1].data.token);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM orders').first()).n, 1);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM email_outbox').first()).n, 2);
  assert.equal((await env.DB.prepare("SELECT reserved FROM inventory WHERE mode='preview'").first()).reserved, 1);
  const changed = await call(env, '/api/orders', 'POST', { ...body, customer: { ...body.customer, name: 'Different Buyer' } });
  assert.equal(changed.status, 409);
});

test('concurrent last-hat orders cannot oversell; failed inserts leave no partial history or email', async t => {
  const env = await setup(t);
  await env.DB.prepare("UPDATE inventory SET stock_on_hand=1 WHERE mode='preview'").run();
  const results = await Promise.all([call(env, '/api/orders', 'POST', checkout()), call(env, '/api/orders', 'POST', checkout())]);
  assert.deepEqual(results.map(item => item.status).sort(), [201, 409]);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM orders').first()).n, 1);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM order_history').first()).n, 1);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM email_outbox').first()).n, 2);
});

test('customer receipts require the secret header and omit owner notes and identities', async t => {
  const env = await setup(t);
  const placed = (await call(env, '/api/orders', 'POST', checkout())).data;
  assert.equal((await call(env, `/api/orders/${placed.order.id}`)).status, 404);
  assert.equal((await call(env, `/api/orders/${placed.order.id}`, 'GET', undefined, { 'X-Order-Token': 'a'.repeat(64) })).status, 404);
  const result = await call(env, `/api/orders/${placed.order.id}`, 'GET', undefined, { 'X-Order-Token': placed.token });
  assert.equal(result.status, 200);
  assert.equal(result.data.order.history[0].actor, undefined);
  assert.equal(result.data.order.history[0].note, undefined);
  assert.equal(result.data.order.emails.some(item => item.kind === 'owner_order'), false);
  const row = await env.DB.prepare('SELECT * FROM orders').first();
  assert.equal(row.token_hash, await sha256(placed.token));
  assert.equal(JSON.stringify(row).includes(placed.token), false);
});

test('prices are computed by the server and bank details are immutable snapshots', async t => {
  const env = await live(await setup(t));
  const result = await call(env, '/api/orders', 'POST', checkout(undefined, { totalCents: 1, priceCents: 1, shippingCents: 0 }));
  assert.equal(result.status, 201, JSON.stringify(result.data));
  assert.equal(result.data.order.totalCents, 6500);
  assert.equal(result.data.order.bank.bsb, '012345');
  assert.equal(result.data.order.bank.accountNumber, '00123456');
  const stored = await env.DB.prepare('SELECT * FROM orders').first();
  await assert.rejects(env.DB.prepare("UPDATE orders SET snapshot='{}' WHERE id=?").bind(stored.id).run(), /immutable_order/);
  const config = JSON.parse((await env.DB.prepare('SELECT value FROM settings').first()).value);
  config.bank.accountNumber = '99999999';
  await env.DB.prepare('UPDATE settings SET value=?').bind(JSON.stringify(config)).run();
  const receipt = await call(env, `/api/orders/${stored.id}`, 'GET', undefined, { 'X-Order-Token': result.data.token });
  assert.equal(receipt.data.order.bank.accountNumber, '00123456');
});

test('manual cancellation releases stock exactly once and shipped orders deduct stock', async t => {
  const env = await setup(t);
  const cancelled = (await call(env, '/api/orders', 'POST', checkout())).data.order;
  const path = `/api/admin/orders/${cancelled.id}/status`;
  const changes = await Promise.all([call(env, path, 'POST', { status: 'cancelled' }), call(env, path, 'POST', { status: 'cancelled' })]);
  assert.ok(changes.every(item => [200, 409].includes(item.status)), JSON.stringify(changes));
  assert.equal((await env.DB.prepare("SELECT reserved FROM inventory WHERE mode='preview'").first()).reserved, 0);
  const current = (await call(env, '/api/orders', 'POST', checkout())).data.order;
  assert.equal((await call(env, `/api/admin/orders/${current.id}/status`, 'POST', { status: 'shipped', trackingNumber: '12345678' })).status, 409);
  const paid = await call(env, `/api/admin/orders/${current.id}/status`, 'POST', { status: 'paid' });
  assert.equal(paid.status, 200, JSON.stringify(paid.data));
  assert.equal((await call(env, `/api/admin/orders/${current.id}/status`, 'POST', { status: 'cancelled' })).status, 409);
  assert.equal((await call(env, `/api/admin/orders/${current.id}/status`, 'POST', { status: 'shipped' })).status, 400);
  assert.equal((await call(env, `/api/admin/orders/${current.id}/status`, 'POST', { status: 'shipped', trackingNumber: '12345678', expectedUpdatedAt: current.updatedAt })).status, 409);
  const shipped = await call(env, `/api/admin/orders/${current.id}/status`, 'POST', { status: 'shipped', trackingNumber: '12345678', expectedUpdatedAt: paid.data.order.updatedAt });
  assert.equal(shipped.status, 200, JSON.stringify(shipped.data));
  const stock = await env.DB.prepare("SELECT * FROM inventory WHERE mode='preview'").first();
  assert.equal(stock.stock_on_hand, 9); assert.equal(stock.reserved, 0);
});

test('concurrent owner edits create only one history entry and message', async t => {
  const env = await setup(t);
  const order = (await call(env, '/api/orders', 'POST', checkout())).data.order;
  const results = await Promise.all([1, 2].map(() => call(env, `/api/admin/orders/${order.id}/status`, 'POST', { status: 'paid', expectedUpdatedAt: order.updatedAt })));
  assert.ok(results.every(item => [200, 409].includes(item.status)));
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM order_history WHERE status='paid'").first()).n, 1);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE kind='paid'").first()).n, 1);
});

test('admin pages, APIs and exports reject forged email headers; preview bypass never works remotely or live', async t => {
  const env = await setup(t);
  for (const path of ['/admin', '/admin/', '/admin.html', '/admin%2ehtml', '/%61dmin/', '/api/%61dmin/settings', '/api/admin/orders', '/api/admin/export']) {
    assert.equal((await call(env, path, 'GET', undefined, { 'Cf-Access-Authenticated-User-Email': 'owner@example.test' }, 'https://shop.example.test')).status, 403);
  }
  assert.equal(isLocalPreview(request('/'), env), true);
  assert.equal(isLocalPreview(request('/'), { ...env, STORE_MODE: 'live' }), false);
  await assert.rejects(authorizeAdmin(request('/admin', 'GET', undefined, { 'Cf-Access-Authenticated-User-Email': 'owner@example.test' }), { ...env, LOCAL_PREVIEW: 'false' }), { status: 403 });
});

test('outbox retries reuse identical payload and provider key; preview messages never send', async t => {
  const env = await setup(t);
  await call(env, '/api/orders', 'POST', checkout());
  await live(env);
  await call(env, '/api/orders', 'POST', checkout());
  const sends = [];
  env.FETCH = async (url, options) => { sends.push({ url, key: options.headers['Idempotency-Key'], body: options.body }); return new Response('{}', { status: 503 }); };
  await processOutbox(env);
  assert.equal(sends.length, 2);
  await env.DB.prepare("UPDATE email_outbox SET next_attempt_at=0 WHERE status='queued'").run();
  env.FETCH = async (url, options) => { sends.push({ url, key: options.headers['Idempotency-Key'], body: options.body }); return Response.json({ id: 'provider-' + sends.length }); };
  await processOutbox(env);
  assert.equal(sends.length, 4);
  for (const first of sends.slice(0, 2)) assert.deepEqual(sends.find((item, index) => index > 1 && item.key === first.key), first);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE status='sent'").first()).n, 2);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE status='preview'").first()).n, 2);
});

test('outbox stops ambiguous retries before Resend idempotency expires', async t => {
  const env = await live(await setup(t));
  await call(env, '/api/orders', 'POST', checkout());
  await env.DB.prepare('UPDATE email_outbox SET first_attempt_at=?,ambiguous_at=?,next_attempt_at=0').bind(Math.floor(Date.now() / 1000) - 24 * 3600, Math.floor(Date.now() / 1000) - 24 * 3600).run();
  let sends = 0; env.FETCH = async () => { sends++; return Response.json({ id: 'unexpected' }); };
  await processOutbox(env);
  assert.equal(sends, 0);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE status='needs_review'").first()).n, 2);
});

test('confirmed quota rejections remain safely retryable after the next daily reset', async t => {
  const env = await live(await setup(t));
  await call(env, '/api/orders', 'POST', checkout());
  const attempts = [];
  env.FETCH = async (_url, options) => { attempts.push(options); return Response.json({ name: 'daily_quota_exceeded' }, { status: 429 }); };
  await processOutbox(env);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM email_outbox WHERE ambiguous_at IS NULL').first()).n, 2);
  await env.DB.prepare('UPDATE email_outbox SET first_attempt_at=?,next_attempt_at=0').bind(Math.floor(Date.now() / 1000) - 48 * 3600).run();
  env.FETCH = async (_url, options) => { attempts.push(options); return Response.json({ id: 'accepted-after-reset' }); };
  await processOutbox(env);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE status='sent'").first()).n, 2);
  assert.equal(attempts.length, 4);
  for (const first of attempts.slice(0, 2)) {
    const retry = attempts.slice(2).find(item => item.headers['Idempotency-Key'] === first.headers['Idempotency-Key']);
    assert.equal(retry.body, first.body);
  }
});

test('a later quota rejection cannot clear an earlier ambiguous acceptance', async t => {
  const env = await live(await setup(t));
  await call(env, '/api/orders', 'POST', checkout());
  env.FETCH = async () => { throw new Error('timeout'); };
  await processOutbox(env);
  const before = await env.DB.prepare('SELECT ambiguous_at FROM email_outbox LIMIT 1').first();
  assert.ok(before.ambiguous_at);
  await env.DB.prepare('UPDATE email_outbox SET next_attempt_at=0').run();
  env.FETCH = async () => Response.json({ name: 'daily_quota_exceeded' }, { status: 429 });
  await processOutbox(env);
  assert.equal((await env.DB.prepare('SELECT ambiguous_at FROM email_outbox LIMIT 1').first()).ambiguous_at, before.ambiguous_at);
});

test('CSV export neutralizes spreadsheet formulas and includes zero-prefixed postcodes', async t => {
  const env = await setup(t);
  const body = checkout(); body.customer.name = '=HYPERLINK("evil")'; body.shippingAddress.postcode = '0800'; body.shippingAddress.state = 'NT';
  await call(env, '/api/orders', 'POST', body);
  const result = await call(env, '/api/admin/export');
  assert.equal(result.status, 200);
  assert.ok(result.data.includes("'=HYPERLINK"));
  assert.ok(result.data.includes('"0800"'));
  assert.equal(result.headers.get('cache-control'), 'no-store');
});

test('admin settings save detects revision conflicts and guards reserved stock', async t => {
  const env = await setup(t);
  const config = await configure(env);
  const first = await call(env, '/api/admin/settings', 'PUT', { ...complete, revision: config.revision, stockOnHand: 5 });
  assert.equal(first.status, 200);
  const conflict = await call(env, '/api/admin/settings', 'PUT', { ...complete, revision: config.revision, stockOnHand: 9 });
  assert.equal(conflict.status, 409);
  assert.equal((await env.DB.prepare("SELECT stock_on_hand FROM inventory WHERE mode='live'").first()).stock_on_hand, 5);
  await env.DB.prepare("UPDATE inventory SET reserved=4 WHERE mode='live'").run();
  assert.equal((await call(env, '/api/admin/settings', 'PUT', { ...complete, stockOnHand: 3 })).status, 409);
});

test('catalog revision changes require a fresh customer review while existing orders recover', async t => {
  const env = await setup(t);
  const revision = (await call(env, '/api/catalog')).data.revision;
  const body = checkout(undefined, { catalogRevision: revision });
  const placed = await call(env, '/api/orders', 'POST', body);
  await configure(env);
  const stale = await call(env, '/api/orders', 'POST', checkout(undefined, { catalogRevision: revision }));
  assert.equal(stale.status, 409); assert.equal(stale.data.code, 'catalog_changed');
  const recovered = await call(env, '/api/orders', 'POST', body);
  assert.equal(recovered.status, 200); assert.equal(recovered.data.token, placed.data.token);
  const missingRevision = await worker.fetch(request('/api/orders', 'POST', checkout()), env, {});
  assert.equal(missingRevision.status, 400);
});

test('competing settings updates cannot let the losing request change stock or audit history', async t => {
  const env = await setup(t);
  const config = await configure(env);
  const results = await Promise.all([7, 8].map(stockOnHand => call(env, '/api/admin/settings', 'PUT', { ...complete, revision: config.revision, stockOnHand })));
  assert.deepEqual(results.map(item => item.status).sort(), [200, 409]);
  const winner = results.find(item => item.status === 200).data.settings;
  assert.equal((await env.DB.prepare("SELECT stock_on_hand FROM inventory WHERE mode='live'").first()).stock_on_hand, winner.stockOnHand);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM settings_history').first()).n, 2);
});

test('signed owner login validates signature, audience, issuer, expiry and owner identity', async t => {
  const env = await live(await setup(t));
  const sign = await ownerToken(env);
  const token = await sign();
  assert.equal((await call(env, '/api/admin/settings', 'GET', undefined, { 'Cf-Access-Jwt-Assertion': token })).status, 200);
  for (const changes of [{ aud: ['another-app'] }, { iss: 'https://evil.cloudflareaccess.com' }, { exp: 1 },
    { email: 'outsider@example.test' }, { nbf: Math.floor(Date.now() / 1000) + 120 }]) {
    const rejected = await call(env, '/api/admin/settings', 'GET', undefined, { 'Cf-Access-Jwt-Assertion': await sign(changes) });
    assert.equal(rejected.status, 403, JSON.stringify(changes));
  }
  const parts = token.split('.');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url'));
  parts[1] = Buffer.from(JSON.stringify({ ...payload, email: 'other@example.test' })).toString('base64url');
  assert.equal((await call(env, '/api/admin/settings', 'GET', undefined, { 'Cf-Access-Jwt-Assertion': parts.join('.') })).status, 403);
});

test('shipping changes the settings revision so an old form cannot restore a sold hat', async t => {
  const env = await live(await setup(t));
  const sign = await ownerToken(env);
  const headers = { 'Cf-Access-Jwt-Assertion': await sign() };
  const before = (await call(env, '/api/admin/settings', 'GET', undefined, headers)).data.settings;
  const placed = (await call(env, '/api/orders', 'POST', checkout())).data.order;
  assert.equal((await call(env, `/api/admin/orders/${placed.id}/status`, 'POST', { status: 'paid' }, headers)).status, 200);
  assert.equal((await call(env, `/api/admin/orders/${placed.id}/status`, 'POST', { status: 'shipped', trackingNumber: '12345678' }, headers)).status, 200);
  const staleSave = await call(env, '/api/admin/settings', 'PUT', { ...before, bank: { ...before.bank, accountName: 'Corrected name' } }, headers);
  assert.equal(staleSave.status, 409);
  assert.equal((await env.DB.prepare("SELECT stock_on_hand FROM inventory WHERE mode='live'").first()).stock_on_hand, 9);
});

test('the owner list serves 50 orders in one database query', async t => {
  const env = await setup(t);
  await env.DB.prepare("UPDATE inventory SET stock_on_hand=100 WHERE mode='preview'").run();
  for (let index = 0; index < 50; index++) {
    assert.equal((await call(env, '/api/orders', 'POST', checkout(), { 'CF-Connecting-IP': `192.0.2.${index}` })).status, 201);
  }
  let queries = 0;
  const prepare = env.DB.prepare.bind(env.DB);
  env.DB.prepare = sql => { queries++; return prepare(sql); };
  const result = await call(env, '/api/admin/orders');
  assert.equal(result.status, 200); assert.equal(result.data.orders.length, 50); assert.equal(queries, 1);
  assert.equal(result.data.orders[0].emails.length, 2);
});
