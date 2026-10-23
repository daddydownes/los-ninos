import test from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../public/commerce.js';

test('checkout requests time out before headers and during a stalled JSON body without retrying a mutation', async (t) => {
  for (const phase of ['headers', 'body']) {
    await t.test(phase, async () => {
      let calls = 0;
      let observedSignal;
      const mock = t.mock.method(globalThis, 'fetch', async (_path, options) => {
        calls++;
        observedSignal = options.signal;
        const stalled = () => new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        });
        return phase === 'headers' ? stalled() : { ok: true, json: stalled };
      });
      try {
        await assert.rejects(api('/api/orders', {
          method: 'POST', body: JSON.stringify({ idempotencyKey: 'same-request' }), timeoutMs: 10,
        }), /connection took too long/i);
        assert.equal(calls, 1, 'An unknown order outcome must not trigger a second submission');
        assert.equal(observedSignal.aborted, true);
      } finally { mock.mock.restore(); }
    });
  }
});

test('successful JSON requests clear the deadline and keep same-origin no-store settings', async (t) => {
  let options;
  t.mock.method(globalThis, 'fetch', async (_path, value) => {
    options = value;
    return new Response(JSON.stringify({ acceptingOrders: true }), { headers: { 'Content-Type': 'application/json' } });
  });
  assert.deepEqual(await api('/api/catalog', { timeoutMs: 10 }), { acceptingOrders: true });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(options.signal.aborted, false);
  assert.equal(options.credentials, 'same-origin');
  assert.equal(options.cache, 'no-store');
  assert.equal(options.headers.get('Accept'), 'application/json');
});

test('quote conflict data survives client error handling so checkout can recover safely', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    error: 'Price or delivery options changed.', code: 'catalog_changed',
  }), { status: 409, headers: { 'Content-Type': 'application/json' } }));
  await assert.rejects(api('/api/orders', { method: 'POST', body: '{}' }), error => {
    assert.equal(error.status, 409);
    assert.equal(error.data.code, 'catalog_changed');
    return true;
  });
});
