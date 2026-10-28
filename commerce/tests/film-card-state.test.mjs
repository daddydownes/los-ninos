import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const filmSource = await readFile(new URL('../../demo/film-storefront/film-motion.js', import.meta.url), 'utf8');
const bagSource = await readFile(new URL('../../demo/directions/pages/journey-bag.js', import.meta.url), 'utf8');

function section(source, start, end) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first);
  assert.ok(first >= 0 && last > first, `Cannot find source section: ${start}`);
  return source.slice(first, last);
}

// Execute the production card functions, quantity API, delegated click handler
// and bag-button accessibility render in one small DOM fixture. Video, drawer
// animation and catalog transport are outside these quantity regressions.
const cardSource = section(filmSource, '  function updateCard(', "  $('.card-less').onclick");
assert.match(cardSource, /function changeQuantity\(/);
const stateSource = section(bagSource, '    function allowedQuantity()', '    loadQuantity();');
const setterSource = section(bagSource, '    function setQuantity(', '    window.LosNinosBag =');
const clickSource = section(bagSource, "    document.addEventListener('click',", "    window.addEventListener('hashchange'");
const bagButtonRender = section(bagSource, "      document.querySelectorAll('[data-bag-open]')", "      document.querySelectorAll('[data-add-to-bag]')");

class Element {
  constructor() {
    this.textContent = ''; this.disabled = false; this.hidden = false;
    this.dataset = {}; this.attributes = new Map();
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  hasAttribute(name) { return this.attributes.has(name); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  toggleAttribute(name, force) { if (force) this.setAttribute(name, ''); else this.removeAttribute(name); }
  closest(selector) { return /^\[.*\]$/.test(selector) && this.hasAttribute(selector.slice(1, -1)) ? this : null; }
}

function cardHarness({ quantity = 0, available = 100, limit = 5, phase = 'ready', acceptingOrders = true, hasCatalog = true } = {}) {
  const elements = new Map();
  const get = selector => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  const button = get('[data-add-to-bag]');
  button.setAttribute('data-add-to-bag', '');
  button.setAttribute('data-add-quantity', '1');
  const clicks = new Map(), timers = new Map(), saved = [], announcements = [];
  let timerId = 0, opens = 0, retries = 0;
  const setup = {
    quantity, limit, phase,
    catalog: hasCatalog ? { acceptingOrders, product: { maxQuantity: limit, available, priceCents: 3000 } } : null,
  };
  const context = vm.createContext({
    setup, Element, Intl, window: {},
    document: {
      documentElement: { classList: { remove() {} } },
      querySelectorAll: selector => selector === '[data-bag-open]' && button.hasAttribute('data-bag-open') ? [button] : [],
      addEventListener: (name, callback) => clicks.set(name, callback),
      dispatchEvent() {},
    },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    $: get,
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: id => timers.delete(id),
    save: value => saved.push(value),
    announce: value => announcements.push(value),
    recordOpen: () => { opens++; },
    loadCatalog: () => { retries++; },
  });
  vm.runInContext(`
    let selected = 1, quantity = setup.quantity, limit = setup.limit;
    let checkoutCatalog = setup.catalog, catalogPhase = setup.phase, pendingAdd = null;
    const commerceEnabled = true, reducedMotion = { matches: false }, confirmationDuration = 1000;
    const dialog = { id: 'journey-bag' };
    ${stateSource}
    ${cardSource}
    function saveQuantity() { save(quantity); }
    function render() { ${bagButtonRender} updateCard(getState()); }
    function cancelPendingAdd() {
      if (!pendingAdd) return;
      clearTimeout(pendingAdd.timer);
      pendingAdd.trigger.removeAttribute('aria-disabled');
      pendingAdd.trigger.removeAttribute('data-bag-pending');
      pendingAdd = null; render();
    }
    function open() { cancelPendingAdd(); recordOpen(); }
    ${setterSource}
    window.LosNinosBag = { getState, setQuantity };
    ${clickSource}
    render();
  `, context);
  return {
    get, button, saved, announcements,
    state: () => context.window.LosNinosBag.getState(),
    setQuantity: value => context.window.LosNinosBag.setQuantity(value),
    change: delta => vm.runInContext(`changeQuantity(${delta})`, context),
    click: () => clicks.get('click')({ target: button, preventDefault() {} }),
    finishConfirmation() { for (const [id, callback] of [...timers]) { timers.delete(id); callback(); } },
    remove() { vm.runInContext('quantity = 0; saveQuantity(); render();', context); },
    opens: () => opens, retries: () => retries,
  };
}

test('adding two then opening View bag never adds the displayed total again', () => {
  const app = cardHarness();
  app.change(1);
  assert.equal(app.get('.card-quantity').textContent, 2);
  assert.equal(app.state().quantity, 0, 'Initial selector has not yet added hats');
  app.click();
  assert.equal(app.state().quantity, 2);
  assert.equal(app.state().pending, true);
  assert.equal(app.button.disabled, true);
  assert.equal(app.button.hasAttribute('data-bag-open'), false);
  app.click();
  assert.equal(app.state().quantity, 2, 'Rapid repeated add is ignored');
  app.finishConfirmation();
  assert.equal(app.opens(), 1);
  assert.equal(app.button.hasAttribute('data-bag-open'), true);
  assert.equal(app.get('.add-label').textContent, 'View bag · $60');
  app.click();
  assert.equal(app.opens(), 2);
  assert.equal(app.state().quantity, 2);
  assert.deepEqual(app.saved, [2]);
});

test('card shows and edits the existing bag, including the five-hat boundary', () => {
  const app = cardHarness({ quantity: 5 });
  assert.equal(app.get('.card-quantity').textContent, 5);
  assert.equal(app.get('.card-stepper').hidden, false);
  assert.equal(app.get('.quantity-label').textContent, 'In your bag');
  assert.equal(app.get('.card-more').disabled, true);
  app.change(1);
  assert.equal(app.state().quantity, 5);
  app.change(-1);
  assert.equal(app.state().quantity, 4);
  assert.equal(app.get('.card-quantity').textContent, 4);
  assert.equal(app.get('.add-label').textContent, 'View bag · $120');
  app.change(1);
  assert.equal(app.state().quantity, 5);
  app.click();
  assert.equal(app.state().quantity, 5);
});

test('an oversized restored bag can decrease to stock without increasing further', () => {
  const app = cardHarness({ quantity: 5, available: 2 });
  assert.equal(app.get('.card-less').disabled, false);
  assert.equal(app.get('.card-more').disabled, true);
  app.change(-1);
  assert.equal(app.state().quantity, 4);
  app.change(1);
  assert.equal(app.state().quantity, 4, 'Stock shortage cannot increase an oversized bag');
  app.change(-1); app.change(-1);
  assert.equal(app.state().quantity, 2);
  assert.equal(app.get('.card-more').disabled, true);
  assert.deepEqual(app.saved, [4, 3, 2]);
});

test('quantity API rejects invalid values and edits during add confirmation', () => {
  const app = cardHarness();
  for (const value of [-1, 0, 1.5, NaN, '2', 6]) assert.equal(app.setQuantity(value), false);
  app.click();
  assert.equal(app.state().quantity, 1);
  assert.equal(app.setQuantity(2), false);
  assert.equal(app.state().quantity, 1);
  app.finishConfirmation();
  assert.equal(app.setQuantity(2), true);
});

for (const condition of [{ phase: 'loading' }, { phase: 'error' }, { acceptingOrders: false }]) {
  test(`unready catalog prevents bag edits: ${JSON.stringify(condition)}`, () => {
    const app = cardHarness({ quantity: 2, ...condition });
    assert.equal(app.get('.card-less').disabled, true);
    assert.equal(app.get('.card-more').disabled, true);
    assert.equal(app.setQuantity(3), false);
    assert.equal(app.state().quantity, 2);
  });
}

test('stock zero blocks adding; failed empty catalog offers a deliberate retry', () => {
  const soldOut = cardHarness({ available: 0 });
  assert.equal(soldOut.button.disabled, true);
  assert.equal(soldOut.get('.card-stepper').hidden, true);
  soldOut.click();
  assert.equal(soldOut.state().quantity, 0);
  const offline = cardHarness({ phase: 'error', hasCatalog: false });
  assert.equal(offline.button.disabled, false);
  assert.equal(offline.get('.add-label').textContent, 'Retry availability');
  offline.click();
  assert.equal(offline.retries(), 1);
  assert.equal(offline.state().quantity, 0);
});

test('saved bag can open after a catalog error without displaying a missing price', () => {
  const app = cardHarness({ quantity: 3, phase: 'error', hasCatalog: false });
  assert.equal(app.get('.add-label').textContent, 'View bag');
  assert.equal(app.button.disabled, false);
  app.click();
  assert.equal(app.opens(), 1);
  assert.equal(app.state().quantity, 3);
});

test('removing all hats restores the Add action and its accessible name', () => {
  const app = cardHarness({ quantity: 3 });
  app.remove();
  assert.equal(app.button.hasAttribute('data-bag-open'), false);
  assert.match(app.get('.add-label').textContent, /^Add/);
  assert.equal(app.button.getAttribute('aria-label'), app.get('.add-label').textContent);
  assert.doesNotMatch(app.button.getAttribute('aria-label'), /Open bag/);
  app.click();
  assert.equal(app.state().quantity, Number(app.button.dataset.addQuantity));
  assert.equal(app.opens(), 0, 'Add confirmation runs before opening the bag');
});
