import { ownerEmailSession } from './email-auth.mjs';

const JWKS_CACHE_MS = 5 * 60 * 1000;
const CLOCK_SKEW_SECONDS = 30;
const keyCaches = new WeakMap();

function forbidden() {
  return Object.assign(new Error('Owner sign-in is required.'), { status: 403 });
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function decodeBase64url(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) {
    throw forbidden();
  }
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function decodeJSON(value) {
  const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decodeBase64url(value)));
  if (!object(parsed)) throw forbidden();
  return parsed;
}

function accessConfiguration(env) {
  const configuredDomain = String(env.ACCESS_TEAM_DOMAIN || '').trim().replace(/\/$/, '');
  // Never construct a signing-key URL from a token or an incoming request.
  if (!/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/i.test(configuredDomain)) {
    throw forbidden();
  }
  const issuer = new URL(configuredDomain).origin;
  const audience = String(env.ACCESS_AUD || '').trim();
  if (!audience || audience.length > 256 || /\s/.test(audience)) throw forbidden();
  return { issuer, audience };
}

async function signingKeys(issuer, env) {
  const fetcher = typeof env.FETCH === 'function' ? env.FETCH : globalThis.fetch;
  if (typeof fetcher !== 'function') throw forbidden();
  let cache = keyCaches.get(fetcher);
  if (!cache) {
    cache = new Map();
    keyCaches.set(fetcher, cache);
  }
  const existing = cache.get(issuer);
  if (existing && existing.expires > Date.now()) return existing.promise;

  const promise = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetcher(`${issuer}/cdn-cgi/access/certs`, {
        headers: { Accept: 'application/json' },
        redirect: 'manual',
        signal: controller.signal,
      });
      if (!response.ok) throw forbidden();
      const body = await response.text();
      if (body.length > 128 * 1024) throw forbidden();
      const data = JSON.parse(body);
      if (!object(data) || !Array.isArray(data.keys) || !data.keys.length || data.keys.length > 20) {
        throw forbidden();
      }
      return data.keys;
    } finally {
      clearTimeout(timer);
    }
  })();
  const entry = { expires: Date.now() + JWKS_CACHE_MS, promise };
  cache.set(issuer, entry);
  try {
    return await promise;
  } catch (error) {
    if (cache.get(issuer) === entry) cache.delete(issuer);
    throw error;
  }
}

export function isLocalPreview(request, env = {}) {
  if (env.LOCAL_PREVIEW !== 'true' || env.STORE_MODE === 'live') return false;
  try {
    const url = new URL(request.url);
    return ['http:', 'https:'].includes(url.protocol)
      && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

/** Validate the Cloudflare Access application token; this alone does not grant owner access. */
export async function validateAccessJWT(token, env = {}) {
  try {
    const { issuer, audience } = accessConfiguration(env);
    if (typeof token !== 'string' || token.length > 24 * 1024) throw forbidden();
    const parts = token.split('.');
    if (parts.length !== 3) throw forbidden();
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const header = decodeJSON(encodedHeader);
    const payload = decodeJSON(encodedPayload);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid || header.kid.length > 256
      || (header.typ !== undefined && header.typ !== 'JWT') || header.crit !== undefined || header.b64 !== undefined) {
      throw forbidden();
    }

    const now = Math.floor(Date.now() / 1000);
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (payload.iss !== issuer || !audiences.every((item) => typeof item === 'string') || !audiences.includes(audience)
      || !Number.isSafeInteger(payload.exp) || payload.exp <= now
      || !Number.isSafeInteger(payload.iat) || payload.iat <= 0 || payload.iat > now + CLOCK_SKEW_SECONDS
      || payload.iat >= payload.exp
      || (payload.nbf !== undefined && (!Number.isSafeInteger(payload.nbf) || payload.nbf < 0
        || payload.nbf > now + CLOCK_SKEW_SECONDS || payload.nbf >= payload.exp))) {
      throw forbidden();
    }

    const keys = await signingKeys(issuer, env);
    const matches = keys.filter((key) => object(key) && key.kid === header.kid);
    if (matches.length !== 1) throw forbidden();
    const jwk = matches[0];
    if (jwk.kty !== 'RSA' || (jwk.alg !== undefined && jwk.alg !== 'RS256')
      || (jwk.use !== undefined && jwk.use !== 'sig')
      || (jwk.key_ops !== undefined && (!Array.isArray(jwk.key_ops) || !jwk.key_ops.includes('verify')))
      || typeof jwk.n !== 'string' || decodeBase64url(jwk.n).length < 256) {
      throw forbidden();
    }
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decodeBase64url(encodedSignature),
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`));
    if (!valid) throw forbidden();
    return payload;
  } catch {
    // Fail closed without revealing token contents or configuration in responses.
    throw forbidden();
  }
}

export async function authorizeAdmin(request, env = {}) {
  if (isLocalPreview(request, env)) return { email: 'local-preview@localhost', preview: true };
  try {
    if (env.OWNER_AUTH_MODE === 'email') {
      const actor = await ownerEmailSession(request, env);
      if (!actor) throw forbidden();
      return actor;
    }
    if (env.OWNER_AUTH_MODE && env.OWNER_AUTH_MODE !== 'cloudflare') throw forbidden();
    const owners = new Set(String(env.OWNER_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));
    if (!owners.size) throw forbidden();
    const payload = await validateAccessJWT(request.headers.get('Cf-Access-Jwt-Assertion'), env);
    if (typeof payload.email !== 'string' || !payload.email || payload.email !== payload.email.trim()) throw forbidden();
    const email = payload.email.toLowerCase();
    if (!owners.has(email)) throw forbidden();
    return { email, preview: false };
  } catch {
    throw forbidden();
  }
}
