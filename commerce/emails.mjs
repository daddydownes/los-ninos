/**
 * Transactional email rendering only. The caller authorises state transitions,
 * chooses recipients/Reply-To and persists the rendered payload before delivery.
 * Bank details and prices come from the order snapshot, never current settings.
 */
const NAVY = '#080f19';
const CREAM = '#f0e9d9';
const MUTED = '#bbc0c8';
const LINE = '#303640';
const KINDS = new Set(['awaiting_payment', 'paid', 'shipped', 'owner_order']);

function scalar(value) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, ' ').trim();
}

function escapeHtml(value) {
  return scalar(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function requiredText(value, field) {
  if (typeof value !== 'string' || !scalar(value)) throw new TypeError(`${field} must be a nonempty string`);
  return scalar(value);
}

function money(cents, field) {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new TypeError(`${field} must be nonnegative integer cents`);
  return `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} AUD`;
}

function ownerDashboardUrl(publicUrl) {
  if (typeof publicUrl !== 'string' || /[\s\u0000-\u001f]/.test(publicUrl)) return null;
  try {
    const url = new URL(publicUrl);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
    return new URL('/admin', url).href;
  } catch { return null; }
}

function supportAddress(value) {
  if (typeof value !== 'string' || /[\r\n\u0000-\u001f]/.test(value)) return null;
  const email = value.trim();
  return /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(email) ? email : null;
}

function viewOrder(kind, order) {
  if (!order || typeof order !== 'object') throw new TypeError('An order is required');
  const preview = order.preview === true;
  const testDelivery = preview && order.testDelivery === true;
  if (!preview || testDelivery) {
    if (kind === 'awaiting_payment' && order.status !== 'awaiting_payment') throw new Error('Payment instructions require an awaiting_payment order');
    if (kind === 'paid' && !['paid', 'shipped'].includes(order.status)) throw new Error('Payment confirmation requires an owner-confirmed paid order');
    if (kind === 'shipped' && order.status !== 'shipped') throw new Error('Dispatch confirmation requires a shipped order');
  }
  const reference = requiredText(order.reference, 'order.reference');
  const quantity = order.quantity;
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new TypeError('order.quantity must be a positive integer');
  const productName = requiredText(order.productName, 'order.productName');
  let unitPrice = '[PRICE AUD]', itemTotal = '[ITEM TOTAL AUD]', shipping = '[SHIPPING AUD]', total = '[TOTAL AUD]';
  if (!preview || testDelivery) {
    unitPrice = money(order.unitPriceCents, 'order.unitPriceCents');
    itemTotal = money(order.unitPriceCents * quantity, 'order item total');
    shipping = money(order.shippingCents, 'order.shippingCents');
    total = money(order.totalCents, 'order.totalCents');
    if (order.totalCents !== order.unitPriceCents * quantity + order.shippingCents) throw new Error('Order total does not match items and shipping');
  } else if (quantity === 1) {
    itemTotal = unitPrice;
  }
  const bank = preview && !testDelivery
    ? { accountName: '[ACCOUNT NAME]', bsb: '[BSB]', accountNumber: '[ACCOUNT NUMBER]' }
    : kind === 'awaiting_payment'
      ? {
          accountName: requiredText(order.bank?.accountName, 'bank.accountName'),
          bsb: requiredText(order.bank?.bsb, 'bank.bsb'),
          accountNumber: requiredText(order.bank?.accountNumber, 'bank.accountNumber')
        }
      : null;
  const customer = { name: scalar(order.customer?.name), email: scalar(order.customer?.email), phone: scalar(order.customer?.phone) };
  const address = order.shippingAddress ?? {};
  const addressLines = [customer.name, scalar(address.line1), scalar(address.line2), [scalar(address.suburb), scalar(address.state), scalar(address.postcode)].filter(Boolean).join(' '), address.country === 'AU' ? 'Australia' : scalar(address.country)].filter(Boolean);
  return { preview, testDelivery, reference, quantity, productName, unitPrice, itemTotal, shipping, total, bank, customer, addressLines };
}

function wording(kind, view) {
  const titles = { awaiting_payment: 'Order received.', paid: 'Payment confirmed.', shipped: 'Payment received. Order dispatched.', owner_order: 'New order received.' };
  const states = { awaiting_payment: 'Awaiting payment', paid: 'Paid', shipped: 'Paid & dispatched', owner_order: 'Order received' };
  const subjects = { awaiting_payment: 'bank transfer instructions', paid: 'payment received', shipped: 'payment received & order dispatched', owner_order: 'new order received' };
  const firstName = view.customer.name.split(/\s+/)[0];
  const greeting = firstName ? `Thanks, ${firstName}.` : 'Thanks for your order.';
  let introduction, next;
  if (view.preview) {
    introduction = {
      awaiting_payment: 'This preview shows the bank transfer instructions a customer will receive after placing an order.',
      paid: 'This preview shows the confirmation a customer will receive after the owner checks that payment has arrived.',
      shipped: 'This preview shows the combined payment and dispatch confirmation a customer receives after the owner records shipment.',
      owner_order: 'This preview shows the notification the owner will receive when a customer places an order.'
    }[kind];
    next = 'No payment is required. This preview does not confirm a payment or a shipment.';
  } else if (kind === 'awaiting_payment') {
    introduction = `${greeting} Your Los Niños order is saved. To pay, open your banking app and make a bank transfer to the account below.`;
    next = 'Your order will be dispatched within 1–3 business days after payment is confirmed.';
  } else if (kind === 'paid') {
    introduction = `${greeting} We’ve checked our bank account and confirmed your payment. No further payment is needed for this order.`;
    next = 'We’ll dispatch your order within 1–3 business days after this payment confirmation and email you when it ships.';
  } else if (kind === 'shipped') {
    introduction = `${greeting} We’ve received your payment and your Los Niños order has been dispatched with Australia Post. No further payment is needed. Thanks for supporting Los Niños.`;
    next = 'Reply to this email if you need help with your order.';
  } else {
    introduction = 'A customer has placed an order and has been given bank transfer instructions. Open the dashboard to check the current payment and dispatch status.';
    next = 'Check the receiving bank account and match the amount and payment reference before marking the order paid. After confirming payment, dispatch within 1–3 business days and mark the order shipped in the dashboard.';
  }
  const subject = `${view.testDelivery ? '[TEST] ' : view.preview ? 'PREVIEW — no payment required — ' : ''}Los Niños ${view.reference} — ${subjects[kind]}`.replace(/[\r\n]/g, ' ').slice(0, 240);
  return { title: titles[kind], state: states[kind], subject, introduction, next };
}

function paragraph(text, extra = '') {
  return `<p style="margin:0 0 16px;color:${MUTED};font-size:15px;line-height:1.65;${extra}">${escapeHtml(text)}</p>`;
}

function panelRow(label, value, { large = false, mono = false, line = false } = {}) {
  return `<tr><td style="padding:${line ? '20px' : '0'} 0 20px;${line ? 'border-top:1px solid #d3ccbe;' : ''}"><p style="margin:0 0 5px;color:#41464b;font-size:12px;line-height:1.5;">${escapeHtml(label)}</p><p style="margin:0;color:${NAVY};font-family:${mono ? "'Courier New',Courier,monospace" : 'Arial,Helvetica,sans-serif'};font-size:${large ? '27' : '19'}px;font-weight:700;line-height:1.35;word-break:break-word;overflow-wrap:anywhere;">${escapeHtml(value)}</p></td></tr>`;
}

function button(url, label, light = false) {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 0;"><tr><td bgcolor="${light ? NAVY : CREAM}" style="background-color:${light ? NAVY : CREAM};"><a href="${escapeHtml(url)}" style="display:inline-block;padding:15px 19px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;line-height:1.4;text-decoration:none;color:${light ? CREAM : NAVY};">${escapeHtml(label)}</a></td></tr></table>`;
}

function paymentPanel(kind, view) {
  let rows = '', bottom = '';
  let label = kind === 'paid' ? 'Payment received' : kind === 'shipped' ? 'Payment received · order dispatched' : kind === 'owner_order' ? 'Order to reconcile' : 'Bank transfer details';
  if (view.preview) label = `Sample ${label.toLowerCase()}`;
  if (kind === 'shipped') {
    rows = panelRow('Amount received', view.total, { large: true });
    rows += panelRow('Order reference', view.reference, { large: true, line: true });
  } else {
    rows = panelRow(kind === 'paid' ? 'Amount received' : kind === 'owner_order' ? 'Order total' : 'Amount to transfer', view.total, { large: true });
    if (kind === 'awaiting_payment') {
      rows += panelRow('Account name', view.bank.accountName, { line: true });
      rows += panelRow('BSB', view.bank.bsb, { mono: true });
      rows += panelRow('Account number', view.bank.accountNumber, { mono: true });
    }
    rows += panelRow('Payment reference', view.reference, { large: true, line: true });
    if (kind === 'awaiting_payment') {
      bottom = view.preview
        ? `<p style="margin:0;color:#353a40;font-size:13px;line-height:1.6;">${view.testDelivery ? 'Configured bank details are shown for review only. Do not send money for this test.' : 'These are placeholders. Do not send money for this preview.'}</p>`
        : `<p style="margin:0;color:#353a40;font-size:13px;line-height:1.6;">Enter <strong>${escapeHtml(view.reference)}</strong> in the reference or description field so we can match your transfer to your order.</p>`;
    }
  }
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${CREAM}" style="width:100%;background-color:${CREAM};color:${NAVY};margin:10px 0 26px;"><tr><td class="bank-padding" style="padding:26px 28px;"><h2 style="margin:0 0 23px;font-size:11px;line-height:1.5;letter-spacing:1.1px;text-transform:uppercase;color:${NAVY};">${escapeHtml(label)}</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;">${rows}</table>${bottom}</td></tr></table>`;
}

function summary(view) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-top:1px solid ${LINE};margin-top:27px;"><tr><td colspan="2" style="padding:25px 0 18px;"><h2 style="margin:0;color:${CREAM};font-size:13px;line-height:1.5;">Your order</h2></td></tr><tr><td width="58%" valign="top" style="padding:0 16px 18px 0;color:#ffffff;font-size:15px;line-height:1.5;word-break:break-word;">${escapeHtml(view.productName)}<p style="margin:5px 0 0;color:${MUTED};font-size:12px;line-height:1.5;">Quantity × ${view.quantity}<br>${escapeHtml(view.unitPrice)} each</p></td><td width="42%" align="right" valign="top" style="color:#ffffff;font-size:13px;line-height:1.65;word-break:break-word;">${escapeHtml(view.itemTotal)}</td></tr><tr><td style="padding:7px 12px 16px 0;color:${MUTED};font-size:13px;line-height:1.5;">Shipping</td><td align="right" style="padding:7px 0 16px;color:${MUTED};font-size:13px;line-height:1.5;word-break:break-word;">${escapeHtml(view.shipping)}</td></tr><tr><td style="padding:15px 12px 0 0;border-top:1px solid ${LINE};color:${CREAM};font-size:16px;font-weight:700;line-height:1.5;">Total</td><td align="right" style="padding:15px 0 0;border-top:1px solid ${LINE};color:${CREAM};font-size:16px;font-weight:700;line-height:1.5;word-break:break-word;">${escapeHtml(view.total)}</td></tr></table>`;
}

function htmlEmail(kind, view, copy, config) {
  const supportEmail = supportAddress(config.supportEmail);
  const adminUrl = kind === 'owner_order' && (!view.preview || view.testDelivery) ? ownerDashboardUrl(config.publicUrl) : null;
  const preview = view.preview ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${CREAM}" style="background-color:${CREAM};"><tr><td class="side-padding" style="padding:20px 42px;color:${NAVY};"><p style="margin:0 0 7px;font-size:15px;line-height:1.5;font-weight:700;">PREVIEW — no payment required</p><p style="margin:0;font-size:13px;line-height:1.6;">Sample email only. No payment is requested and no parcel will be sent from this preview.</p></td></tr></table>` : '';
  const contact = kind === 'owner_order' ? `<h2 style="margin:27px 0 10px;color:${CREAM};font-size:13px;line-height:1.5;">Customer contact</h2>${paragraph([view.customer.name, view.customer.email, view.customer.phone].filter(Boolean).join(' · '), 'overflow-wrap:anywhere;word-break:break-word;')}${adminUrl ? button(adminUrl, 'Open order dashboard') : ''}` : '';
  const footer = kind === 'owner_order' ? 'Manage payment and shipping in the private order dashboard. This notification does not confirm that funds have arrived.' : 'Need to correct your address or ask a question? Reply to this email and we’ll help.';
  const supportLine = supportEmail ? `<p style="margin:10px 0 0;font-size:12px;line-height:1.7;color:${MUTED};">${kind === 'owner_order' ? 'Customer support' : 'Support'}: <a href="mailto:${escapeHtml(encodeURIComponent(supportEmail))}" style="color:${CREAM};text-decoration:underline;word-break:break-word;">${escapeHtml(supportEmail)}</a></p>` : '';
  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${escapeHtml(copy.subject)}</title><style>body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}table{border-spacing:0;border-collapse:collapse}body{margin:0!important;padding:0!important;width:100%!important}a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}a:focus-visible{outline:2px solid currentColor;outline-offset:3px}@media only screen and (max-width:480px){.side-padding{padding-left:24px!important;padding-right:24px!important}.bank-padding{padding-left:20px!important;padding-right:20px!important}.email-title{font-size:35px!important;letter-spacing:-1px!important}.wordmark{font-size:27px!important}}@media(prefers-color-scheme:dark){.navy-background{background-color:${NAVY}!important;color:#ffffff!important}}</style></head>
<body class="navy-background" bgcolor="${NAVY}" style="margin:0;padding:0;background-color:${NAVY};color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(view.preview ? 'PREVIEW — no payment required. Sample email only.' : `${copy.state}. ${kind === 'awaiting_payment' ? `Transfer ${view.total} using reference ${view.reference}.` : `Order ${view.reference}.`}`)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${NAVY}" style="width:100%;background-color:${NAVY};"><tr><td align="center" style="padding:0;">
<!--[if mso]><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" bgcolor="${NAVY}" class="navy-background" style="width:100%;max-width:600px;background-color:${NAVY};color:#ffffff;"><tr><td>${preview}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-bottom:1px solid ${LINE};"><tr><td class="side-padding" style="padding:36px 42px 30px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;"><tr><td class="wordmark" style="font-family:'Arial Black',Arial,Helvetica,sans-serif;font-size:30px;font-weight:900;line-height:0.9;letter-spacing:-2px;color:#ffffff;">LOS<br>NIÑOS</td><td align="right" style="padding-left:15px;color:${MUTED};font-size:11px;line-height:1.5;letter-spacing:.5px;word-break:break-word;">ORDER ${escapeHtml(view.reference)}</td></tr></table></td></tr></table>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;"><tr><td class="side-padding" style="padding:34px 42px 32px;">
<p style="margin:0 0 15px;font-size:12px;line-height:1.5;color:${CREAM};">${escapeHtml(view.preview ? `Sample status: ${copy.state}` : copy.state)}</p>
<h1 class="email-title" style="margin:0 0 22px;font-family:Georgia,'Times New Roman',serif;font-size:44px;line-height:1.1;font-weight:400;letter-spacing:-1.6px;color:${CREAM};">${escapeHtml(copy.title)}</h1>
${paragraph(copy.introduction, 'color:#ffffff;')}
${paymentPanel(kind, view)}
<h2 style="margin:0 0 10px;color:${CREAM};font-size:13px;line-height:1.5;">${kind === 'owner_order' ? 'Owner action' : 'What happens next'}</h2>
${paragraph(copy.next, 'font-size:14px;')}
${contact}
${summary(view)}
<h2 style="margin:30px 0 11px;color:${CREAM};font-size:13px;line-height:1.5;">Delivery address</h2>
<p style="margin:0;color:${MUTED};font-size:13px;line-height:1.85;word-break:break-word;">${view.addressLines.map(escapeHtml).join('<br>')}</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin-top:31px;border-top:1px solid ${LINE};"><tr><td style="padding-top:25px;"><p style="margin:0;font-size:12px;line-height:1.75;color:${MUTED};">${escapeHtml(footer)}</p>${supportLine}<p style="margin:21px 0 0;color:#ffffff;font-size:11px;line-height:1.5;letter-spacing:1.2px;font-weight:700;">LOS NIÑOS</p></td></tr></table>
</td></tr></table></td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
}

function textEmail(kind, view, copy, config) {
  const lines = ['LOS NIÑOS'];
  if (view.preview) lines.push('', 'PREVIEW — no payment required', 'Sample email only. No payment is requested and no parcel will be sent from this preview.');
  lines.push('', `Order ${view.reference}`, copy.title, view.preview ? `Sample status: ${copy.state}` : copy.state, '', copy.introduction, '');
  if (kind === 'awaiting_payment') {
    lines.push(view.preview ? 'SAMPLE BANK TRANSFER DETAILS' : 'BANK TRANSFER DETAILS', `Amount to transfer: ${view.total}`, `Account name: ${view.bank.accountName}`, `BSB: ${view.bank.bsb}`, `Account number: ${view.bank.accountNumber}`, `Payment reference: ${view.reference}`, '', view.preview ? view.testDelivery ? 'Configured bank details are shown for review only. Do not send money for this test.' : 'These are placeholders. Do not send money for this preview.' : `Enter ${view.reference} in the reference or description field so we can match your transfer to your order.`);
  } else if (kind === 'paid') {
    lines.push(view.preview ? 'SAMPLE PAYMENT RECEIVED' : 'PAYMENT RECEIVED', `Amount received: ${view.total}`, `Payment reference: ${view.reference}`);
  } else if (kind === 'shipped') {
    lines.push(view.preview ? 'SAMPLE PAYMENT & DISPATCH CONFIRMATION' : 'PAYMENT RECEIVED · ORDER DISPATCHED', `Amount received: ${view.total}`, `Order reference: ${view.reference}`);
  } else {
    lines.push('ORDER TO RECONCILE', `Order total: ${view.total}`, `Payment reference: ${view.reference}`);
  }
  lines.push('', kind === 'owner_order' ? 'OWNER ACTION' : 'WHAT HAPPENS NEXT', copy.next);
  if (kind === 'owner_order') {
    lines.push('', 'CUSTOMER CONTACT', ...[view.customer.name, view.customer.email, view.customer.phone].filter(Boolean));
    const url = (!view.preview || view.testDelivery) && ownerDashboardUrl(config.publicUrl);
    if (url) lines.push(`Open order dashboard: ${url}`);
  }
  lines.push('', 'YOUR ORDER', `${view.productName} × ${view.quantity}`, `Unit price: ${view.unitPrice}`, `Items: ${view.itemTotal}`, `Shipping: ${view.shipping}`, `Total: ${view.total}`, '', 'DELIVERY ADDRESS', ...view.addressLines, '', kind === 'owner_order' ? 'Manage payment and shipping in the private order dashboard. This notification does not confirm that funds have arrived.' : 'Need to correct your address or ask a question? Reply to this email and we’ll help.');
  const supportEmail = supportAddress(config.supportEmail);
  if (supportEmail) lines.push(`Support: ${supportEmail}`);
  lines.push('', 'LOS NIÑOS');
  return lines.join('\n');
}

export function renderEmail(kind, order, config = {}) {
  if (!KINDS.has(kind)) throw new TypeError(`Unsupported email kind: ${scalar(kind)}`);
  const view = viewOrder(kind, order);
  const copy = wording(kind, view);
  return { subject: copy.subject, html: htmlEmail(kind, view, copy, config), text: textEmail(kind, view, copy, config) };
}
