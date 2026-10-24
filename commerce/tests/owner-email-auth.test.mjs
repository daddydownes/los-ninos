import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import SqliteD1 from '../../scripts/d1-sqlite.mjs';
import worker, { processOutbox } from '../worker.mjs';
import { cleanupOwnerAuth } from '../email-auth.mjs';

const schema = await readFile(new URL('../schema.sql', import.meta.url), 'utf8');
const origin = 'https://shop.example.test';
const owner = 'owner@example.test';
async function setup(t) {
  const DB = new SqliteD1(); await DB.exec(schema); t.after(() => DB.close());
  const sent = [], pending = [];
  const env = { DB, OWNER_AUTH_MODE: 'email', OWNER_EMAILS: owner, OWNER_AUTH_SECRET: 'test-only-secret-at-least-thirty-two-characters',
    STORE_MODE: 'preview', LOCAL_PREVIEW: 'false', PUBLIC_STORE_URL: origin, RESEND_API_KEY: 'never-a-real-key', EMAIL_FROM: 'Los Niños <orders@example.test>',
    ASSETS: { fetch: async () => new Response('<html>owner workspace</html>', { headers: { 'Content-Type': 'text/html' } }) },
    FETCH: async (url, options) => { assert.equal(url, 'https://api.resend.com/emails'); assert.equal(options.redirect, 'manual'); sent.push(JSON.parse(options.body)); return Response.json({ id: 'message-' + sent.length }); } };
  async function call(path, { body, cookie, headers = {}, host = origin, method = body ? 'POST' : 'GET' } = {}) {
    const response = await worker.fetch(new Request(host + path, { method, headers: {
      ...(body ? { 'Content-Type': 'application/json', Origin: host, 'X-Requested-With': 'LosNinos', 'Sec-Fetch-Site': 'same-origin' } : {}),
      ...(cookie ? { Cookie: cookie } : {}), 'CF-Connecting-IP': '192.0.2.1', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) }), env,
    { waitUntil(task) { pending.push(task); } });
    await Promise.all(pending.splice(0));
    return { status: response.status, headers: response.headers, data: response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text() };
  }
  async function start(email = owner, headers = {}) {
    const result = await call('/api/owner-auth/request', { body: { email }, headers });
    return { ...result, cookie: result.headers.getSetCookie()[0]?.split(';')[0], code: sent.at(-1)?.text?.match(/code is (\d{6})/)?.[1] };
  }
  const verify = (challenge, code = challenge.code, cookie = challenge.cookie) => call('/api/owner-auth/verify', { body: { code }, cookie });
  return { env, sent, call, start, verify };
}
const session = result => result.headers.getSetCookie().find(value => value.startsWith('__Host-ln-owner='))?.split(';')[0];

test('approved owner receives a code; unknown addresses have the same response without mail or challenge storage', async t => {
  const { env, sent, start } = await setup(t);
  const known = await start(), unknown = await start('stranger@example.test');
  assert.equal(known.status, 200); assert.equal(unknown.status, 200); assert.deepEqual(known.data, unknown.data);
  assert.match(known.headers.getSetCookie()[0], /^__Host-ln-login=[a-f0-9]{64}; Path=\/; Max-Age=600; Secure; HttpOnly; SameSite=Strict$/);
  assert.equal(sent.length, 1); assert.deepEqual(sent[0].to, [owner]); assert.match(known.code, /^\d{6}$/);
  const rows = (await env.DB.prepare('SELECT * FROM owner_login_challenges').all()).results;
  assert.equal(rows.length, 1); assert.notEqual(rows[0].code_hash, known.code);
  assert.notEqual(rows[0].id_hash, known.cookie.split('=')[1]);
  assert.equal(known.headers.get('cache-control'), 'no-store');
});

test('owner auth fails closed for missing setup, wrong origin, alternate hosts and unexpected modes', async t => {
  const { env, call } = await setup(t);
  for (const [key, value] of [['OWNER_AUTH_SECRET', 'short'], ['OWNER_EMAILS', ''], ['RESEND_API_KEY', ''], ['OWNER_AUTH_MODE', 'unexpected']]) {
    const before = env[key]; env[key] = value;
    assert.equal((await call('/api/owner-auth/request', { body: { email: owner } })).status, 503, key); env[key] = before;
  }
  for (const headers of [{ Origin: 'https://other.example.test' }, { 'X-Requested-With': '' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    assert.equal((await call('/api/owner-auth/request', { body: { email: owner }, headers })).status, 403);
  }
  for (const host of ['http://shop.example.test', 'https://www.shop.example.test']) {
    assert.equal((await call('/api/owner-auth/request', { body: { email: owner }, host })).status, 503);
  }
  assert.equal((await call('/api/owner-auth/request', { body: { email: 'invalid' } })).status, 400);
});

test('sign-in protects every admin alias and grants only a secure session on the canonical host', async t => {
  const { call, start, verify } = await setup(t);
  for (const path of ['/admin', '/admin.html', '/admin/', '/%61dmin', '//admin.html']) {
    const denied = await call(path); assert.equal(denied.status, 303, path); assert.equal(denied.headers.get('location'), origin + '/owner-login');
  }
  for (const path of ['/api/admin/settings', '/api/%61dmin/orders', '/api//admin/orders']) assert.equal((await call(path)).status, 403, path);
  const signed = await verify(await start()); assert.equal(signed.status, 200);
  assert.match(signed.headers.getSetCookie()[0], /Max-Age=28800; Secure; HttpOnly; SameSite=Strict$/);
  const cookie = session(signed);
  assert.equal((await call('/admin', { cookie })).status, 200);
  const settings = await call('/api/admin/settings', { cookie }); assert.equal(settings.status, 200); assert.equal(settings.data.ownerAuthMode, 'email');
  assert.equal((await call('/api/admin/settings', { cookie, host: 'https://www.shop.example.test' })).status, 403);
  assert.equal((await call('/api/admin/settings', { cookie: cookie + '; ' + cookie })).status, 403);
});

test('five wrong guesses exhaust a challenge; a correct fifth guess still works', async t => {
  const { start, verify } = await setup(t);
  const first = await start(); const wrong = first.code === '111111' ? '222222' : '111111';
  for (let i = 0; i < 5; i++) assert.equal((await verify(first, wrong)).status, 400);
  assert.equal((await verify(first)).status, 400);
  const second = await start(); const wrong2 = second.code === '111111' ? '222222' : '111111';
  for (let i = 0; i < 4; i++) assert.equal((await verify(second, wrong2)).status, 400);
  assert.equal((await verify(second)).status, 200);
});

test('parallel verification, replay and duplicate challenge cookies cannot create another session', async t => {
  const { env, start, verify } = await setup(t); const challenge = await start();
  assert.equal((await verify(challenge, challenge.code, challenge.cookie + '; ' + challenge.cookie)).status, 400);
  const result = await Promise.all([verify(challenge), verify(challenge)]);
  assert.deepEqual(result.map(r => r.status).sort(), [200, 400]);
  assert.equal((await verify(challenge)).status, 400);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM owner_sessions').first()).n, 1);
});

test('expired challenges fail; revoked owners, rotated secrets and idle sessions lose access', async t => {
  const { env, call, start, verify } = await setup(t);
  const expired = await start(); await env.DB.prepare('UPDATE owner_login_challenges SET expires_at=0').run(); assert.equal((await verify(expired)).status, 400);
  const cookie = session(await verify(await start()));
  const secret = env.OWNER_AUTH_SECRET; env.OWNER_AUTH_SECRET += 'rotation'; assert.equal((await call('/api/admin/settings', { cookie })).status, 403); env.OWNER_AUTH_SECRET = secret;
  env.OWNER_EMAILS = 'different@example.test'; assert.equal((await call('/api/admin/settings', { cookie })).status, 403); env.OWNER_EMAILS = owner;
  await env.DB.prepare('UPDATE owner_sessions SET last_seen=0').run(); assert.equal((await call('/api/admin/settings', { cookie })).status, 403);
  await cleanupOwnerAuth(env); assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM owner_sessions').first()).n, 0);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM owner_login_challenges WHERE expires_at=0').first()).n, 0);
});

test('new sign-in rotates the existing session; logout revokes server access', async t => {
  const { env, call, start, verify } = await setup(t);
  const first = session(await verify(await start())); const next = await start();
  const second = session(await verify(next, next.code, next.cookie + '; ' + first));
  assert.equal((await call('/api/admin/settings', { cookie: first })).status, 403);
  assert.equal((await call('/api/admin/settings', { cookie: second })).status, 200);
  const loggedOut = await call('/api/owner-auth/logout', { body: {}, cookie: second }); assert.equal(loggedOut.status, 200);
  assert.equal((await call('/api/admin/settings', { cookie: second })).status, 403);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM owner_sessions').first()).n, 0);
});

test('owner email and IP request limits bound mail and database growth', async t => {
  const { env, sent, start } = await setup(t);
  for (let i = 0; i < 4; i++) assert.equal((await start()).status, 200);
  assert.equal(sent.length, 3);
  for (let i = 0; i < 6; i++) assert.equal((await start(`unknown${i}@example.test`)).status, 200);
  assert.equal((await start()).status, 429);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM owner_login_challenges').first()).n, 3);
});

test('a throttled resend preserves the browser challenge for a delayed valid email', async t => {
  const { call, start, verify, sent } = await setup(t);
  await start(); await start(); const pending = await start();
  const limited = await call('/api/owner-auth/request', { body: { email: owner }, cookie: pending.cookie });
  assert.equal(limited.status, 200); assert.equal(limited.headers.getSetCookie().length, 0); assert.equal(sent.length, 3);
  assert.equal((await verify(pending)).status, 200);
});

test('email-auth readiness opens normal bank-transfer orders with correct totals and no test wording', async t => {
  const { env, sent, call, start, verify } = await setup(t);
  const config = { productPriceCents: 3000, stockOnHand: 100, maxQuantity: 10, shippingCents: 2000, shippingTierFromQuantity: 4, shippingTierCents: 2500,
    shippingConfirmed: true, bank: { accountName: 'Unit Test Owner', bsb: '012345', accountNumber: '00123456' }, ownerEmail: owner, supportEmail: owner };
  await env.DB.prepare('UPDATE settings SET value=?').bind(JSON.stringify(config)).run();
  await env.DB.prepare("UPDATE inventory SET stock_on_hand=100 WHERE mode='live'").run();
  Object.assign(env, { STORE_MODE: 'live', LAUNCH_CONFIRMED: 'true', ORDER_TOKEN_SECRET: 'test-only-order-token-secret-minimum-thirty-two-characters' });
  const cookie = session(await verify(await start())); sent.length = 0;
  const settings = await call('/api/admin/settings', { cookie }); assert.deepEqual(settings.data.missingSetup, []);
  const catalog = await call('/api/catalog'); assert.equal(catalog.data.acceptingOrders, true); assert.equal(catalog.data.mode, 'live');
  for (const quantity of [1, 3, 4]) {
    const shippingQuoteCents = quantity < 4 ? 2000 : 2500;
    const placed = await call('/api/orders', { body: { quantity, catalogRevision: catalog.data.revision, shippingQuoteCents, idempotencyKey: crypto.randomUUID(),
      customer: { name: 'Example Buyer', email: 'buyer@example.test', phone: '0400000000' },
      shippingAddress: { line1: '1 Example Street', line2: '', suburb: 'Sydney', state: 'NSW', postcode: '2000', country: 'AU' } } });
    assert.equal(placed.status, 201, JSON.stringify(placed.data)); assert.equal(placed.data.order.preview, false);
    assert.equal(placed.data.order.totalCents, quantity * 3000 + shippingQuoteCents); assert.deepEqual(placed.data.order.bank, config.bank);
  }
  await processOutbox(env);
  assert.equal(sent.length, 6);
  for (const email of sent) { assert.doesNotMatch(email.subject + email.text, /\[TEST\]|preview only|test order|do not transfer/i); }
  const customerEmails = sent.filter(mail => mail.to.includes('buyer@example.test'));
  assert.equal(customerEmails.length, 3);
  for (const mail of customerEmails) { assert.match(mail.text, /00123456/); assert.match(mail.text, /012.?345/); }
  env.OWNER_AUTH_SECRET = ''; assert.equal((await call('/api/catalog')).data.acceptingOrders, false);
});
