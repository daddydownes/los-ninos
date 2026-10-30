// Local display only: render production wording without queuing or sending mail.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderEmail } from '../commerce/emails.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, '.local/commerce-review-site/emails');
await mkdir(output, { recursive: true });
const order = {
  preview: false, reference: 'DEMO-001', productName: 'OG Snapback', quantity: 1,
  unitPriceCents: 3000, shippingCents: 2000, totalCents: 5000,
  customer: { name: 'Alex Example', email: 'alex@example.com', phone: '0400 000 000' },
  shippingAddress: { line1: '1 Example Street', suburb: 'Canberra', state: 'ACT', postcode: '2601', country: 'AU' },
  bank: { accountName: '[Your configured account name]', bsb: '[Your configured BSB]', accountNumber: '[Your configured account number]' }
};
const examples = [
  {kind:'awaiting_payment', status:'awaiting_payment', label:'Order received', to:'Customer', when:'Automatically after checkout'},
  {kind:'owner_order', status:'awaiting_payment', label:'New order notification', to:'You, the store owner', when:'Automatically after checkout'},
  {kind:'shipped', status:'shipped', label:'Payment & dispatch confirmed', to:'Customer', when:'After you mark the order as shipped in /admin'}
];
for (const example of examples) {
  const rendered = renderEmail(example.kind, {...order, status:example.status}, {publicUrl:'https://losninos.com.au', supportEmail:'support@example.com'});
  example.subject = rendered.subject;
  await writeFile(resolve(output, example.kind+'.html'), rendered.html);
  await writeFile(resolve(output, example.kind+'.txt'), rendered.text);
}
await writeFile(resolve(output,'index.html'), `<!doctype html>
<html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Real email designs — Los Niños</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#edf0f2;color:#15212c;font:15px/1.55 Arial,sans-serif}main{max-width:1100px;margin:auto;padding:28px 24px}h1{font-size:32px;line-height:1.1;letter-spacing:-1px;margin:12px 0}p{margin:12px 0;color:#4c5b68}.top{display:flex;justify-content:space-between;gap:20px;align-items:center}.top a{color:#243b4d}nav{display:flex;gap:8px;flex-wrap:wrap;margin:25px 0}button{font:inherit;border:1px solid #bac7cf;border-radius:22px;background:white;color:#15212c;padding:11px 18px;cursor:pointer}button[aria-selected=true]{background:#080f19;border-color:#080f19;color:white}.meta{background:white;padding:20px 24px;border:1px solid #d7dfe4;border-bottom:0;border-radius:14px 14px 0 0}.meta p{margin:3px 0}.meta strong{color:#15212c}.layout{max-width:720px;margin:auto}.note{background:#fff5dd;border-left:3px solid #b08733;padding:12px 16px;color:#5f4a20;font-size:13px;margin:20px 0}.paper{background:#080f19;padding:0 12px}iframe{display:block;width:100%;border:0;min-height:800px;background:#080f19}a:focus-visible,button:focus-visible{outline:3px solid #517c9c;outline-offset:3px}.raw{display:flex;gap:20px;flex-wrap:wrap;padding:16px 0}.raw a{color:#243b4d}@media(max-width:540px){main{padding:20px 12px}.top{align-items:start}.top a{font-size:12px}.paper{padding:0}.meta{padding:16px}button{font-size:13px;padding:10px 12px}h1{font-size:28px}}
</style></head><body><main><div class="top"><strong>LOS NIÑOS · EMAIL EXAMPLES</strong><a href="/demo.html">Back to checkout demo</a></div><h1>What customers actually receive.</h1><p>The three order emails, rendered by the store’s real email templates.</p>
<div class="note">Display examples only—nothing is sent. Names, contact details and order references are fictional; bank details are placeholders. The wording and design are the production versions. Email apps may render fonts and spacing slightly differently.</div>
<nav role="tablist" aria-label="Email type">${examples.map((e,i)=>`<button type="button" role="tab" id="tab-${i}" aria-controls="email-panel" aria-selected="${i===0}" data-index="${i}">${i+1}. ${e.label}</button>`).join('')}</nav>
<section class="layout" id="email-panel" role="tabpanel" aria-labelledby="tab-0"><div class="meta" aria-live="polite"><p><strong>To:</strong> <span id="to"></span></p><p><strong>When:</strong> <span id="when"></span></p><p><strong>Subject:</strong> <span id="subject"></span></p></div><div class="paper"><iframe id="email" title="Order received email example" sandbox="allow-same-origin"></iframe></div><div class="raw"><a id="full" target="_blank" rel="noopener">Open full email ↗</a><a id="plain" target="_blank" rel="noopener">Plain-text version ↗</a></div></section>
</main><script>
const examples=${JSON.stringify(examples)};
const frame=document.getElementById('email');
function fit(){if(frame.contentDocument?.body)frame.style.height=Math.max(600,frame.contentDocument.documentElement.scrollHeight,frame.contentDocument.body.scrollHeight)+'px'}
function select(i){const e=examples[i];document.getElementById('to').textContent=e.to;document.getElementById('when').textContent=e.when;document.getElementById('subject').textContent=e.subject;document.getElementById('full').href=e.kind+'.html';document.getElementById('plain').href=e.kind+'.txt';document.getElementById('email-panel').setAttribute('aria-labelledby','tab-'+i);document.querySelectorAll('[data-index]').forEach((b,j)=>b.setAttribute('aria-selected',String(i===j)));frame.title=e.label+' email example';frame.style.height='800px';frame.src=e.kind+'.html'}
frame.addEventListener('load',fit);addEventListener('resize',fit);document.querySelectorAll('[data-index]').forEach(b=>b.addEventListener('click',()=>select(Number(b.dataset.index))));select(0);
</script></body></html>`);
console.log('Email examples: http://127.0.0.1:8784/emails/index.html');
