// Runtime semantic search over the 90-patent Upstash Vector index.
//
// Two-hop:
//   1. Embed the user's query via OpenAI text-embedding-3-small.
//   2. POST that vector to Upstash Vector /query with top-K and metadata.
//
// Both hops fail open — if credentials are missing or either service returns
// an error, the caller falls back to the token-overlap searchPatents() in
// _knowledge.js so the chat keeps working.

const EMBED_MODEL = 'text-embedding-3-small';
const EMBED_DIMS = 1536;

// Note: full structured records are written to api/_patents.full.json by the
// ingest script for documentation / scripting use. The Edge function does NOT
// load that file at runtime — Vercel Edge can't resolve `new URL()` against
// the deployment bundle reliably, and every field we need is already mirrored
// in Upstash Vector metadata (pub, title, domain, status, filed_date).

function vectorEnv() {
  const url = process.env.UPSTASH_VECTOR_REST_URL;
  const token = process.env.UPSTASH_VECTOR_REST_TOKEN;
  if (!url || !token) {
    if (!globalThis.__lb_vector_warned) {
      console.warn('[ask_foundry] UPSTASH_VECTOR_REST_URL/TOKEN missing — semantic patent search disabled');
      globalThis.__lb_vector_warned = true;
    }
    return null;
  }
  return { url: url.replace(/\/$/, ''), token };
}

async function embed(query) {
  if (!process.env.OPENAI_API_KEY) return null;
  const resp = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: query, dimensions: EMBED_DIMS }),
  });
  if (!resp.ok) {
    console.error('[ask_foundry] embedding failed', resp.status);
    return null;
  }
  const j = await resp.json();
  return j.data?.[0]?.embedding || null;
}

/**
 * Semantic top-K patent search. Returns the same shape as searchPatents() in
 * _knowledge.js so the dispatch layer can swap them transparently.
 *
 * @param {string} query
 * @param {number} k
 * @returns {Promise<Array<{pub,title,domain,abstract,status?,filed_date?}>>|null}
 *          Returns null when semantic search is unavailable so the caller knows
 *          to fall back to token search.
 */
export async function searchPatentsSemantic(query, k = 3) {
  const env = vectorEnv();
  if (!env) return null;
  const q = String(query || '').trim();
  if (!q) return [];

  const vec = await embed(q);
  if (!vec) return null;

  const resp = await fetch(`${env.url}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      vector: vec,
      topK: k,
      includeMetadata: true,
    }),
  });
  if (!resp.ok) {
    console.error('[ask_foundry] upstash vector query', resp.status);
    return null;
  }
  const j = await resp.json();
  const matches = j.result || j.matches || [];

  return matches.map((m) => {
    const meta = m.metadata || {};
    return {
      pub: meta.pub || m.id,
      title: meta.title || '',
      domain: meta.domain || '',
      status: meta.status || '',
      filed_date: meta.filed_date || '',
      // No abstract in this dataset — keep the field present for API parity.
      abstract: '',
      score: m.score,
    };
  });
}
