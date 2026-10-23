import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import SqliteD1 from '../../scripts/d1-sqlite.mjs';
import worker, { processOutbox } from '../worker.mjs';

const schema = await readFile(new URL('../schema.sql', import.meta.url), 'utf8');
const origin = 'https://shop.example.test';
const recipient = 'tester@example.test';
const config = { productPriceCents: 5000, stockOnHand: 100, maxQuantity: 1, shippingCents: 0, shippingConfirmed: true,
  bank: { accountName: 'TEST ACCOUNT ONLY', bsb: '012345', accountNumber: '00123456' },
  ownerEmail: 'owner@example.test', supportEmail: 'support@example.test' };

async function setup(t) {
  const DB = new SqliteD1(); await DB.exec(schema); t.after(() => DB.close());
  await DB.prepare('UPDATE settings SET value=?').bind(JSON.stringify(config)).run();
  await DB.prepare("UPDATE inventory SET stock_on_hand=100 WHERE mode='live'").run();
  const env = { DB, STORE_MODE: 'preview', LOCAL_PREVIEW: 'false', HOSTED_TEST_CHECKOUT: 'true',
    TEST_EMAILS_ENABLED: 'true', TEST_EMAIL_TO: recipient, PUBLIC_STORE_URL: origin,
    ACCESS_TEAM_DOMAIN: 'https://test-owner.cloudflareaccess.com', ACCESS_AUD: 'test-audience', OWNER_EMAILS: 'owner@example.test',
    RESEND_API_KEY: 'fake-never-real', EMAIL_FROM: 'Los Niños <orders@example.test>',
    ORDER_TOKEN_SECRET: 'test-token-secret-not-real-at-least-32-characters' };
  const sent = [];
  const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...await crypto.subtle.exportKey('jwk', keys.publicKey), kid: 'owner', use: 'sig', alg: 'RS256' };
  const state = { provider: async (_url, options) => {
    const payload = JSON.parse(options.body); sent.push({ payload, key: options.headers['Idempotency-Key'] });
    return Response.json({ id: 'message-' + sent.length });
  } };
  env.FETCH = async (url, options = {}) => {
    if (url === env.ACCESS_TEAM_DOMAIN + '/cdn-cgi/access/certs') return Response.json({ keys: [jwk] });
    if (url === 'https://api.resend.com/emails') return state.provider(url, options);
    assert.match(url, /^https:\/\/api\.resend\.com\/emails\/message-/);
    return Response.json({ last_event: 'delivered' });
  };
  const stamp = Math.floor(Date.now() / 1000);
  const raw = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'owner' })).toString('base64url') + '.' +
    Buffer.from(JSON.stringify({ iss: env.ACCESS_TEAM_DOMAIN, aud: env.ACCESS_AUD, iat: stamp, exp: stamp + 600, email: 'owner@example.test' })).toString('base64url');
  const token = raw + '.' + Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(raw))).toString('base64url');
  async function call(path, method = 'GET', body, authorized = true, headers = {}) {
    const result = await worker.fetch(new Request(origin + path, { method, headers: {
      ...(authorized ? { 'Cf-Access-Jwt-Assertion': token } : {}),
      ...(body ? { 'Content-Type': 'application/json', Origin: origin, 'X-Requested-With': 'LosNinos' } : {}), ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}) }), env, {});
    return { status: result.status, data: result.headers.get('content-type')?.includes('application/json') ? await result.json() : await result.text() };
  }
  const checkout = (overrides = {}) => ({ idempotencyKey: crypto.randomUUID(), catalogRevision: 1, quantity: 1,
    customer: { name: 'Test Buyer', email: recipient, phone: '' },
    shippingAddress: { line1: '1 Test Street', line2: '', suburb: 'Melbourne', state: 'VIC', postcode: '3000', country: 'AU' }, ...overrides });
  return { env, call, checkout, sent, state };
}

test('only authenticated owners can bootstrap or create an email test, and setup fails closed', async t => {
  const { env, call, checkout, sent } = await setup(t);
  assert.equal((await call('/api/admin/test-checkout', 'GET', undefined, false)).status, 403);
  assert.equal((await call('/api/admin/test-orders', 'POST', checkout(), false)).status, 403);
  const ready = await call('/api/admin/test-checkout');
  assert.equal(ready.data.catalog.acceptingOrders, true);
  assert.equal(ready.data.recipient, recipient);
  assert.equal(ready.data.catalog.product.priceCents, 5000);
  assert.equal(ready.data.catalog.shipping.feeCents, 0);
  for (const [key, value] of [['TEST_EMAILS_ENABLED', 'false'], ['TEST_EMAIL_TO', 'bad address'], ['TEST_EMAIL_TO', 'a@example.test,b@example.test'],
    ['RESEND_API_KEY', ''], ['EMAIL_FROM', 'onboarding@resend.dev'], ['STORE_MODE', 'live'], ['LOCAL_PREVIEW', 'true']]) {
    const previous = env[key]; env[key] = value;
    const result = await call('/api/admin/test-orders', 'POST', checkout());
    assert.equal(result.status, 503, `${key}: ${JSON.stringify(result)}`);
    env[key] = previous;
  }
  assert.equal(sent.length, 0);
});

test('normal public preview checkout cannot request test email or expose configured bank details', async t => {
  const { env, call, checkout, sent } = await setup(t);
  const result = await call('/api/orders', 'POST', checkout({ testDelivery: true, testEmailRecipient: recipient }), false);
  assert.equal(result.status, 201);
  assert.equal(result.data.order.testDelivery, undefined);
  assert.deepEqual(result.data.order.bank, { accountName: '', bsb: '', accountNumber: '' });
  await processOutbox(env);
  assert.equal(sent.length, 0);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE status='preview'").first()).n, 2);
});

test('test checkout binds both customer and owner email to the approved inbox and remains idempotent', async t => {
  const { env, call, checkout, sent } = await setup(t);
  const rejected = await call('/api/admin/test-orders', 'POST', checkout({ customer: { name: 'Test', email: 'owner@example.test' } }));
  assert.equal(rejected.status, 400);
  const body = checkout();
  const created = await call('/api/admin/test-orders', 'POST', body);
  const retry = await call('/api/admin/test-orders', 'POST', body);
  assert.equal(created.status, 201, JSON.stringify(created));
  assert.equal(retry.status, 200);
  assert.equal(created.data.token, retry.data.token);
  assert.equal(created.data.order.testDelivery, true);
  assert.equal(created.data.order.preview, true);
  assert.equal(created.data.order.testEmailRecipient, undefined);
  assert.equal(created.data.order.totalCents, 5000);
  assert.equal(created.data.order.bank.accountNumber, '00123456');
  assert.equal((await call(`/api/admin/orders/${created.data.order.id}`)).data.order.testEmailRecipient, recipient);
  const preview = await call(`/api/admin/email-preview/awaiting_payment?orderId=${created.data.order.id}`);
  assert.equal(preview.status, 200);
  assert.match(preview.data, /mailto:tester%40example\.test/);
  assert.doesNotMatch(preview.data, /owner@example\.test|support@example\.test/);
  await processOutbox(env);
  assert.equal(sent.length, 2);
  for (const { payload } of sent) {
    assert.deepEqual(payload.to, [recipient]); assert.equal(payload.reply_to, recipient);
    assert.equal(payload.cc, undefined); assert.equal(payload.bcc, undefined);
    assert.match(payload.subject, /^\[TEST\] /);
    assert.match(payload.text, /No payment is requested/);
    assert.match(payload.text, /\$50\.00 AUD/);
    assert.doesNotMatch(payload.text, /owner@example\.test|support@example\.test/);
  }
  assert.match(sent[0].payload.text, /00123456/);
  assert.equal((await env.DB.prepare("SELECT reserved FROM inventory WHERE mode='live'").first()).reserved, 0);
  assert.equal((await env.DB.prepare("SELECT reserved FROM inventory WHERE mode='preview'").first()).reserved, 1);
});

test('all four real-delivery test stages use the test inbox, then scheduled delivery checks work in preview', async t => {
  const { env, call, checkout, sent } = await setup(t);
  const created = await call('/api/admin/test-orders', 'POST', checkout());
  const id = created.data.order.id;
  await processOutbox(env);
  assert.equal((await call(`/api/admin/orders/${id}/status`, 'POST', { status: 'paid' })).status, 200);
  await processOutbox(env);
  assert.equal((await call(`/api/admin/orders/${id}/status`, 'POST', { status: 'shipped', trackingNumber: 'TEST-TRACKING' })).status, 200);
  await processOutbox(env);
  assert.equal(sent.length, 4);
  assert.ok(sent.every(item => item.payload.to.length === 1 && item.payload.to[0] === recipient && item.payload.reply_to === recipient));
  assert.match(sent[2].payload.text, /does not confirm a payment/);
  assert.match(sent[3].payload.text, /does not confirm a payment or a shipment/);
  assert.match(sent[3].payload.text, /https:\/\/auspost\.com\.au\/mypost\/track\/details\/TEST-TRACKING/);
  await worker.scheduled({}, env, {});
  const order = (await call(`/api/admin/orders/${id}`)).data.order;
  assert.ok(order.emails.every(message => message.status === 'delivered'));
  assert.equal((await env.DB.prepare("SELECT stock_on_hand FROM inventory WHERE mode='live'").first()).stock_on_hand, 100);
});

test('disabling or changing test recipient and enabling live mode cannot leak queued preview mail', async t => {
  const { env, call, checkout, sent } = await setup(t);
  await call('/api/admin/test-orders', 'POST', checkout());
  env.TEST_EMAIL_TO = 'different@example.test'; await processOutbox(env);
  env.TEST_EMAIL_TO = recipient; env.TEST_EMAILS_ENABLED = 'false'; await processOutbox(env);
  env.TEST_EMAILS_ENABLED = 'true'; env.STORE_MODE = 'live'; await processOutbox(env);
  assert.equal(sent.length, 0);
  env.STORE_MODE = 'preview'; await processOutbox(env);
  assert.equal(sent.length, 2);
});

test('the final send boundary rejects payload recipient, reply-to, CC/BCC and subject tampering', async t => {
  const { env, call, checkout, sent } = await setup(t);
  for (const patch of [{ to: ['owner@example.test'] }, { to: [recipient, 'owner@example.test'] }, { reply_to: 'owner@example.test' },
    { cc: ['owner@example.test'] }, { bcc: ['owner@example.test'] }, { subject: 'Unlabelled message' }]) {
    const created = await call('/api/admin/test-orders', 'POST', checkout());
    assert.equal(created.status, 201, JSON.stringify(created));
    const row = await env.DB.prepare("SELECT id,payload FROM email_outbox WHERE order_id=? AND kind='owner_order'").bind(created.data.order.id).first();
    await env.DB.prepare('UPDATE email_outbox SET payload=? WHERE id=?').bind(JSON.stringify({ ...JSON.parse(row.payload), ...patch }), row.id).run();
    await processOutbox(env);
    assert.equal((await env.DB.prepare('SELECT failure_code FROM email_outbox WHERE id=?').bind(row.id).first()).failure_code, 'test_recipient_guard');
  }
  assert.equal(sent.length, 6);
  assert.ok(sent.every(item => item.payload.to[0] === recipient));
});

test('test email retry uses the same provider idempotency key', async t => {
  const { env, call, checkout, sent, state } = await setup(t);
  await call('/api/admin/test-orders', 'POST', checkout());
  let first = true;
  state.provider = async (_url, options) => {
    sent.push({ payload: JSON.parse(options.body), key: options.headers['Idempotency-Key'] });
    if (first) { first = false; return Response.json({ name: 'internal_error' }, { status: 500 }); }
    return Response.json({ id: 'message-' + sent.length });
  };
  await processOutbox(env);
  await env.DB.prepare("UPDATE email_outbox SET next_attempt_at=0 WHERE status='queued'").run();
  await processOutbox(env);
  assert.equal(sent.length, 3);
  assert.equal(sent[0].key, sent[2].key);
});

test('an outbox row selected before test deletion cannot send after the deletion wins', async t => {
  const { env, call, checkout, sent } = await setup(t);
  const created = await call('/api/admin/test-orders', 'POST', checkout());
  const prepare = env.DB.prepare.bind(env.DB);
  let intercepted = false;
  env.DB.prepare = sql => {
    const prepared = prepare(sql);
    if (!sql.includes('SELECT e.*, o.mode')) return prepared;
    const bind = prepared.bind.bind(prepared);
    prepared.bind = (...params) => {
      const bound = bind(...params); const all = bound.all.bind(bound);
      bound.all = async () => {
        const selected = await all();
        if (!intercepted) {
          intercepted = true;
          const removed = await call(`/api/admin/orders/${created.data.order.id}`, 'DELETE', { updatedAt: created.data.order.updatedAt });
          assert.equal(removed.status, 200, JSON.stringify(removed));
        }
        return selected;
      };
      return bound;
    };
    return prepared;
  };
  await processOutbox(env);
  assert.equal(intercepted, true);
  assert.equal(sent.length, 0);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM email_outbox').first()).n, 0);
});

test('deleted email-test checkout cannot be recreated by a stale submit or confused with public preview', async t => {
  const { env, call, checkout, sent } = await setup(t);
  const body = checkout();
  const created = await call('/api/admin/test-orders', 'POST', body);
  const ordinary = await call('/api/orders', 'POST', body, false);
  assert.equal(ordinary.status, 201);
  assert.notEqual(ordinary.data.order.id, created.data.order.id);
  assert.equal(ordinary.data.order.testDelivery, undefined);
  const removed = await call(`/api/admin/orders/${created.data.order.id}`, 'DELETE', { updatedAt: created.data.order.updatedAt });
  assert.equal(removed.status, 200);
  const retry = await call('/api/admin/test-orders', 'POST', body);
  assert.equal(retry.status, 409);
  assert.equal(retry.data.code, 'test_order_deleted');
  await processOutbox(env);
  assert.equal(sent.length, 0);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM orders').first()).n, 1);
});

test('preview delivery cannot mutate live queued mail and does not release an active uncertain lease', async t => {
  const { env, call, checkout, sent } = await setup(t);
  const created = await call('/api/admin/test-orders', 'POST', checkout());
  const active = await env.DB.prepare('SELECT id FROM email_outbox WHERE order_id=? LIMIT 1').bind(created.data.order.id).first();
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare("UPDATE email_outbox SET status='sending',lease_until=?,ambiguous_at=? WHERE id=?").bind(now + 90, now - 24 * 3600, active.id).run();
  env.STORE_MODE = 'live'; env.LAUNCH_CONFIRMED = 'true';
  const live = await call('/api/orders', 'POST', checkout(), false);
  assert.equal(live.status, 201);
  await env.DB.prepare('UPDATE email_outbox SET ambiguous_at=? WHERE order_id=?').bind(now - 24 * 3600, live.data.order.id).run();
  env.STORE_MODE = 'preview';
  await processOutbox(env);
  const activeState = await env.DB.prepare('SELECT status,lease_until FROM email_outbox WHERE id=?').bind(active.id).first();
  assert.equal(activeState.status, 'sending'); assert.equal(activeState.lease_until, now + 90);
  const liveRows = (await env.DB.prepare('SELECT status FROM email_outbox WHERE order_id=?').bind(live.data.order.id).all()).results;
  assert.ok(liveRows.every(row => row.status === 'queued'));
  assert.equal(sent.length, 1);
});

test('quantity-tier quotes match both catalogs, receipts and delivered test email snapshots', async t => {
  const { env, call, checkout, sent } = await setup(t);
  const tierConfig = { ...config, productPriceCents: 3000, maxQuantity: 10, shippingCents: 2000,
    shippingTierFromQuantity: 4, shippingTierCents: 2500 };
  await env.DB.prepare('UPDATE settings SET value=?').bind(JSON.stringify(tierConfig)).run();
  const publicCatalog = await call('/api/catalog', 'GET', undefined, false);
  const testCatalog = await call('/api/admin/test-checkout');
  assert.deepEqual(testCatalog.data.catalog.shipping, publicCatalog.data.shipping);
  assert.deepEqual(publicCatalog.data.shipping, { country: 'AU', feeCents: 2000, tierFromQuantity: 4, tierFeeCents: 2500 });
  const three = await call('/api/admin/test-orders', 'POST', checkout({ quantity: 3, shippingQuoteCents: 2000 }));
  const fourBody = checkout({ quantity: 4, shippingQuoteCents: 2500 });
  const four = await call('/api/admin/test-orders', 'POST', fourBody);
  assert.equal(three.status, 201); assert.equal(four.status, 201);
  assert.equal(three.data.order.totalCents, 11000);
  assert.equal(four.data.order.shippingCents, 2500);
  assert.equal(four.data.order.totalCents, 14500);
  await env.DB.prepare('UPDATE settings SET value=?,revision=revision+1')
    .bind(JSON.stringify({ ...tierConfig, shippingTierCents: 3000 })).run();
  const recovered = await call('/api/admin/test-orders', 'POST', fourBody);
  assert.equal(recovered.status, 200);
  assert.equal(recovered.data.order.shippingCents, 2500);
  assert.equal(recovered.data.order.totalCents, 14500);
  await processOutbox(env);
  assert.equal(sent.length, 4);
  const fourMessages = sent.filter(({ payload }) => payload.subject.includes(four.data.order.reference));
  assert.equal(fourMessages.length, 2);
  assert.ok(fourMessages.every(({ payload }) => payload.text.includes('Shipping: $25.00 AUD') && payload.text.includes('Total: $145.00 AUD')));
  assert.ok(sent.every(({ payload }) => payload.to.length === 1 && payload.to[0] === recipient));
});
