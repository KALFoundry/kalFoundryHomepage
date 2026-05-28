#!/usr/bin/env node
/**
 * TEMPLATE — one-time ingest for the foundry's patent portfolio.
 *
 * Pulls patent records out of a source HTML file, embeds each with OpenAI
 * text-embedding-3-small, uploads to an Upstash Vector index, and writes a
 * structured JSON file the Edge function can use to hydrate match metadata
 * at query time.
 *
 * NOTE: no source data is wired in yet — the foundry's patent portfolio is
 * coming soon. `SRC` points at a placeholder path (`_source/patents.html`).
 * This script will not run successfully until that source file exists.
 *
 * Required env (loaded from api/.env if present):
 *   OPENAI_API_KEY
 *   UPSTASH_VECTOR_REST_URL
 *   UPSTASH_VECTOR_REST_TOKEN
 *
 * Run:
 *   node scripts/ingest-patents.mjs
 *
 * Idempotent — re-running upserts the same IDs.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Minimal .env loader (no dotenv dep). Only sets vars that aren't already set.
async function loadEnvFile(path) {
  try {
    const raw = await readFile(path, 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      const [, k, vRaw] = m;
      if (process.env[k]) continue;
      const v = vRaw.trim().replace(/^['"]|['"]$/g, '');
      process.env[k] = v;
    }
  } catch { /* missing .env is fine */ }
}
await loadEnvFile(resolve(ROOT, 'api/.env'));

function need(name) {
  if (!process.env[name]) {
    console.error(`[ingest] missing env: ${name}`);
    process.exit(1);
  }
  return process.env[name];
}

const OPENAI_API_KEY = need('OPENAI_API_KEY');
const VECTOR_URL = need('UPSTASH_VECTOR_REST_URL').replace(/\/$/, '');
const VECTOR_TOKEN = need('UPSTASH_VECTOR_REST_TOKEN');

const EMBED_MODEL = 'text-embedding-3-small';
const EMBED_DIMS = 1536;

// ───── extract ─────────────────────────────────────────────────────────────

// Placeholder source path for the foundry's patent portfolio. No source data
// is wired in yet — drop a `_source/patents.html` with a `const DATA = {…};`
// blob here when the foundry's filings are ready to ingest.
const SRC = resolve(ROOT, '_source/patents.html');
const html = await readFile(SRC, 'utf8');

// The file contains a single line of the form: `const DATA = {…};` followed by
// other script. Find the JSON object and parse it.
const match = html.match(/const\s+DATA\s*=\s*(\{[\s\S]*?\});/);
if (!match) {
  console.error('[ingest] could not find `const DATA = {...};` in source HTML');
  process.exit(1);
}
let data;
try {
  data = JSON.parse(match[1]);
} catch (e) {
  console.error('[ingest] DATA blob is not valid JSON:', e.message);
  process.exit(1);
}

const records = Array.isArray(data.records) ? data.records : [];
console.log(`[ingest] extracted ${records.length} patents from the foundry's patent portfolio source`);

function slugForRecord(r) {
  return (r.grant_number || r.publication_number || 'unknown').toString().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function publishedAs(r) {
  if (r.grant_number) return `US ${r.grant_number}`;
  if (r.publication_number) return `US ${r.publication_number}`;
  return 'unknown';
}

function embedText(r) {
  // Concatenate the fields that matter for semantic match. Order matters a
  // little — title first so it carries the most signal in cosine space.
  return [
    r.title,
    `domain: ${r.category}`,
    `status: ${r.status}`,
    `inventors: ${(r.inventors || []).slice(0, 4).join(', ')}`,
  ].filter(Boolean).join('. ');
}

const enriched = records.map((r, i) => ({
  id: `pat-${slugForRecord(r)}-${i.toString(36)}`,
  pub: publishedAs(r),
  title: r.title,
  domain: r.category,
  status: r.status,
  filed_date: r.filed_date,
  inventors: r.inventors || [],
  ...(r.grant_number ? { grant_number: r.grant_number, grant_date: r.grant_date } : {}),
  ...(r.publication_number ? { publication_number: r.publication_number, publication_date: r.publication_date } : {}),
  embed_text: embedText(r),
}));

// ───── embed ───────────────────────────────────────────────────────────────

async function embedBatch(texts) {
  const resp = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts, dimensions: EMBED_DIMS }),
  });
  if (!resp.ok) {
    throw new Error(`openai embeddings ${resp.status}: ${await resp.text()}`);
  }
  const j = await resp.json();
  return j.data.map((d) => d.embedding);
}

const BATCH = 50;
const vectors = [];
for (let i = 0; i < enriched.length; i += BATCH) {
  const chunk = enriched.slice(i, i + BATCH);
  const embeddings = await embedBatch(chunk.map((r) => r.embed_text));
  for (let j = 0; j < chunk.length; j++) {
    vectors.push({ id: chunk[j].id, vector: embeddings[j], record: chunk[j] });
  }
  console.log(`[ingest] embedded ${vectors.length}/${enriched.length}`);
}

// ───── upload to Upstash Vector ────────────────────────────────────────────

// REST shape (Upstash Vector v1):
//   POST /upsert  body: { id, vector, metadata } or array of same
async function upsertBatch(batch) {
  const body = batch.map((v) => ({
    id: v.id,
    vector: v.vector,
    metadata: {
      pub: v.record.pub,
      title: v.record.title,
      domain: v.record.domain,
      status: v.record.status,
      filed_date: v.record.filed_date,
    },
  }));
  const resp = await fetch(`${VECTOR_URL}/upsert`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${VECTOR_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`upstash upsert ${resp.status}: ${await resp.text()}`);
}

for (let i = 0; i < vectors.length; i += BATCH) {
  await upsertBatch(vectors.slice(i, i + BATCH));
  console.log(`[ingest] upserted ${Math.min(i + BATCH, vectors.length)}/${vectors.length}`);
}

// ───── persist structured records for runtime hydration ────────────────────

const out = enriched.map(({ embed_text, ...rest }) => rest);
await writeFile(resolve(ROOT, 'api/_patents.full.json'), JSON.stringify(out, null, 2));
console.log(`[ingest] wrote api/_patents.full.json (${out.length} records)`);

// ───── final stats ─────────────────────────────────────────────────────────

const stats = await fetch(`${VECTOR_URL}/info`, {
  headers: { Authorization: `Bearer ${VECTOR_TOKEN}` },
}).then((r) => r.json()).catch(() => null);
console.log('[ingest] index info:', stats?.result || stats);

console.log('[ingest] done.');
