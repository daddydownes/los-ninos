import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { money, text, announce } from '../public/commerce.js';

const stateSource = await readFile(new URL('../public/bag-state.js', import.meta.url), 'utf8');
const checkoutSource = (await readFile(new URL('../public/checkout.js', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '');
const quantityKey = 'los-ninos-preview-bag-v1';

function storage(values = new Map(), blocked = false) {
  return {
    values,
    getItem(key) { if (blocked) throw new Error('Storage denied'); return values.get(key) ?? null; },
    setItem(key, value) { if (blocked) throw new Error('Storage denied'); values.set(key, String(value)); },
    removeItem(key) { if (blocked) throw new Error('Storage denied'); values.delete(key); },
  };
}

function stateHarness(store = storage()) {
  const events = [];
  const context = vm.createContext({
    window: {}, sessionStorage: store, crypto: webcrypto,
    document: { dispatchEvent: event => events.push(event) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
  });
  vm.runInContext(stateSource, context);
  return { bag: context.window.LosNinosBagState, context, store, events };
}

test('bag migrates the legacy numeric quantity and keeps a stable revision across documents', () => {
  const store = storage(new Map([[quantityKey, '3']]));
  const first = stateHarness(store).bag.read();
  const second = stateHarness(store).bag.read();
  assert.equal(first.quantity, 3);
  assert.equal(first.revision, second.revision);
  assert.equal(store.getItem(quantityKey), '3');
});

test('successful checkout cannot clear a bag edited away and back to the same quantity', () => {
  const { bag } = stateHarness();
  const submitted = bag.setQuantity(3);
  bag.setQuantity(4);
  bag.setQuantity(3);
  assert.equal(bag.clearIfUnchanged(submitted), false);
  assert.equal(bag.read().quantity, 3);
  assert.equal(bag.clearIfUnchanged(bag.read()), true);
  assert.equal(bag.read().quantity, 0);
});

test('legacy writes are noticed and invalid quantities cannot enter shared state', () => {
  const { bag, store } = stateHarness();
  const submitted = bag.setQuantity(2);
  store.setItem(quantityKey, '4');
  assert.equal(bag.clearIfUnchanged(submitted), false);
  assert.equal(bag.read().quantity, 4);
  for (const value of [-1, 11, 1.5, NaN, '2']) assert.throws(() => bag.setQuantity(value), /integer/);
});

test('blocked storage preserves same-document bag operations and notifies only changes', () => {
  const { bag, events } = stateHarness(storage(new Map(), true));
  const selected = bag.setQuantity(3);
  bag.setQuantity(3);
  assert.equal(events.length, 1);
  assert.equal(bag.read().quantity, 3);
  assert.equal(bag.clearIfUnchanged(selected), true);
  assert.equal(events[1].type, 'ln:bag-state');
  assert.equal(events[1].detail.quantity, 0);
});

class Element {
  constructor(id, value = '') {
    this.id = id; this.value = value; this.textContent = ''; this.dataset = {};
    this.hidden = false; this.disabled = false; this.listeners = new Map(); this.attributes = {};
    this.style = { setProperty() {} }; this.classList = { toggle() {} };
  }
  addEventListener(type, handler) { this.listeners.set(type, [...(this.listeners.get(type) || []), handler]); }
  setAttribute(name, value) { this.attributes[name] = value; }
  replaceChildren(...children) { this.children = children; }
  focus() {}
  scrollIntoView() {}
  reportValidity() { return true; }
  async fire(type, event = { preventDefault() {} }) { for (const handler of this.listeners.get(type) || []) await handler(event); }
}

const defaultCatalog = {
  revision: 7, mode: 'preview', acceptingOrders: true,
  product: { name: 'OG Snapback', priceCents: 3000, maxQuantity: 5, available: 100 },
  shipping: { feeCents: 2000, tierFromQuantity: 4, tierFeeCents: 2500 },
};

async function checkoutHarness({ store = storage(), testCheckout = false, quantity = 3, navigation = 'navigate', historyState = null, catalogResponse = () => structuredClone(defaultCatalog), post = async () => ({ order: { id: 'demo-order' }, token: 'demo-private-token' }) } = {}) {
  const { bag, context } = stateHarness(store);
  const elements = new Map();
  const get = id => { if (!elements.has(id)) elements.set(id, new Element(id)); return elements.get(id); };
  for (const [id, value] of Object.entries({
    'customer-name': 'Sample Buyer', 'customer-email': 'buyer@example.test', 'customer-phone': '0400000000',
    'address-line1': '1 Example Street', 'address-line2': '', 'address-suburb': 'Sydney', 'address-state': 'NSW', 'address-postcode': '2000',
  })) get(id).value = value;
  get('checkout-form').querySelectorAll = () => [...elements.values()].filter(element => /^(customer|address)-/.test(element.id));
  const events = new Map();
  const calls = [];
  const location = { href: `http://127.0.0.1:8766/checkout.html?quantity=${quantity}${testCheckout ? '&test=1' : ''}`, assign(url) { this.destination = url; } };
  Object.defineProperty(location, 'search', { get() { return new URL(this.href).search; } });
  Object.assign(context, {
    document: { getElementById: get, querySelector: selector => get(selector), createElement: tag => new Element(tag), dispatchEvent() {} },
    history: { state: historyState, replaceState(state, _title, url) { this.state = state; location.href = String(url); } },
    location, URL, URLSearchParams, TextEncoder,
    performance: { getEntriesByType: () => [{ type: navigation }] },
    matchMedia: () => ({ matches: true }),
    api: async (path, options) => {
      if (path === '/api/catalog') return catalogResponse();
      if (path === '/api/admin/test-checkout') return { catalog: structuredClone(defaultCatalog), recipient: 'tests@example.test' };
      const body = JSON.parse(options.body);
      calls.push({ path, body });
      return post(body, calls.length);
    },
    money, text, announce,
  });
  context.window.addEventListener = (type, handler) => events.set(type, handler);
  vm.runInContext(checkoutSource, context);
  await new Promise(resolve => setImmediate(resolve));
  return { bag, get, store, calls, context, location, events, submit: () => get('checkout-form').fire('submit') };
}

test('checkout quantities sync to the bag, shipping re-reviews at four, success clears once', async () => {
  const app = await checkoutHarness();
  assert.equal(app.bag.read().quantity, 3);
  await app.get('quantity-plus').fire('click');
  assert.equal(app.bag.read().quantity, 4);
  assert.equal(new URL(app.location.href).searchParams.get('quantity'), '4');
  await app.submit();
  assert.equal(app.get('shipping-cost').textContent, '$25.00');
  assert.equal(app.get('total').dataset.value, '$145.00');
  await app.submit();
  assert.equal(app.calls.length, 1);
  assert.equal(app.calls[0].body.quantity, 4);
  assert.equal(app.bag.read().quantity, 0);
  assert.equal(app.context.history.state.lnCheckoutCompleted, true);
  await app.events.get('pageshow')({ persisted: true });
  await app.submit();
  assert.equal(app.calls.length, 1, 'Back from the receipt must not submit another order');
  assert.equal(app.bag.read().quantity, 0);
});

test('owner test checkout edits and success leave the customer bag unchanged', async () => {
  const store = storage();
  const before = stateHarness(store).bag.setQuantity(2);
  const app = await checkoutHarness({ store, testCheckout: true });
  await app.get('quantity-plus').fire('click');
  await app.submit();
  await app.submit();
  assert.equal(app.calls[0].path, '/api/admin/test-orders');
  assert.equal(app.bag.read().quantity, before.quantity);
  assert.equal(app.bag.read().revision, before.revision);
});

test('Back/Forward uses the current bag and never resurrects a removed bag', async () => {
  const store = storage();
  stateHarness(store).bag.setQuantity(4);
  const app = await checkoutHarness({ store, quantity: 2, navigation: 'back_forward' });
  assert.equal(Number(app.get('quantity').value), 4);
  app.bag.setQuantity(0);
  await app.events.get('pageshow')({ persisted: true });
  assert.equal(app.bag.read().quantity, 0);
  assert.equal(app.get('review-order').disabled, true);
  await app.submit();
  assert.equal(app.calls.length, 0);
});

for (const restoredQuantity of [2, 0]) {
  for (const restoration of ['back_forward', 'persisted']) {
    test(`${restoration} checkout keeps bag quantity ${restoredQuantity} after reload`, async () => {
      const store = storage();
      const previous = await checkoutHarness({ store, quantity: 5 });
      previous.bag.setQuantity(restoredQuantity);
      const restored = restoration === 'back_forward'
        ? await checkoutHarness({ store, quantity: 5, navigation: 'back_forward' })
        : previous;
      if (restoration === 'persisted') await restored.events.get('pageshow')({ persisted: true });
      assert.equal(Number(restored.get('quantity').value), restoredQuantity);
      const reloaded = await checkoutHarness({
        store, quantity: Number(new URL(restored.location.href).searchParams.get('quantity')),
        navigation: 'reload', historyState: restored.context.history.state,
      });
      assert.equal(reloaded.bag.read().quantity, restoredQuantity);
      assert.equal(Number(reloaded.get('quantity').value), restoredQuantity);
      assert.equal(reloaded.get('review-order').disabled, restoredQuantity === 0);
      assert.equal(reloaded.get('quantity').disabled, restoredQuantity === 0);
      if (restoredQuantity === 0) {
        await reloaded.submit();
        assert.equal(reloaded.calls.length, 0);
      }
    });
  }

  test(`restoring checkout before catalog completes preserves newer bag quantity ${restoredQuantity}`, async () => {
    const store = storage();
    stateHarness(store).bag.setQuantity(5);
    let resolveCatalog;
    const pendingCatalog = new Promise(resolve => { resolveCatalog = resolve; });
    const app = await checkoutHarness({ store, quantity: 5, catalogResponse: () => pendingCatalog });
    app.bag.setQuantity(restoredQuantity);
    await app.events.get('pageshow')({ persisted: true });
    assert.equal(Number(app.get('quantity').value), restoredQuantity, 'Restore before catalog readiness');
    assert.equal(app.get('review-order').disabled, true);
    resolveCatalog(structuredClone(defaultCatalog));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(app.bag.read().quantity, restoredQuantity);
    assert.equal(Number(app.get('quantity').value), restoredQuantity);
    assert.equal(app.get('review-order').disabled, restoredQuantity === 0);
    if (restoredQuantity === 0) {
      await app.submit();
      assert.equal(app.calls.length, 0);
    }
  });
}

test('a fresh checkout link still starts a new bag after the previous checkout was emptied', async () => {
  const store = storage();
  const previous = await checkoutHarness({ store, quantity: 5 });
  previous.bag.setQuantity(0);
  await previous.events.get('pageshow')({ persisted: true });
  const fresh = await checkoutHarness({ store, quantity: 2 });
  assert.equal(fresh.bag.read().quantity, 2);
  assert.equal(fresh.get('review-order').disabled, false);
});

for (const quantity of [5, 0]) {
  test(`reload preserves quantity ${quantity} when shared browser storage is blocked`, async () => {
    const store = storage(new Map(), true);
    const previous = await checkoutHarness({ store, quantity: 5 });
    if (quantity === 0) {
      previous.bag.setQuantity(0);
      await previous.events.get('pageshow')({ persisted: true });
    }
    const reloaded = await checkoutHarness({
      store, quantity: Number(new URL(previous.location.href).searchParams.get('quantity')),
      navigation: 'reload', historyState: previous.context.history.state,
    });
    assert.equal(Number(reloaded.get('quantity').value), quantity);
    assert.equal(reloaded.bag.read().quantity, quantity);
    assert.equal(reloaded.get('review-order').disabled, quantity === 0);
  });
}

test('an order cannot clear a newer bag edit made while its request key is hashing', async () => {
  const app = await checkoutHarness({ quantity: 5 });
  await app.submit();
  let releaseDigest;
  app.context.crypto = {
    randomUUID: () => webcrypto.randomUUID(),
    subtle: { async digest(...args) {
      await new Promise(resolve => { releaseDigest = resolve; });
      return webcrypto.subtle.digest(...args);
    } },
  };
  const submitting = app.submit();
  assert.equal(typeof releaseDigest, 'function', 'Pause at the asynchronous request-key boundary');
  app.bag.setQuantity(2);
  releaseDigest();
  await submitting;
  assert.equal(app.calls.length, 1);
  assert.equal(app.calls[0].body.quantity, 5);
  assert.equal(app.bag.read().quantity, 2, 'The old order must not clear the newer bag');
});

test('restored pending order recovery keeps its quantity and protects a newer bag', async () => {
  const store = storage();
  const previous = await checkoutHarness({ store, quantity: 5, post: async () => { throw new Error('Lost response'); } });
  await previous.submit(); await previous.submit();
  previous.bag.setQuantity(2);
  await previous.events.get('pageshow')({ persisted: true });
  assert.equal(Number(previous.get('quantity').value), 5);
  assert.equal(previous.bag.read().quantity, 2);
  const reloaded = await checkoutHarness({
    store, quantity: 5, navigation: 'reload', historyState: previous.context.history.state,
  });
  assert.equal(Number(reloaded.get('quantity').value), 5);
  assert.equal(reloaded.bag.read().quantity, 2);
  await reloaded.submit();
  assert.equal(reloaded.calls[0].body.idempotencyKey, previous.calls[0].body.idempotencyKey);
  assert.equal(reloaded.calls[0].body.quantity, 5);
  assert.equal(reloaded.bag.read().quantity, 2, 'Recovering the old order must not clear the newer bag');
});

test('ambiguous response locks editing and retries the original payload with the same key', async () => {
  const app = await checkoutHarness({ post: async (_body, count) => {
    if (count === 1) throw new Error('Connection lost after save');
    return { order: { id: 'original-order' }, token: 'original-token' };
  } });
  await app.submit();
  await app.submit();
  assert.equal(app.get('quantity').disabled, true);
  assert.equal(app.get('customer-name').disabled, true);
  assert.equal(app.get('submit-order').textContent, 'Check previous order');
  app.get('address-line1').value = 'Changed after request';
  await app.submit();
  assert.deepEqual(app.calls[0].body, app.calls[1].body);
  assert.equal(app.bag.read().quantity, 0);
});

test('reload of unknown order does not persist PII or allow changed details to create another key', async () => {
  const store = storage();
  const first = await checkoutHarness({ store, post: async () => { throw new Error('Lost response'); } });
  await first.submit(); await first.submit();
  const pending = JSON.parse(store.getItem('ln-checkout-pending-v1'));
  assert.equal(pending.pending, true);
  const serialized = JSON.stringify([...store.values]);
  assert.doesNotMatch(serialized, /Sample Buyer|buyer@example|Example Street/);
  const second = await checkoutHarness({ store });
  second.get('address-line1').value = 'Different address';
  await second.submit();
  assert.equal(second.calls.length, 0);
  assert.match(second.get('checkout-message').textContent, /original details/);
  assert.equal(JSON.parse(store.getItem('ln-checkout-pending-v1')).key, pending.key);
  second.get('address-line1').value = '1 Example Street';
  await second.submit();
  assert.equal(second.calls[0].body.idempotencyKey, pending.key);
});

test('confirmed stock rejection releases editing instead of trapping checkout in recovery', async () => {
  const app = await checkoutHarness({ post: async () => {
    const error = new Error('Quantity unavailable'); error.status = 409; error.data = { code: 'insufficient_stock' }; throw error;
  } });
  await app.submit(); await app.submit();
  assert.equal(app.get('quantity').disabled, false);
  assert.equal(app.get('customer-name').disabled, false);
  assert.equal(app.get('review-order').hidden, false);
  assert.equal(app.bag.read().quantity, 3);
});
