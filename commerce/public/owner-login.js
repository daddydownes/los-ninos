const emailForm = document.querySelector('#email-form');
const codeForm = document.querySelector('#code-form');
const message = document.querySelector('#login-message');
const code = document.querySelector('#owner-code');
const resend = document.querySelector('#resend-code');
let address = '', busy = false, retryAt = 0;
function notice(text, error = false) { message.textContent = text; message.hidden = !text; message.classList.toggle('error', error); }
function refresh() {
  document.querySelectorAll('button').forEach(button => { button.disabled = busy; });
  const remaining = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
  resend.disabled = busy || remaining > 0;
  resend.textContent = remaining ? `Send again in ${remaining}s` : 'Send a new code';
}
async function action(name, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    let response, data;
    try {
      response = await fetch(`/api/owner-auth/${name}`, { method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'LosNinos' }, body: JSON.stringify(body), signal: controller.signal });
      data = await response.json();
    } catch { throw new Error('We could not connect. Check your connection and try again.'); }
    if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'We could not complete sign-in. Try again.');
    return data;
  } finally { clearTimeout(timer); }
}
async function requestCode() {
  if (busy) return;
  busy = true; refresh(); notice('Requesting your sign-in code…');
  try {
    const result = await action('request', { email: address });
    emailForm.hidden = true; codeForm.hidden = false; code.value = '';
    retryAt = Date.now() + 30000; notice(result.message); code.focus();
  } catch (error) { notice(error.message, true); }
  finally { busy = false; refresh(); }
}
emailForm.addEventListener('submit', event => { event.preventDefault(); if (busy || !emailForm.reportValidity()) return; address = emailForm.elements.email.value.trim(); requestCode(); });
resend.addEventListener('click', () => { if (Date.now() >= retryAt) requestCode(); });
document.querySelector('#change-email').addEventListener('click', () => {
  if (busy) return; codeForm.hidden = true; emailForm.hidden = false; code.value = ''; notice(''); emailForm.elements.email.focus();
});
codeForm.addEventListener('submit', async event => {
  event.preventDefault(); if (busy || !codeForm.reportValidity()) return;
  busy = true; refresh(); notice('Signing you in…');
  try { await action('verify', { code: code.value }); code.value = ''; location.replace('/admin'); }
  catch (error) { notice(error.message, true); code.focus(); code.select(); busy = false; refresh(); }
});
setInterval(refresh, 1000);
