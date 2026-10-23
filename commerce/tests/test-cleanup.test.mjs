import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import SqliteD1 from '../../scripts/d1-sqlite.mjs';
import worker from '../worker.mjs';

const schema = await readFile(new URL('../schema.sql', import.meta.url), 'utf8');
const migration = await readFile(new URL('../migrations/0001-test-order-cleanup.sql', import.meta.url), 'utf8');
const origin = 'http://127.0.0.1:8787';

async function setup(t) {
  const DB = new SqliteD1();
  await DB.exec(schema);
  await DB.prepare("UPDATE settings SET value=json_set(value,'$.maxQuantity',2)").run();
  await DB.prepare("UPDATE inventory SET stock_on_hand=17 WHERE mode='live'").run();
  t.after(() => DB.close());
  return { DB, STORE_MODE: 'preview', LOCAL_PREVIEW: 'true' };
}

async function call(env, path, method = 'GET', body, extraHeaders = {}, host = origin) {
  const request = new Request(host + path, { method,
    headers: { ...(body ? { 'Content-Type': 'application/json', Origin: host, 'X-Requested-With': 'LosNinos' } : {}), ...extraHeaders },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await worker.fetch(request, env, {});
  return { status: result.status, data: await result.json() };
}

async function place(env) {
  const body = { idempotencyKey: crypto.randomUUID(), catalogRevision: 1, quantity: 2,
    customer: { name: 'Cleanup Test', email: 'cleanup@example.test', phone: '' },
    shippingAddress: { line1: '10 Test Street', line2: '', suburb: 'Melbourne', state: 'VIC', postcode: '3000', country: 'AU' },
  };
  const result = await call(env, '/api/orders', 'POST', body);
  assert.equal(result.status, 201, JSON.stringify(result.data));
  return { ...result.data, body };
}

async function move(env, order, status) {
  const result = await call(env, `/api/admin/orders/${order.id}/status`, 'POST', {
    status, expectedUpdatedAt: order.updatedAt,
    ...(status === 'shipped' ? { trackingNumber: 'TEST123456' } : {}),
  });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return result.data.order;
}

const remove = (env, order) => call(env, `/api/admin/orders/${order.id}`, 'DELETE', { updatedAt: order.updatedAt });
const stock = (env, mode) => env.DB.prepare('SELECT stock_on_hand, reserved FROM inventory WHERE mode=?').bind(mode).first();
const count = async (env, table) => (await env.DB.prepare(`SELECT count(*) AS n FROM ${table}`).first()).n;

for (const status of ['awaiting_payment', 'paid', 'shipped', 'cancelled']) {
  test(`deleting a ${status} test order clears its data and restores only test inventory`, async t => {
    const env = await setup(t);
    const placed = await place(env);
    let order = placed.order;
    if (status === 'paid' || status === 'shipped') order = await move(env, order, 'paid');
    if (status === 'shipped' || status === 'cancelled') order = await move(env, order, status);
    const liveBefore = await stock(env, 'live');
    const result = await remove(env, order);
    assert.deepEqual(result, { status: 200, data: { ok: true, deletedId: order.id } });
    assert.deepEqual(await stock(env, 'preview'), { stock_on_hand: 10, reserved: 0 });
    assert.deepEqual(await stock(env, 'live'), liveBefore);
    for (const table of ['orders', 'order_history', 'email_outbox']) assert.equal(await count(env, table), 0, table);
    const tombstone = await env.DB.prepare('SELECT * FROM deleted_test_orders').first();
    assert.deepEqual(Object.keys(tombstone).sort(), ['deleted_at', 'idempotency_hash']);
    assert.match(tombstone.idempotency_hash, /^[a-f0-9]{64}$/);
    assert.equal((await call(env, `/api/orders/${order.id}`, 'GET', undefined, { 'X-Order-Token': placed.token })).status, 404);
    assert.deepEqual((await call(env, '/api/admin/orders')).data.orders, []);
  });
}

test('deletion keeps unrelated orders and their stock reservations intact', async t => {
  const env = await setup(t);
  const first = await place(env);
  const second = await place(env);
  assert.equal((await remove(env, first.order)).status, 200);
  assert.equal(await count(env, 'orders'), 1);
  assert.equal(await count(env, 'email_outbox'), 2);
  assert.equal(await count(env, 'order_history'), 1);
  assert.equal((await call(env, `/api/admin/orders/${second.order.id}`)).status, 200);
  assert.deepEqual(await stock(env, 'preview'), { stock_on_hand: 10, reserved: 2 });
});

test('deleted test checkout retries cannot recreate orders, mail or reservations', async t => {
  const env = await setup(t);
  const placed = await place(env);
  const originalRow = await env.DB.prepare('SELECT * FROM orders').first();
  assert.equal((await remove(env, placed.order)).status, 200);
  const retry = await call(env, '/api/orders', 'POST', placed.body);
  assert.equal(retry.status, 409);
  assert.equal(retry.data.code, 'test_order_deleted');
  assert.equal(await count(env, 'orders'), 0);
  assert.equal(await count(env, 'email_outbox'), 0);
  assert.deepEqual(await stock(env, 'preview'), { stock_on_hand: 10, reserved: 0 });

  // A retry that passed a preflight lookup before deletion must also fail inside
  // the insert transaction, including a direct insert with the same hashed key.
  const columns = Object.keys(originalRow);
  await assert.rejects(env.DB.prepare(`INSERT INTO orders(${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`)
    .bind(...columns.map(column => originalRow[column])).run(), /test_order_deleted/);
});

test('deletion requires owner access, same-origin headers and the current order version', async t => {
  const env = await setup(t);
  const placed = await place(env);
  const path = `/api/admin/orders/${placed.order.id}`;
  const body = { updatedAt: placed.order.updatedAt };
  assert.equal((await call(env, path, 'DELETE', body, {}, 'https://shop.example.test')).status, 403);
  for (const headers of [{ Origin: 'https://other.example' }, { 'X-Requested-With': '' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    assert.equal((await call(env, path, 'DELETE', body, headers)).status, 403);
  }
  assert.equal((await call(env, path, 'DELETE', {})).status, 400);
  assert.equal((await call(env, path, 'DELETE', { updatedAt: 'stale' })).status, 409);
  assert.equal(await count(env, 'orders'), 1);
  assert.equal(await count(env, 'email_outbox'), 2);
  assert.deepEqual(await stock(env, 'preview'), { stock_on_hand: 10, reserved: 2 });
});

test('a real order cannot be deleted even by an authenticated owner', async t => {
  const env = await setup(t);
  const placed = await place(env);
  const row = await env.DB.prepare('SELECT * FROM orders').first();
  const real = { ...row, id: crypto.randomUUID(), reference: 'LN-LIVE-TEST', mode: 'live', idempotency_hash: 'different-live-hash' };
  const columns = Object.keys(real);
  await env.DB.prepare(`INSERT INTO orders(${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`)
    .bind(...columns.map(column => real[column])).run();
  const result = await remove(env, { id: real.id, updatedAt: real.updated_at });
  assert.equal(result.status, 409);
  assert.equal(result.data.code, 'live_order_delete_forbidden');
  assert.equal(await count(env, 'orders'), 2);
  assert.deepEqual(await stock(env, 'live'), { stock_on_hand: 17, reserved: 2 });
  assert.equal((await call(env, `/api/admin/orders/${placed.order.id}`)).status, 200);
});

test('duplicate deletes release stock exactly once', async t => {
  const env = await setup(t);
  const placed = await place(env);
  const results = await Promise.all([remove(env, placed.order), remove(env, placed.order)]);
  assert.equal(results.filter(result => result.status === 200).length, 1);
  assert.ok(results.every(result => [200, 404, 409].includes(result.status)));
  assert.equal((await remove(env, placed.order)).status, 404);
  assert.deepEqual(await stock(env, 'preview'), { stock_on_hand: 10, reserved: 0 });
  assert.equal(await count(env, 'deleted_test_orders'), 1);
});

test('sending or an unexpired email lease blocks deletion, including needs-review attempts', async t => {
  const env = await setup(t);
  const placed = await place(env);
  const future = Math.floor(Date.now() / 1000) + 120;
  for (const [status, lease] of [['sending', 0], ['sending', future], ['needs_review', future]]) {
    await env.DB.prepare('UPDATE email_outbox SET status=?,lease_until=?').bind(status, lease).run();
    const result = await remove(env, placed.order);
    assert.equal(result.status, 409);
    assert.equal(result.data.code, 'email_in_progress');
    assert.equal(await count(env, 'orders'), 1);
    assert.equal(await count(env, 'deleted_test_orders'), 0);
    assert.deepEqual(await stock(env, 'preview'), { stock_on_hand: 10, reserved: 2 });
  }
  await env.DB.prepare("UPDATE email_outbox SET status='sent',lease_until=0").run();
  assert.equal((await remove(env, placed.order)).status, 200);
});

test('an email claimed between deletion preflight and its transaction is preserved', async t => {
  const env = await setup(t);
  const placed = await place(env);
  const batch = env.DB.batch.bind(env.DB);
  env.DB.batch = async statements => {
    env.DB.batch = batch;
    await env.DB.prepare("UPDATE email_outbox SET status='sending',lease_until=? WHERE order_id=?")
      .bind(Math.floor(Date.now() / 1000) + 120, placed.order.id).run();
    return batch(statements);
  };
  assert.equal((await remove(env, placed.order)).status, 409);
  assert.equal(await count(env, 'orders'), 1);
  assert.equal(await count(env, 'email_outbox'), 2);
  assert.equal(await count(env, 'deleted_test_orders'), 0);
  assert.deepEqual(await stock(env, 'preview'), { stock_on_hand: 10, reserved: 2 });
});

test('a status change between deletion preflight and its transaction is preserved', async t => {
  const env = await setup(t);
  const placed = await place(env);
  const batch = env.DB.batch.bind(env.DB);
  env.DB.batch = async statements => {
    env.DB.batch = batch;
    await env.DB.prepare("UPDATE orders SET status='cancelled',updated_at=? WHERE id=?")
      .bind(new Date(Date.now() + 1000).toISOString(), placed.order.id).run();
    return batch(statements);
  };
  assert.equal((await remove(env, placed.order)).status, 409);
  assert.equal((await env.DB.prepare('SELECT status FROM orders').first()).status, 'cancelled');
  assert.equal(await count(env, 'deleted_test_orders'), 0);
  assert.equal(await count(env, 'email_outbox'), 2);
  assert.deepEqual(await stock(env, 'preview'), { stock_on_hand: 10, reserved: 0 });
});

test('a cleanup failure rolls back stock, tombstones and every child deletion', async t => {
  const env = await setup(t);
  const placed = await place(env);
  const before = await env.DB.prepare('SELECT * FROM orders').first();
  await env.DB.exec("CREATE TRIGGER fail_cleanup BEFORE DELETE ON orders BEGIN SELECT RAISE(ABORT, 'simulated_failure'); END;");
  assert.equal((await remove(env, placed.order)).status, 500);
  assert.deepEqual(await env.DB.prepare('SELECT * FROM orders').first(), before);
  assert.equal(await count(env, 'order_history'), 1);
  assert.equal(await count(env, 'email_outbox'), 2);
  assert.equal(await count(env, 'deleted_test_orders'), 0);
  assert.deepEqual(await stock(env, 'preview'), { stock_on_hand: 10, reserved: 2 });
});

test('cleanup migration can be applied repeatedly without changing existing orders', async t => {
  const env = await setup(t);
  const placed = await place(env);
  const before = await env.DB.prepare('SELECT * FROM orders').first();
  // Model the deployed schema before this feature, then upgrade it with an
  // existing order rather than exercising only CREATE IF NOT EXISTS no-ops.
  await env.DB.exec('DROP TRIGGER orders_reject_deleted_test; DROP TABLE deleted_test_orders;');
  await env.DB.exec(migration);
  await env.DB.exec(migration);
  assert.deepEqual(await env.DB.prepare('SELECT * FROM orders').first(), before);
  assert.equal((await remove(env, placed.order)).status, 200);
});
