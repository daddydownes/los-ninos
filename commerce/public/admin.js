const $ = (selector, parent = document) => parent.querySelector(selector);
const state = { orders: [], selectedId: null, order: null, settings: null, settingsEditable: false, testCheckout: null, listRequest: 0, detailRequest: 0, busy: false };
const statuses = { awaiting_payment: 'Awaiting payment', paid: 'Paid — ready to pack', shipped: 'Shipped', cancelled: 'Cancelled' };
const emailKinds = { awaiting_payment: 'Payment instructions', paid: 'Payment confirmation', shipped: 'Shipping confirmation', owner: 'Owner notification', owner_order: 'Owner notification' };
const emailStatusLabels = { queued: 'Queued', sending: 'Sending', sent: 'Sent · delivery pending', delivered: 'Delivered', failed: 'Failed', bounced: 'Bounced', complained: 'Marked as spam', needs_review: 'Needs review', preview: 'Preview only', cancelled: 'Cancelled' };
const emailNeedsAttention = email => ['failed', 'bounced', 'complained', 'needs_review'].includes(email.status);
const money = (cents, placeholder = 'To be set') => cents === null || cents === undefined || !Number.isFinite(Number(cents)) ? placeholder : new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(cents) / 100);
const date = (value) => { const parsed = new Date(value); return value && !Number.isNaN(parsed.getTime()) ? parsed.toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Date unavailable'; };
const element = (tag, className, content) => { const node = document.createElement(tag); if (className) node.className = className; if (content !== undefined) node.textContent = String(content); return node; };
const notice = (message, isError = false) => { const node = $('#admin-message'); node.textContent = message; node.hidden = !message; node.classList.toggle('notice-error', isError); };

async function api(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = { Accept: 'application/json', ...options.headers };
  if (!['GET', 'HEAD'].includes(method)) headers['X-Requested-With'] = 'LosNinos';
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 15_000);
  try {
    let response, data, isJson;
    try {
      response = await fetch(path, { ...options, method, credentials: 'same-origin', cache: 'no-store', headers, signal: controller.signal, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
      isJson = (response.headers.get('content-type') || '').includes('application/json');
      data = isJson ? await response.json() : null;
    } catch {
      throw new Error(controller.signal.aborted ? 'The connection took too long. Refresh the order to check its latest status before trying again.' : 'We could not connect. Check your connection and try again.');
    }
    if (!response.ok || !isJson) {
      if (response.status === 401 || response.status === 403) $('#owner-signin').hidden = false;
      const message = response.status === 401 || response.status === 403
        ? 'Your owner session has expired or you do not have access. Sign in with the approved owner email and try again.'
        : !isJson ? 'The order dashboard is not connected here. Open the configured owner dashboard to manage orders.'
        : typeof data?.error === 'string' ? data.error : data?.error?.message || data?.message || 'We could not complete that action. Please try again.';
      const error = new Error(message); error.status = response.status; throw error;
    }
    return data;
  } finally {
    clearTimeout(deadline);
  }
}

function pill(status) { return element('span', `pill admin-pill-${Object.hasOwn(statuses, status) ? status : 'cancelled'}`, statuses[status] || status || 'Unknown status'); }
function fact(label, value, isTotal = false) { const row = element('div', `admin-fact${isTotal ? ' admin-fact-total' : ''}`); row.append(element('dt', '', label), element('dd', '', value)); return row; }
function section(title) { const node = element('section', 'admin-detail-section'); node.append(element('h3', '', title)); return node; }
function button(label, handler, classes = 'button button-secondary button-small') { const node = element('button', classes, label); node.type = 'button'; node.addEventListener('click', handler); return node; }
function field(label, name, type = 'text', value = '') { const wrap = element('div', 'field'); const labelNode = element('label', '', label); const input = element(type === 'textarea' ? 'textarea' : 'input'); input.id = `action-${name}`; input.name = name; if (type !== 'textarea') input.type = type; input.value = value; labelNode.htmlFor = input.id; wrap.append(labelNode, input); return { wrap, input }; }
function checkbox(label, name) { const wrap = element('label', 'admin-checkbox'); const input = element('input'); input.type = 'checkbox'; input.name = name; input.required = true; wrap.append(input, element('span', '', label)); return { wrap, input }; }

async function loadOrders({ quiet = false } = {}) {
  const request = ++state.listRequest;
  $('#order-list-region').setAttribute('aria-busy', 'true');
  if (!quiet) notice('');
  try {
    const params = new URLSearchParams();
    if ($('#order-status').value) params.set('status', $('#order-status').value);
    if ($('#order-search').value.trim()) params.set('q', $('#order-search').value.trim());
    const result = await api(`/api/admin/orders?${params}`);
    if (request !== state.listRequest) return;
    state.orders = Array.isArray(result.orders) ? result.orders : [];
    renderOrderList();
    return true;
  } catch (error) {
    if (request !== state.listRequest) return;
    notice(error.message, true);
    $('#order-list').replaceChildren(element('p', 'admin-empty muted', 'Orders could not be loaded. Your existing orders have not changed.'));
    $('#order-count').textContent = '';
    return false;
  } finally { if (request === state.listRequest) $('#order-list-region').setAttribute('aria-busy', 'false'); }
}

function renderOrderList() {
  const list = $('#order-list');
  list.replaceChildren();
  $('#order-count').textContent = `(${state.orders.length})`;
  if (!state.orders.length) {
    list.append(element('p', 'admin-empty muted', !$('#order-search').value && $('#order-status').value === 'active' ? 'All caught up. New orders that need payment or packing will appear here.' : $('#order-search').value || $('#order-status').value ? 'No orders match these filters.' : 'No orders yet. New orders will appear here.'));
    return;
  }
  for (const order of state.orders) {
    const card = button('', () => loadOrder(order.id), 'admin-order-card');
    card.setAttribute('aria-pressed', String(state.selectedId === order.id));
    const person = element('div', 'admin-order-person');
    person.append(element('strong', 'admin-order-card-name', order.customer?.name || 'Customer'), element('span', 'admin-order-meta', `${order.quantity} ${order.quantity === 1 ? 'hat' : 'hats'} · ${order.reference || order.id}`));
    const amount = element('strong', 'admin-order-amount', money(order.totalCents, 'Pending shipping'));
    const arrow = element('span', 'admin-order-arrow', '→'); arrow.setAttribute('aria-hidden', 'true');
    card.append(person, pill(order.status), amount, arrow);
    if (order.preview) card.append(element('p', 'admin-order-card-preview', order.testDelivery ? 'Email test order' : 'Preview order'));
    if (Array.isArray(order.emails) && order.emails.some(emailNeedsAttention)) card.append(element('p', 'admin-email-warning', 'Email needs attention'));
    list.append(card);
  }
}

async function loadOrder(id, { focus = true } = {}) {
  if (state.busy) return;
  const request = ++state.detailRequest;
  const panel = $('#order-detail');
  panel.setAttribute('aria-busy', 'true');
  notice('');
  try {
    const result = await api(`/api/admin/orders/${encodeURIComponent(id)}`);
    if (request !== state.detailRequest) return;
    state.order = result.order;
    state.selectedId = id;
    renderOrderList();
    renderOrderDetail();
    $('#admin-main').classList.add('is-reading-order');
    if (focus) { panel.focus({ preventScroll: true }); panel.scrollIntoView({ behavior: 'auto', block: 'start' }); }
  } catch (error) { if (request === state.detailRequest) notice(error.message, true); }
  finally { if (request === state.detailRequest) panel.removeAttribute('aria-busy'); }
}

function renderOrderDetail() {
  const order = state.order;
  const panel = $('#order-detail');
  panel.replaceChildren();
  panel.append(button('← Back to orders', () => {
    if (state.busy) return;
    $('#admin-main').classList.remove('is-reading-order');
    $('.admin-order-card[aria-pressed=true]')?.focus({ preventScroll: true });
    $('#order-list-region').scrollIntoView({ behavior: 'auto', block: 'start' });
  }, 'admin-back-to-orders'));
  const top = element('div', 'admin-detail-top');
  const heading = element('div');
  heading.append(element('h2', '', order.reference || order.id), element('p', 'muted', `Received ${date(order.createdAt)}`));
  top.append(heading, pill(order.status)); panel.append(top);
  if (order.preview) panel.append(element('p', 'admin-small muted', order.testDelivery ? `Email test order — no payment is required. Test emails go to ${order.testEmailRecipient || 'the configured test inbox'}.` : 'Preview order — no customer payment is requested.'));
  const summary = section('The order');
  const product = element('div', 'admin-product-line');
  const productDescription = element('div');
  productDescription.append(element('p', '', order.productName || 'OG Snapback'), element('p', 'muted', `Quantity ${order.quantity} · ${money(order.unitPriceCents)} each`));
  product.append(productDescription); summary.append(product);
  const facts = element('dl', 'admin-facts');
  facts.append(fact('Shipping', order.shippingCents === 0 ? 'Free' : money(order.shippingCents, 'To be determined')), fact('Total (AUD)', money(order.totalCents, typeof order.unitPriceCents === 'number' ? 'Pending shipping' : 'To be set'), true));
  summary.append(facts); panel.append(summary);
  const contact = element('details', 'admin-detail-disclosure'); contact.append(element('summary', '', 'Customer & delivery'));
  const columns = element('div', 'admin-contact-columns');
  const customer = element('div'); customer.append(element('h3', '', 'Customer'), element('p', '', order.customer?.name || 'Not provided'));
  if (order.customer?.email) { const p = element('p'); const link = element('a', '', order.customer.email); link.href = `mailto:${order.customer.email}`; p.append(link); customer.append(p); }
  if (order.customer?.phone) customer.append(element('p', '', order.customer.phone));
  const address = element('div'); address.append(element('h3', '', 'Ship to'));
  const shipping = order.shippingAddress || {};
  address.append(element('address', '', [order.customer?.name, shipping.line1, shipping.line2, [shipping.suburb, shipping.state, shipping.postcode].filter(Boolean).join(' '), shipping.country === 'AU' ? 'Australia' : shipping.country || 'Australia'].filter(Boolean).join('\n')));
  columns.append(customer, address); contact.append(columns); panel.append(contact);
  const bank = element('details', 'admin-disclosure'); bank.append(element('summary', '', 'Payment details supplied to this customer'));
  const bankFacts = element('dl', 'admin-facts'); bankFacts.append(fact('Account name', order.bank?.accountName || 'To be set'), fact('BSB', order.bank?.bsb || 'To be set'), fact('Account number', order.bank?.accountNumber || 'To be set'), fact('Reference', order.reference)); bank.append(bankFacts); panel.append(bank);
  if (order.trackingNumber) { const tracking = section('Tracking'); tracking.append(element('p', 'admin-small', order.trackingNumber)); panel.append(tracking); }
  const actions = section('Next step'); const buttons = element('div', 'admin-action-buttons');
  if (order.status === 'awaiting_payment') buttons.append(button(order.preview ? 'Confirm test payment' : 'Confirm payment', () => showAction('paid'), 'button button-small'));
  if (order.status === 'paid') buttons.append(button(order.preview ? 'Test shipping step' : 'Mark as shipped', () => showAction('shipped'), 'button button-small'));
  if (order.status === 'awaiting_payment') buttons.append(button('Cancel order', () => showAction('cancelled'), 'button button-secondary button-small admin-danger-button'));
  if (!buttons.childElementCount) actions.append(element('p', 'admin-small muted', order.status === 'cancelled' ? 'This unpaid order is cancelled. Its reserved stock has been released.' : 'This order has been marked as shipped.'));
  else actions.append(buttons);
  const actionSlot = element('div'); actionSlot.id = 'order-action'; actions.append(actionSlot); panel.insertBefore(actions, contact);
  const emails = element('details', 'admin-detail-disclosure'); const emailList = element('div', 'admin-email-list');
  const emailRecords = Array.isArray(order.emails) ? order.emails : Object.entries(order.emails || {}).map(([kind, value]) => typeof value === 'object' && value ? { ...value, kind: value.kind || kind } : { kind, status: value });
  const problems = emailRecords.filter(emailNeedsAttention).length;
  const emailHeading = element('summary');
  emailHeading.append(element('span', '', 'Emails'), element('span', problems ? 'admin-email-warning' : 'muted', problems ? `${problems} need attention` : `${emailRecords.length} ${emailRecords.length === 1 ? 'message' : 'messages'}`));
  emails.append(emailHeading);
  emails.open = problems > 0;
  for (const email of emailRecords) { const row = element('div', `admin-email-item${emailNeedsAttention(email) ? ' has-error' : ''}`); row.append(element('span', '', emailKinds[email.kind] || email.kind || 'Email'), element('span', '', emailStatusLabels[email.status] || email.status || 'Queued')); emailList.append(row); }
  if (!emailRecords.length) emailList.append(element('p', 'admin-small muted', 'No email delivery events recorded yet.'));
  emails.append(emailList);
  if (['awaiting_payment', 'paid', 'shipped'].includes(order.status)) {
    const emailActions = element('div', 'admin-action-buttons');
    const preview = element('a', 'button button-secondary button-small', 'Preview customer email');
    preview.href = `/api/admin/email-preview/${encodeURIComponent(order.status)}?orderId=${encodeURIComponent(order.id)}`; preview.target = '_blank'; preview.rel = 'noopener';
    emailActions.append(preview, button(order.preview ? order.testDelivery ? 'Resend test email' : 'Test email retry' : `Resend ${emailKinds[order.status].toLowerCase()}`, () => resendEmail(order))); emails.append(emailActions);
  }
  emails.append(element('p', 'admin-small muted', order.preview && !order.testDelivery ? 'Preview emails are saved for testing only. No emails are sent.' : 'Sent means the email service accepted it. Delivery to an inbox can take longer.'));
  panel.append(emails);
  const history = element('details', 'admin-detail-disclosure'); history.append(element('summary', '', 'Order history')); const timeline = element('ol', 'admin-history');
  for (const item of Array.isArray(order.history) ? order.history : []) {
    const row = element('li'); const label = item.message || item.action || statuses[item.status] || item.type || 'Order updated'; row.append(element('span', '', label));
    const when = element('time', '', date(item.createdAt || item.at || item.timestamp)); if (item.createdAt || item.at || item.timestamp) when.dateTime = item.createdAt || item.at || item.timestamp; row.append(when);
    if (item.note) row.append(element('p', '', item.note)); timeline.append(row);
  }
  if (!timeline.childElementCount) timeline.append(element('li', 'muted', `Order received ${date(order.createdAt)}`));
  history.append(timeline); panel.append(history);
  if (order.preview) {
    const cleanup = section('Test cleanup');
    cleanup.append(element('p', 'admin-small muted', 'Finished testing? Remove this test order and restore any test stock it used.'));
    cleanup.append(button('Delete test order', () => showDeleteTestOrder(order), 'button button-secondary button-small admin-danger-button'));
    const slot = element('div'); slot.id = 'test-cleanup-action'; cleanup.append(slot); panel.append(cleanup);
  }
}

function showDeleteTestOrder(order) {
  if (state.busy || !order.preview || state.selectedId !== order.id) return;
  const slot = $('#test-cleanup-action');
  const form = element('form', 'admin-action-form');
  const title = element('h4', '', `Delete ${order.reference}?`); title.id = 'delete-test-title';
  form.setAttribute('aria-labelledby', title.id);
  form.append(title, element('p', '', 'This permanently removes this test order, its saved history and email records. Any test stock it used is restored. Emails already delivered stay in their inboxes.'));
  const confirmed = checkbox('I am finished testing this order and want to delete it.', 'deleteConfirmed'); form.append(confirmed.wrap);
  const buttons = element('div', 'admin-action-buttons');
  const submit = element('button', 'button button-secondary button-small admin-danger-button', 'Delete this test order'); submit.type = 'submit';
  buttons.append(submit, button('Keep order', () => { slot.replaceChildren(); $('#order-detail').focus({ preventScroll: true }); })); form.append(buttons);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (state.busy || !form.reportValidity()) return;
    state.busy = true; form.setAttribute('aria-busy', 'true'); [...form.elements].forEach(node => { node.disabled = true; }); submit.textContent = 'Deleting…'; notice('');
    let removed = false;
    try {
      await api(`/api/admin/orders/${encodeURIComponent(order.id)}`, { method: 'DELETE', body: { updatedAt: order.updatedAt } });
      removed = true;
    } catch (error) {
      if (error.status === 404) removed = true;
      else notice(error.message, true);
    }
    if (removed) {
      // Invalidate earlier reads so they cannot restore a deleted card or detail.
      state.listRequest++; state.detailRequest++; state.selectedId = null; state.order = null;
      $('#admin-main').classList.remove('is-reading-order');
      state.orders = state.orders.filter(item => item.id !== order.id); renderOrderList();
      const panel = $('#order-detail'); panel.replaceChildren();
      const empty = element('div', 'admin-detail-empty'); empty.append(element('h2', '', 'Test order removed.'), element('p', 'muted', 'Choose another order to continue.')); panel.append(empty);
      const refreshed = await loadOrders({ quiet: true });
      notice(refreshed ? 'Test order deleted. Its test stock has been restored where needed.' : 'Test order deleted, but the list could not be refreshed. Use Refresh to load the remaining orders.', !refreshed);
      $('#refresh-orders').focus({ preventScroll: true });
    } else {
      form.removeAttribute('aria-busy'); [...form.elements].forEach(node => { node.disabled = false; }); submit.textContent = 'Delete this test order';
    }
    state.busy = false;
  });
  slot.replaceChildren(form); confirmed.input.focus({ preventScroll: true });
}

function showAction(status) {
  if (state.busy) return;
  const order = state.order;
  const slot = $('#order-action');
  const form = element('form', 'admin-action-form');
  const titles = order.preview
    ? { paid: 'Test payment confirmation', shipped: 'Test the shipping step', cancelled: 'Cancel this test order?' }
    : { paid: 'Has the money arrived?', shipped: 'Ready to send?', cancelled: 'Cancel this order?' };
  form.append(element('h4', '', titles[status]));
  if (status === 'paid') form.append(element('p', '', order.preview ? `This simulates confirming a payment. Do not make a bank transfer. ${order.testDelivery ? 'A payment-confirmation email will go to the test inbox.' : 'No customer email will be sent.'}` : `Check your bank account for ${money(order.totalCents)} with reference ${order.reference}. A customer screenshot alone does not confirm payment.`));
  if (status === 'shipped') form.append(element('p', '', order.preview ? `No parcel is sent. ${order.testDelivery ? 'A dispatch-confirmation email will go to the test inbox.' : 'No customer email will be sent.'}` : 'The customer will receive a dispatch confirmation. Send their tracking number separately by text.'));
  if (status === 'cancelled') form.append(element('p', '', order.preview ? 'This cancels the test order and releases its reserved preview stock. No customer email will be sent.' : 'This cancels the unpaid order and releases its reserved stock. Check the bank account first in case a transfer has arrived.'));
  const note = field(status === 'cancelled' ? 'Reason or note' : 'Internal note (optional)', 'note', 'textarea'); note.input.maxLength = 2000; if (status === 'cancelled') note.input.required = true; form.append(note.wrap);
  const confirmed = checkbox(order.preview ? order.testDelivery && status !== 'cancelled' ? 'I understand this is a simulation and an email will go to the test inbox.' : 'I understand this is a test and no customer email will be sent.' : status === 'paid' ? 'I have checked the bank account and the full payment has arrived.' : status === 'shipped' ? 'I have handed this parcel over for delivery.' : 'I have checked this order and want to cancel it.', 'confirmed'); form.append(confirmed.wrap);
  const submitLabel = order.preview ? (status === 'paid' ? 'Confirm test payment' : status === 'shipped' ? 'Confirm test shipment' : 'Cancel test order') : (status === 'paid' ? 'Mark paid & send confirmation' : status === 'shipped' ? 'Mark shipped & send confirmation' : 'Confirm cancellation');
  const buttons = element('div', 'admin-action-buttons'); const submit = element('button', 'button button-small', submitLabel); submit.type = 'submit'; buttons.append(submit, button('Back', () => { slot.replaceChildren(); $('#order-detail').focus({ preventScroll: true }); })); form.append(buttons);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (state.busy || !form.reportValidity()) return;
    state.busy = true; [...form.elements].forEach((node) => { node.disabled = true; }); notice('');
    const body = { status, note: note.input.value.trim(), expectedUpdatedAt: order.updatedAt };
    try {
      const result = await api(`/api/admin/orders/${encodeURIComponent(order.id)}/status`, { method: 'POST', body });
      state.order = result.order; renderOrderDetail(); await loadOrders({ quiet: true });
      notice(order.preview ? order.testDelivery && status !== 'cancelled' ? 'Test order updated. Its confirmation email has been queued for the test inbox.' : 'Preview order updated. No email sent.' : status === 'cancelled' ? 'Order cancelled. Reserved stock has been released.' : status === 'paid' ? 'Payment confirmed. The customer confirmation has been queued.' : 'Order marked as shipped. The dispatch confirmation has been queued.');
      $('#order-detail').focus({ preventScroll: true });
    } catch (error) { notice(error.message, true); [...form.elements].forEach((node) => { node.disabled = false; }); }
    finally { state.busy = false; }
  });
  slot.replaceChildren(form); $('textarea, input', form)?.focus({ preventScroll: true });
}

async function resendEmail(order) {
  if (state.busy) return;
  state.busy = true; notice(order.preview ? 'Testing the email retry…' : 'Queueing the customer email…');
  try {
    await api(`/api/admin/orders/${encodeURIComponent(order.id)}/resend`, { method: 'POST', body: { kind: order.status } });
    const message = order.preview ? order.testDelivery ? 'The email has been queued again for the test inbox.' : 'Email retry recorded for this preview order. No email sent.' : 'The customer email has been queued again.';
    try {
      const result = await api(`/api/admin/orders/${encodeURIComponent(order.id)}`);
      if (state.selectedId === order.id) { state.order = result.order; renderOrderDetail(); }
      notice(message);
    } catch { notice(`${message} Refresh the order to see its latest delivery status.`); }
  }
  catch (error) { notice(error.message, true); }
  finally { state.busy = false; }
}

function showMissingSetup(missing) {
  const node = $('#settings-setup'); node.replaceChildren();
  const items = Array.isArray(missing) ? missing : [];
  if (!items.length) { node.append(element('strong', '', 'Store details are complete.'), element('div', 'admin-small', 'Live checkout is enabled. New orders use these details.')); }
  else { node.append(element('strong', '', 'Still needed before launch')); const list = element('ul', 'admin-setup-list'); for (const item of items) list.append(element('li', '', typeof item === 'string' ? item : item.label || item.message || item.key || 'Setup step incomplete')); node.append(list); }
  node.hidden = false;
}

function showTestCheckout(config) {
  state.testCheckout = config || null;
  const button = $('#test-purchase');
  button.disabled = !config?.enabled;
  $('#test-purchase-help').textContent = config?.enabled
    ? `A test purchase sends emails only to ${config.recipient || 'the configured test inbox'}. No payment is needed.`
    : 'Test purchases with email will be available once the test inbox and sender are connected.';
}

function populateSettings(settings) {
  state.settings = settings;
  const form = $('#settings-form');
  const set = (name, value) => { form.elements.namedItem(name).value = value ?? ''; };
  set('productPrice', settings.productPriceCents == null ? '' : (settings.productPriceCents / 100).toFixed(2)); set('stockOnHand', settings.stockOnHand); set('maxQuantity', settings.maxQuantity ?? 1);
  set('shipping', settings.shippingCents == null ? '' : (settings.shippingCents / 100).toFixed(2)); form.elements.shippingConfirmed.checked = Boolean(settings.shippingConfirmed);
  set('shippingTierFromQuantity', settings.shippingTierFromQuantity);
  set('shippingTier', settings.shippingTierCents == null ? '' : (settings.shippingTierCents / 100).toFixed(2));
  set('accountName', settings.bank?.accountName); set('bsb', settings.bank?.bsb); set('accountNumber', settings.bank?.accountNumber); set('ownerEmail', settings.ownerEmail); set('supportEmail', settings.supportEmail);
  const stockHelp = $('#setting-stock').nextElementSibling;
  stockHelp.textContent = settings.stockOnHand == null ? 'Include hats reserved for unpaid and paid orders. Leave blank until counted.' : `Includes ${settings.reserved ?? 0} reserved hats. ${settings.available ?? settings.stockOnHand} currently available for new orders.`;
  form.hidden = false;
}

async function loadSettings() {
  state.busy = true;
  $('#settings-form').hidden = true;
  $('#settings-setup').hidden = true;
  notice('Loading current store settings…');
  try { const result = await api('/api/admin/settings'); populateSettings(result.settings); showMissingSetup(result.missingSetup); showTestCheckout(result.testCheckout); $('#owner-signout').hidden = result.ownerAuthMode !== 'email'; notice(''); }
  catch (error) { notice(error.message, true); }
  finally { state.busy = false; }
}

function switchView(view) {
  if (state.busy) return;
  if (view === 'settings' && !state.settingsEditable) return;
  $('#admin-main').classList.remove('is-reading-order');
  for (const name of ['orders', 'settings']) { $(`#${name}-view`).hidden = name !== view; if (name === view) $(`#${name}-tab`).setAttribute('aria-current', 'page'); else $(`#${name}-tab`).removeAttribute('aria-current'); }
  notice(''); if (view === 'settings') loadSettings();
}

function amountToCents(value) { if (!value.trim()) return null; if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error('Use a dollar amount with no more than two decimal places.'); const [dollars, cents = ''] = value.split('.'); const result = Number(dollars) * 100 + Number(cents.padEnd(2, '0')); if (!Number.isSafeInteger(result)) throw new Error('That amount is too large.'); return result; }

$('#settings-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = event.currentTarget;
  if (!state.settingsEditable) { notice('Store settings are locked for now.'); return; }
  if (state.busy || !form.reportValidity()) return;
  try {
    const values = new FormData(form);
    const settings = { productPriceCents: amountToCents(values.get('productPrice')), stockOnHand: values.get('stockOnHand').trim() === '' ? null : Number(values.get('stockOnHand')), maxQuantity: Number(values.get('maxQuantity')), shippingCents: amountToCents(values.get('shipping')), shippingConfirmed: values.has('shippingConfirmed'), bank: { accountName: values.get('accountName').trim(), bsb: values.get('bsb').replace(/\D/g, ''), accountNumber: values.get('accountNumber').replace(/\s/g, '') }, ownerEmail: values.get('ownerEmail').trim(), supportEmail: values.get('supportEmail').trim(), revision: state.settings?.revision };
    const tierQuantity = values.get('shippingTierFromQuantity').trim();
    const tierFee = values.get('shippingTier').trim();
    if (Boolean(tierQuantity) !== Boolean(tierFee)) throw new Error('Enter both the shipping tier quantity and charge, or leave both blank.');
    settings.shippingTierFromQuantity = tierQuantity === '' ? null : Number(tierQuantity);
    settings.shippingTierCents = amountToCents(tierFee);
    if (settings.shippingConfirmed && settings.shippingCents == null) throw new Error('Enter a shipping charge before confirming it.');
    state.busy = true; $('#save-settings').disabled = true; notice('Saving store settings…');
    const result = await api('/api/admin/settings', { method: 'PUT', body: settings }); populateSettings(result.settings || settings); showMissingSetup(result.missingSetup); notice('Settings saved. Existing orders keep their original price and payment instructions.');
  } catch (error) { notice(error.message, true); }
  finally { state.busy = false; $('#save-settings').disabled = false; }
});

$('#orders-tab').addEventListener('click', () => switchView('orders'));
$('#owner-signout').addEventListener('click', async () => {
  if (state.busy) return;
  state.busy = true; $('#owner-signout').disabled = true;
  try { await api('/api/owner-auth/logout', { method: 'POST', body: {} }); location.replace('/owner-login'); }
  catch (error) { notice(error.message, true); state.busy = false; $('#owner-signout').disabled = false; }
});
$('#settings-tab').addEventListener('click', () => switchView('settings'));
$('#test-purchase').addEventListener('click', () => { if (!state.busy && state.testCheckout?.enabled) location.assign('/checkout.html?test=1'); });
$('#refresh-orders').addEventListener('click', async () => {
  if (state.busy) return;
  const reading = $('#admin-main').classList.contains('is-reading-order');
  if (await loadOrders() && state.selectedId && reading) await loadOrder(state.selectedId, { focus: false });
});
function syncOrderFilters() {
  document.querySelectorAll('[data-order-filter]').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.orderFilter === $('#order-status').value)));
}
document.querySelectorAll('[data-order-filter]').forEach(node => node.addEventListener('click', () => {
  if (state.busy) return;
  $('#order-status').value = node.dataset.orderFilter;
  $('#order-search').value = '';
  syncOrderFilters(); loadOrders();
}));
$('#order-status').addEventListener('change', () => { syncOrderFilters(); loadOrders(); });
let searchTimer;
$('#order-search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => loadOrders(), 250); });
api('/api/catalog').then((catalog) => {
  const preview = $('#preview-notice'); preview.hidden = catalog.mode !== 'preview';
  $('#test-purchase').hidden = catalog.mode === 'live';
  $('#test-purchase-help').hidden = catalog.mode === 'live';
  if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
    $('strong', preview).textContent = 'Setup mode';
    $('span', preview).textContent = 'Live checkout is not enabled. Public preview orders do not send emails. Use Test purchase for the private email test.';
  }
}).catch(() => {});
api('/api/admin/settings').then(result => { state.settingsEditable = result.settingsEditable !== false; $('#settings-tab').hidden = !state.settingsEditable; showTestCheckout(result.testCheckout); $('#owner-signout').hidden = result.ownerAuthMode !== 'email'; }).catch(() => {
  $('#test-purchase-help').textContent = 'Test setup could not be checked. Reload the dashboard to try again.';
});
loadOrders();
