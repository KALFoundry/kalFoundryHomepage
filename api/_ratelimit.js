// Per-session + per-IP rate limit backed by Upstash Redis REST.
//
// Two independent budgets:
//   1. Session budget — 10 messages / 24h per signed session cookie.
//   2. IP budget      — 50 messages / 24h per IP. Catches users who clear
//                       cookies between bursts. 5× the session ceiling so
//                       legitimate cookie loss (private window, etc.) still
//                       resolves through it.
//
// Both budgets reset at UTC midnight (one Redis key per UTC day, EXPIRE 24h
// from first write). The reset boundary keeps logic dead-simple — no rolling
// windows, no Lua scripts.
//
// If UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are missing we degrade
// to "no limit" mode and log a single warning. This lets `vercel dev` and
// first-time deploys work without prerequisite Upstash setup.

const SESSION_LIMIT = 10;
const IP_LIMIT = 50;
const BURST_LIMIT = 3;            // requests per minute
const DAY_SECONDS = 60 * 60 * 24;
const MINUTE_SECONDS = 60;

function tomorrowMidnightISO() {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.toISOString();
}

function dayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

function upstashEnv() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (!globalThis.__lb_ratelimit_warned) {
      console.warn('[ask_foundry] UPSTASH_REDIS_REST_URL/TOKEN missing — rate limiting disabled');
      globalThis.__lb_ratelimit_warned = true;
    }
    return null;
  }
  return { url, token };
}

// Pipeline two commands (INCR + EXPIRE-on-first) in one HTTP round trip.
// Upstash pipeline endpoint accepts an array of command arrays and returns
// an array of `{ result }` / `{ error }` objects in order.
async function incrementWithExpire(key, ttlSeconds = DAY_SECONDS) {
  const env = upstashEnv();
  if (!env) return null;
  const resp = await fetch(`${env.url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([
      ['INCR', key],
      ['EXPIRE', key, ttlSeconds, 'NX'], // NX = set TTL only if no TTL yet
    ]),
  });
  if (!resp.ok) {
    console.error('[ask_foundry] upstash pipeline failed', resp.status, await resp.text());
    return null;
  }
  const arr = await resp.json();
  const incr = arr[0];
  if (!incr || typeof incr.result !== 'number') return null;
  return incr.result;
}

/**
 * Atomically consume one unit of the session budget and one unit of the IP
 * budget. If either is exhausted, returns `{ ok: false, ... }` with the
 * exceeded scope and a UTC reset timestamp.
 *
 * @param {string} sessionId  signed session id (verified by _session.js)
 * @param {string} ip         remote address (best-effort from x-forwarded-for)
 * @returns {{ ok: boolean, remaining: number, resetAt: string, exceeded?: 'session'|'ip' }}
 */
export async function consumeBudget(sessionId, ip) {
  const env = upstashEnv();
  // No Upstash configured → don't gate (dev / first-deploy mode).
  if (!env) {
    return { ok: true, remaining: SESSION_LIMIT, resetAt: tomorrowMidnightISO(), disabled: true };
  }

  const day = dayKey();
  const minute = new Date().toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
  const sessionKey = `ask:s:${sessionId}:${day}`;
  const ipKey = `ask:i:${(ip || 'unknown').replace(/[^0-9a-fA-F.:]/g, '')}:${day}`;
  const burstKey = `ask:b:${sessionId}:${minute}`;

  // Fire all three in parallel; one HTTP round trip per key, ~50ms total.
  const [sCount, ipCount, bCount] = await Promise.all([
    incrementWithExpire(sessionKey, DAY_SECONDS),
    incrementWithExpire(ipKey, DAY_SECONDS),
    incrementWithExpire(burstKey, MINUTE_SECONDS),
  ]);

  // If any failed, fail open (don't break the chat over a Redis hiccup).
  if (sCount === null || ipCount === null || bCount === null) {
    return { ok: true, remaining: SESSION_LIMIT, resetAt: tomorrowMidnightISO(), degraded: true };
  }

  if (bCount > BURST_LIMIT) {
    // Burst rolls off in <60s — return a resetAt at the start of the next
    // minute so the UI can show a short timer rather than tomorrow's reset.
    const nextMinute = new Date();
    nextMinute.setSeconds(60, 0);
    return {
      ok: false,
      remaining: Math.max(0, SESSION_LIMIT - sCount + 1), // refund the day count we just incremented
      resetAt: nextMinute.toISOString(),
      exceeded: 'burst',
    };
  }
  if (sCount > SESSION_LIMIT) {
    return { ok: false, remaining: 0, resetAt: tomorrowMidnightISO(), exceeded: 'session' };
  }
  if (ipCount > IP_LIMIT) {
    return { ok: false, remaining: 0, resetAt: tomorrowMidnightISO(), exceeded: 'ip' };
  }
  return {
    ok: true,
    remaining: Math.max(0, SESSION_LIMIT - sCount),
    resetAt: tomorrowMidnightISO(),
  };
}

/**
 * Read-only check — used by the `?meta=1` GET endpoint so the frontend can
 * show the rate-limit pill without consuming a unit.
 */
export async function peekBudget(sessionId) {
  const env = upstashEnv();
  if (!env) return { remaining: SESSION_LIMIT, resetAt: tomorrowMidnightISO(), disabled: true };
  const day = dayKey();
  const key = `ask:s:${sessionId}:${day}`;
  const resp = await fetch(`${env.url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${env.token}` },
  });
  if (!resp.ok) return { remaining: SESSION_LIMIT, resetAt: tomorrowMidnightISO(), degraded: true };
  const { result } = await resp.json();
  const used = result ? parseInt(result, 10) || 0 : 0;
  return {
    remaining: Math.max(0, SESSION_LIMIT - used),
    resetAt: tomorrowMidnightISO(),
  };
}

export const RATE_LIMITS = { SESSION_LIMIT, IP_LIMIT, BURST_LIMIT };
