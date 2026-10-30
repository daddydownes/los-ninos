import test from 'node:test';
import assert from 'node:assert/strict';
import { renderEmail } from '../emails.mjs';

function order(overrides = {}) {
  return {
    id: 'test-order', reference: 'LN-0001', status: 'awaiting_payment', preview: false,
    quantity: 2, productName: 'Navy snapback', unitPriceCents: 4500, shippingCents: 1600, totalCents: 10600,
    customer: { name: 'Alex Example', email: 'alex@example.test', phone: '0400 000 000' },
    shippingAddress: { line1: '1 Example Street', line2: 'Unit 2', suburb: 'Melbourne', state: 'VIC', postcode: '3000', country: 'AU' },
    bank: { accountName: 'TEST FIXTURE ONLY', bsb: '012-345', accountNumber: '001234567' },
    trackingNumber: 'TEST-TRACKING',
    ...overrides
  };
}

const config = { publicUrl: 'https://store.example.test', supportEmail: 'support@example.test' };

test('awaiting payment makes the bank transfer explicit and preserves leading zeros', () => {
  const result = renderEmail('awaiting_payment', order(), config);
  assert.match(result.subject, /bank transfer instructions/);
  for (const value of ['Awaiting payment', '$106.00 AUD', '012-345', '001234567', 'LN-0001', 'open your banking app', '1–3 business days after payment is confirmed']) {
    assert.ok(result.html.includes(value), value);
    assert.ok(result.text.includes(value), value);
  }
  for (const label of ['Account name', 'BSB', 'Account number', 'Payment reference', 'Amount to transfer']) assert.ok(result.html.includes(label));
  assert.match(result.text, /Items: \$90\.00 AUD/);
  assert.match(result.text, /Shipping: \$16\.00 AUD/);
  assert.doesNotMatch(result.text, /pay by|payment deadline|automatic reminder|cancelled automatically/i);
});

test('HTML escapes all customer, order, bank and address content and strips header newlines', () => {
  const malicious = '<img src=x onerror="alert(1)"> & \'quoted\'';
  const result = renderEmail('awaiting_payment', order({
    reference: 'LN-0001\r\nBcc: attacker@example.test', productName: malicious,
    customer: { name: malicious, email: malicious, phone: malicious },
    shippingAddress: { line1: malicious, line2: malicious, suburb: malicious, state: malicious, postcode: malicious, country: malicious },
    bank: { accountName: malicious, bsb: malicious, accountNumber: malicious }
  }), config);
  assert.doesNotMatch(result.subject, /[\r\n\u2028\u2029]/);
  assert.doesNotMatch(result.html, /<img|<script|onerror="/);
  assert.match(result.html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; &#39;quoted&#39;/);
  assert.ok(result.text.includes(malicious));
});

test('all four email kinds have complete HTML and plain text and truthful state-specific copy', () => {
  for (const kind of ['awaiting_payment', 'paid', 'shipped', 'owner_order']) {
    const status = kind === 'paid' || kind === 'shipped' ? kind : 'awaiting_payment';
    const result = renderEmail(kind, order({ status }), config);
    assert.deepEqual(Object.keys(result).sort(), ['html', 'subject', 'text']);
    for (const value of ['Navy snapback', '1 Example Street', 'Unit 2', 'Melbourne VIC 3000', 'Australia', '$106.00 AUD']) {
      assert.ok(result.html.includes(value), `${kind}: HTML ${value}`);
      assert.ok(result.text.includes(value), `${kind}: text ${value}`);
    }
    assert.match(result.html, /max-width:600px/);
    assert.match(result.html, /role="presentation"/);
    assert.doesNotMatch(result.html, /<script|<form|<input|<button/);
  }
  const paid = renderEmail('paid', order({ status: 'paid' }), config);
  assert.match(paid.text, /confirmed your payment/);
  assert.match(paid.text, /No further payment is needed/);
  assert.doesNotMatch(paid.text, /Account number:|Amount to transfer:/);
  const combined = renderEmail('shipped', order({ status: 'shipped' }), config);
  assert.match(combined.subject, /payment received & order dispatched/);
  assert.match(combined.text, /received your payment/);
  assert.match(combined.text, /dispatched with Australia Post/);
  assert.match(combined.text, /Amount received: \$106\.00 AUD/);
  assert.doesNotMatch(combined.text, /Account number:|Amount to transfer:/);
  const owner = renderEmail('owner_order', order(), config);
  assert.match(owner.text, /Check the receiving bank account/);
  assert.match(owner.text, /alex@example\.test/);
  assert.match(owner.text, /current payment and dispatch status/);
  assert.doesNotMatch(owner.text, /Payment is still awaiting confirmation/);
  assert.match(owner.html, /href="https:\/\/store\.example\.test\/admin"/);
});

test('preview removes real bank data, amounts and tracking links in every variant', () => {
  for (const kind of ['awaiting_payment', 'paid', 'shipped', 'owner_order']) {
    const result = renderEmail(kind, order({ preview: true }), config);
    for (const value of Object.values(result)) assert.match(value, /PREVIEW — no payment required/);
    for (const value of [result.html, result.text]) {
      assert.doesNotMatch(value, /012-345|001234567|TEST FIXTURE ONLY|\$106\.00|\$45\.00|\$16\.00|TEST-TRACKING/);
      assert.match(value, /\[TOTAL AUD\]/);
      assert.doesNotMatch(value, /https:\/\/auspost|href="https:\/\/store/);
    }
    if (kind === 'awaiting_payment') {
      assert.match(result.text, /Account name: \[ACCOUNT NAME\]/);
      assert.match(result.text, /BSB: \[BSB\]/);
      assert.match(result.text, /Account number: \[ACCOUNT NUMBER\]/);
      assert.doesNotMatch(result.text, /open your banking app/);
    }
  }
  assert.doesNotThrow(() => renderEmail('awaiting_payment', order({ preview: true, unitPriceCents: null, shippingCents: null, totalCents: null, bank: {} })));
});

test('emails omit tracking values, links and promises even for older orders with saved tracking', () => {
  for (const kind of ['awaiting_payment', 'paid', 'shipped', 'owner_order']) {
    const status = kind === 'paid' || kind === 'shipped' ? kind : 'awaiting_payment';
    const result = renderEmail(kind, order({ status, trackingNumber: 'SAVED-TRACKING-123', trackingUrl: 'https://evil.example/track' }), config);
    for (const value of Object.values(result)) assert.doesNotMatch(value, /tracking|auspost\.com|evil\.example/i);
  }
  const dispatched = renderEmail('shipped', order({ status: 'shipped', trackingNumber: '' }), config);
  assert.match(dispatched.text, /ORDER DISPATCHED/);
  assert.match(dispatched.text, /Reply to this email/);
});

test('owner links reject unsafe URLs and support email cannot inject attributes or headers', () => {
  for (const publicUrl of ['javascript:alert(1)', 'http://example.test', '//evil.test', 'https://user:password@example.test', 'https://example.test\n/evil', '<script>']) {
    const result = renderEmail('owner_order', order(), { publicUrl, supportEmail: 'x@example.test\r\nBcc: evil@example.test' });
    assert.doesNotMatch(result.html, /href=/);
    assert.doesNotMatch(result.text, /Open order dashboard:|Bcc:/);
  }
});

test('renderer refuses stale payment instructions and premature paid or shipped confirmations', () => {
  assert.throws(() => renderEmail('awaiting_payment', order({ status: 'paid' })), /awaiting_payment/);
  assert.throws(() => renderEmail('paid', order()), /owner-confirmed/);
  assert.throws(() => renderEmail('shipped', order({ status: 'paid' })), /shipped order/);
  assert.doesNotThrow(() => renderEmail('shipped', order({ status: 'shipped', trackingNumber: '' })));
  assert.doesNotThrow(() => renderEmail('paid', order({ status: 'shipped' })));
});

test('invalid amounts and incomplete live payment details fail instead of mailing misleading instructions', () => {
  for (const unitPriceCents of [-1, NaN, Infinity, '4500', 4500.1]) {
    assert.throws(() => renderEmail('awaiting_payment', order({ unitPriceCents })), /integer cents/);
  }
  assert.throws(() => renderEmail('awaiting_payment', order({ totalCents: 10601 })), /does not match/);
  assert.throws(() => renderEmail('awaiting_payment', order({ quantity: 0 })), /positive integer/);
  assert.throws(() => renderEmail('awaiting_payment', order({ bank: {} })), /bank.accountName/);
  assert.throws(() => renderEmail('awaiting_payment', order({ bank: { accountName: 'test', bsb: 12345, accountNumber: '001234567' } })), /bank.bsb/);
  assert.throws(() => renderEmail('unknown', order()), /Unsupported email kind/);
});

test('zero shipping and optional address/contact fields remain readable', () => {
  const result = renderEmail('owner_order', order({ shippingCents: 0, totalCents: 9000, customer: { name: 'Alex', email: 'alex@example.test' }, shippingAddress: { line1: '1 Example Street', suburb: 'Melbourne', state: 'VIC', postcode: '3000', country: 'AU' } }), config);
  assert.match(result.text, /Shipping: \$0\.00 AUD/);
  assert.doesNotMatch(result.text, /undefined|null/);
});
