// Signed-cookie session ID for ask_foundry.
//
// The session ID is a random UUID; the cookie value is `${uuid}.${sig}` where
// sig = HMAC-SHA256(uuid, SESSION_SECRET) encoded base64url. The cookie is
// HttpOnly so the frontend can never read or forge it, and SameSite=Lax so it
// rides on top-level navigations from the KAL Foundry site.
//
// If SESSION_SECRET isn't set (local dev), we fall back to a soft secret so the
// surface stays functional — but log a warning.

const COOKIE_NAME = 'lb_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const enc = new TextEncoder();
const dec = new TextDecoder();

function softSecret() {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    return process.env.SESSION_SECRET;
  }
  // dev-only fallback. Log loudly so it doesn't ship unnoticed.
  if (!globalThis.__lb_session_warned) {
    console.warn('[ask_foundry] SESSION_SECRET missing or too short — using insecure dev fallback');
    globalThis.__lb_session_warned = true;
  }
  return 'dev-fallback-secret-do-not-use-in-prod-please';
}

async function hmacKey() {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(softSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function b64urlFromBuffer(buf) {
  const bytes = new Uint8Array(buf);
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function bufferFromB64url(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice(0, (4 - (b64url.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

async function signId(id) {
  const key = await hmacKey();
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(id));
  return b64urlFromBuffer(sig);
}

async function verifyId(id, sig) {
  try {
    const key = await hmacKey();
    return crypto.subtle.verify('HMAC', key, bufferFromB64url(sig), enc.encode(id));
  } catch {
    return false;
  }
}

function parseCookieHeader(header) {
  const out = Object.create(null);
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function buildSetCookie(value) {
  const attrs = [
    `${COOKIE_NAME}=${value}`,
    'Path=/',
    `Max-Age=${COOKIE_MAX_AGE}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ];
  return attrs.join('; ');
}

/**
 * Returns `{ id, setCookie? }`. `setCookie` is present only when a fresh
 * session was issued (the caller should attach it to the response headers).
 */
export async function getOrIssueSession(req) {
  const cookies = parseCookieHeader(req.headers.get('cookie'));
  const raw = cookies[COOKIE_NAME];
  if (raw && raw.includes('.')) {
    const [id, sig] = raw.split('.', 2);
    if (id && sig && (await verifyId(id, sig))) {
      return { id, fresh: false };
    }
  }
  const id = crypto.randomUUID();
  const sig = await signId(id);
  return { id, fresh: true, setCookie: buildSetCookie(`${id}.${sig}`) };
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
