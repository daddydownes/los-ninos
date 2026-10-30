const LOGIN_COOKIE = '__Host-ln-login';
const SESSION_COOKIE = '__Host-ln-owner';
const CODE_TTL = 10 * 60;
const SESSION_TTL = 8 * 60 * 60;
const IDLE_TTL = 30 * 60;
const encoder = new TextEncoder();
const now = () => Math.floor(Date.now() / 1000);
const stmt = (env, sql, ...values) => env.DB.prepare(sql).bind(...values);
const reject = (status, message) => { throw Object.assign(new Error(message), { status }); };
const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');

export function ownerEmails(env) {
  return new Set(String(env.OWNER_EMAILS || '').split(',').map(value => value.trim().toLowerCase())
    .filter(value => /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value)));
}

export function ownerEmailAuthReady(env) {
  return env.OWNER_AUTH_MODE === 'email' && typeof env.OWNER_AUTH_SECRET === 'string' && env.OWNER_AUTH_SECRET.length >= 32
    && ownerEmails(env).size > 0;
}

function canonicalRequest(request, env) {
  try {
    const configured = new URL(env.PUBLIC_STORE_URL);
    return configured.protocol === 'https:' && !configured.username && !configured.password
      && new URL(request.url).origin === configured.origin;
  } catch { return false; }
}

async function digest(env, purpose, value) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.OWNER_AUTH_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`${purpose}\0${value}`)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function cookie(request, name) {
  const values = (request.headers.get('cookie') || '').split(';').map(value => value.trim()).filter(value => value.startsWith(`${name}=`));
  if (values.length !== 1) return null;
  const value = values[0].slice(name.length + 1);
  return /^[a-f0-9]{64}$/.test(value) ? value : null;
}

function setCookie(name, value, age) {
  return `${name}=${value}; Path=/; Max-Age=${age}; Secure; HttpOnly; SameSite=Strict`;
}

function json(value, cookies = [], status = 200) {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(JSON.stringify(value), { status, headers });
}

async function rate(env, label, limit, period) {
  const stamp = now();
  const window = Math.floor(stamp / period);
  const bucket = await digest(env, 'rate', `${label}:${window}`);
  const row = await stmt(env, `INSERT INTO rate_limits(bucket,count,expires_at) VALUES (?,1,?)
    ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count`, bucket, (window + 2) * period).first();
  return row.count <= limit;
}

function randomCode() {
  const values = new Uint32Array(1);
  // Rejection sampling avoids modulo bias.
  do { crypto.getRandomValues(values); } while (values[0] >= 4294000000);
  return String(values[0] % 1000000).padStart(6, '0');
}

async function sendCode(env, address, code, idHash) {
  try {
    const result = await (env.FETCH || fetch)('https://api.resend.com/emails', {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `los-ninos/owner-code/${idHash}` },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [address], subject: 'Your Los Niños owner sign-in code',
        text: `Your Los Niños owner sign-in code is ${code}.\n\nIt expires in 10 minutes and can be used once, in the browser where you requested it.\n\nDo not share this code. If you did not request it, you can ignore this email.`,
        html: `<div style="font-family:Arial,sans-serif;max-width:480px;padding:32px;background:#08111f;color:#fff"><h1 style="font-size:24px">LOS NIÑOS</h1><p>Your owner sign-in code</p><p style="font-size:36px;letter-spacing:6px;font-weight:bold">${code}</p><p>Expires in 10 minutes. Use it once, in the browser where you requested it.</p><p>Do not share this code. If you did not request it, you can ignore this email.</p></div>` }),
    });
    if (!result.ok) {
      console.warn('Owner sign-in email rejected by provider.', result.status);
      await stmt(env, 'DELETE FROM owner_login_challenges WHERE id_hash=? AND consumed_at IS NULL', idHash).run();
    }
  } catch {
    // A timeout may have sent the email. Keep its short-lived challenge valid;
    // the owner can request a fresh code if it does not arrive.
  }
}

export async function ownerAuthAction(action, request, env, body, ctx) {
  if (!ownerEmailAuthReady(env) || !canonicalRequest(request, env)) reject(503, 'Owner sign-in is not configured at this address.');
  if (request.method !== 'POST' || request.headers.get('origin') !== new URL(request.url).origin
    || request.headers.get('x-requested-with') !== 'LosNinos'
    || !['same-origin', 'none', null].includes(request.headers.get('sec-fetch-site'))) reject(403, 'Use the owner sign-in page.');
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  if (action === 'request') {
    if (!env.RESEND_API_KEY || !env.EMAIL_FROM || /@resend\.dev\b/i.test(env.EMAIL_FROM)) reject(503, 'Owner email is not ready yet.');
    if (!await rate(env, `request-ip:${ip}`, 10, 900) || !await rate(env, `request-day:${ip}`, 60, 86400)) reject(429, 'Please wait before requesting another code.');
    if (typeof body.email !== 'string' || body.email.length > 254 || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(body.email.trim())) reject(400, 'Enter a valid email address.');
    const address = body.email.trim().toLowerCase();
    const challenge = randomToken();
    const idHash = await digest(env, 'challenge', challenge);
    let issued = false;
    if (ownerEmails(env).has(address) && await rate(env, `request-owner:${address}`, 3, 900)
      && await rate(env, `request-owner-day:${address}`, 10, 86400) && await rate(env, 'request-global', 20, 86400)) {
      const code = randomCode();
      const codeHash = await digest(env, 'code', `${idHash}:${code}`);
      await stmt(env, 'INSERT INTO owner_login_challenges(id_hash,email,code_hash,expires_at) VALUES (?,?,?,?)', idHash, address, codeHash, now() + CODE_TTL).run();
      issued = true;
      const task = sendCode(env, address, code, idHash);
      if (ctx?.waitUntil) ctx.waitUntil(task); else await task;
    }
    const message = { ok: true, message: 'If this email has owner access, check your inbox for a sign-in code. Requests are limited; if none arrives, wait before trying again.' };
    if (!issued) {
      // A throttled resend must not invalidate a usable code already in transit.
      const previous = cookie(request, LOGIN_COOKIE);
      if (previous && await stmt(env, `SELECT id_hash FROM owner_login_challenges WHERE id_hash=? AND email=?
        AND consumed_at IS NULL AND expires_at>? AND attempts<5`, await digest(env, 'challenge', previous), address, now()).first()) return json(message);
    }
    return json(message, [setCookie(LOGIN_COOKIE, challenge, CODE_TTL)]);
  }
  if (action === 'verify') {
    if (!await rate(env, `verify-ip:${ip}`, 30, 900)) reject(429, 'Please wait before trying another code.');
    const value = cookie(request, LOGIN_COOKIE);
    const code = typeof body.code === 'string' ? body.code.replace(/\s/g, '') : '';
    if (!value || !/^\d{6}$/.test(code)) reject(400, 'That code is invalid or expired. Request a new code if needed.');
    const idHash = await digest(env, 'challenge', value);
    const row = await stmt(env, 'SELECT email FROM owner_login_challenges WHERE id_hash=?', idHash).first();
    if (!row || !ownerEmails(env).has(row.email)) reject(400, 'That code is invalid or expired. Request a new code if needed.');
    const token = randomToken();
    const tokenHash = await digest(env, 'session', token);
    const codeHash = await digest(env, 'code', `${idHash}:${code}`);
    const stamp = now();
    const oldToken = cookie(request, SESSION_COOKIE);
    const oldHash = oldToken ? await digest(env, 'session', oldToken) : '';
    const result = await env.DB.batch([
      stmt(env, `UPDATE owner_login_challenges SET attempts=attempts+1,attempt_nonce=?
        WHERE id_hash=? AND consumed_at IS NULL AND expires_at>? AND attempts<5`, tokenHash, idHash, stamp),
      stmt(env, `INSERT INTO owner_sessions(token_hash,email,created_at,expires_at,last_seen)
        SELECT ?,email,?,?,? FROM owner_login_challenges
        WHERE id_hash=? AND code_hash=? AND attempt_nonce=? AND consumed_at IS NULL AND expires_at>?`,
      tokenHash, stamp, stamp + SESSION_TTL, stamp, idHash, codeHash, tokenHash, stamp),
      stmt(env, `UPDATE owner_login_challenges SET consumed_at=? WHERE id_hash=? AND attempt_nonce=?
        AND EXISTS (SELECT 1 FROM owner_sessions WHERE token_hash=?)`, stamp, idHash, tokenHash, tokenHash),
      stmt(env, 'DELETE FROM owner_sessions WHERE token_hash=? AND EXISTS (SELECT 1 FROM owner_sessions WHERE token_hash=?)', oldHash, tokenHash),
    ]);
    if (!result[1].meta.changes) reject(400, 'That code is invalid or expired. Request a new code if needed.');
    return json({ ok: true }, [setCookie(SESSION_COOKIE, token, SESSION_TTL), setCookie(LOGIN_COOKIE, '', 0)]);
  }
  if (action === 'logout') {
    const token = cookie(request, SESSION_COOKIE);
    if (token) await stmt(env, 'DELETE FROM owner_sessions WHERE token_hash=?', await digest(env, 'session', token)).run();
    const challenge = cookie(request, LOGIN_COOKIE);
    if (challenge) await stmt(env, 'DELETE FROM owner_login_challenges WHERE id_hash=?', await digest(env, 'challenge', challenge)).run();
    return json({ ok: true }, [setCookie(SESSION_COOKIE, '', 0), setCookie(LOGIN_COOKIE, '', 0)]);
  }
  reject(404, 'Not found.');
}

export async function ownerEmailSession(request, env) {
  if (!ownerEmailAuthReady(env) || !canonicalRequest(request, env)) return null;
  const token = cookie(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await digest(env, 'session', token);
  const stamp = now();
  const row = await stmt(env, `SELECT email FROM owner_sessions WHERE token_hash=? AND expires_at>? AND last_seen>?`, tokenHash, stamp, stamp - IDLE_TTL).first();
  if (!row || !ownerEmails(env).has(row.email)) return null;
  const active = await stmt(env, `UPDATE owner_sessions SET last_seen=? WHERE token_hash=? AND expires_at>? AND last_seen>? RETURNING email`, stamp, tokenHash, stamp, stamp - IDLE_TTL).first();
  return active ? { email: active.email, preview: false } : null;
}

export async function cleanupOwnerAuth(env) {
  if (env.OWNER_AUTH_MODE !== 'email') return;
  const stamp = now();
  await env.DB.batch([
    stmt(env, 'DELETE FROM owner_login_challenges WHERE expires_at<=?', stamp),
    stmt(env, 'DELETE FROM owner_sessions WHERE expires_at<=? OR last_seen<=?', stamp, stamp - IDLE_TTL),
  ]);
}
