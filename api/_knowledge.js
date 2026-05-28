// Server-side knowledge base for the ask_foundry AI assistant (Forge).
// Shared between api/ask.js (function-calling chat) and the standalone MCP server.
//
// Content describes KAL Foundry — a digital foundry / studio (design, AI, and
// digital products, strategy through fabrication). Company-level content only:
// no individual persona, no fabricated metrics, no clients or case studies.
// Several sections are intentionally minimal ("coming soon") to be filled in
// later with the foundry's own real content.

export const KNOWLEDGE_BASE = `
# About KAL Foundry

## Identity
- KAL Foundry is a digital foundry / studio: design, AI, and digital products — strategy through fabrication.
- A small team building thoughtful products and shipping real systems.

## What the foundry does
- **Design & Brand** — identity, design systems, and the look and feel of a product or company.
- **Strategy & AI Consulting** — AI strategy and architecture, agentic systems, and the path from idea to production.
- **Digital Products** — full-stack web and mobile apps, from prototype to launch.
- **Production & Launch** — fabrication, build-out, and shipping real systems customers can run on a Tuesday.

## Products
- **Armory Hub** — a security-first mobile app for personal firearm, ammo, and accessory inventory.
- **backgClear** — a SaaS tool for fast, clean background removal.
- **Ironwork Series** — architectural metalwork; the foundry's fabrication craft made physical.

## Case studies
- Case studies are coming soon — the foundry is preparing write-ups of its work.

## Patents
- The foundry's patent portfolio is being published — nothing to share yet.

## Principles (how the foundry works)
1. **Learn deeply, then make it usable.** The best technical work makes complicated systems easier for customers and teams to understand, trust, and operate.
2. **Build to understand, not just to describe.** The team learns fastest by making things. Demos, prototypes, and pilots reveal constraints that diagrams and slide decks miss.
3. **Respect the business context, not just the stack.** Architecture only matters when it helps a real person solve a real problem.
4. **Stay persistent when the path is unclear.** Keep showing up, keep debugging, keep moving.
5. **Bring confidence without ego.** Enough experience to lead, enough humility to listen, enough curiosity to keep improving.

## Who the foundry serves
- Open to conversations about workshops, architecture reviews, design engagements, and full-build product work.
- Engagements range from production systems and AI to brand, design, and shipped digital products.

## Contact
- Email: team@kalfoundry.com
- GitHub: github.com/kalfoundry
- LinkedIn: linkedin.com/company/kalfoundry
- Site: www.kalfoundry.com
`;

// ─────────────────────────────────────────────────────────────────────────────
// PATENTS — curated set the lookup_patent tool can search.
// Substring-matches across pub / title / abstract / domain.
// Intentionally empty: the foundry's patent portfolio is being published —
// repopulate only with the foundry's own filings.
// ─────────────────────────────────────────────────────────────────────────────

export const PATENTS = [];

// ─────────────────────────────────────────────────────────────────────────────
// PAGES — relative URLs the link_to_page tool can return.
// ─────────────────────────────────────────────────────────────────────────────

export const PAGES = {
  work: { href: '/work.html', label: 'selected work — KAL Foundry products' },
  case: { href: '/case.html', label: 'featured case study — coming soon' },
  patents: { href: '/patents.html', label: 'patents — portfolio being published' },
  resume: { href: '/resume.html', label: 'team & capabilities — design, AI, and digital products' },
  now: { href: '/now.html', label: 'now — what the foundry is focused on' },
  about: { href: '/about.html', label: 'about — the foundry and how it works' },
};

// Hand-tagged keywords per page so recommend_next_page can score relevance
// without burning an embedding call. Order matters for tie-breaking.
const PAGE_KEYWORDS = {
  case:    ['case', 'study', 'rag', 'document', 'retrieval', 'pilot', 'pipeline', 'example'],
  work:    ['work', 'product', 'products', 'armory', 'backgclear', 'ironwork', 'app', 'mobile', 'saas', 'metalwork'],
  patents: ['patent', 'invention', 'filings', 'granted', 'inventor', 'ip', 'domains', 'idea', 'novelty', 'portfolio'],
  resume:  ['services', 'service', 'design', 'brand', 'consulting', 'strategy', 'products', 'production', 'launch', 'offerings', 'team', 'capabilities', 'experience', 'background'],
  now:     ['now', 'currently', 'focus', 'today', 'shipping', 'next', 'roadmap', 'open to'],
  about:   ['about', 'bio', 'principles', 'story', 'values', 'how it works', 'team', 'foundry', 'philosophy'],
};

export function recommendNextPage(topic, limit = 2) {
  const tokens = tokenize(topic);
  if (tokens.length === 0) return Object.entries(PAGES).slice(0, limit).map(([k, v]) => ({ page: k, ...v, score: 0 }));
  const scored = Object.keys(PAGES).map((k) => {
    const kw = PAGE_KEYWORDS[k] || [];
    const kwTokens = new Set(kw.flatMap(tokenize));
    const hits = tokens.filter((t) => kwTokens.has(t)).length;
    return { page: k, ...PAGES[k], score: hits };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

// Structured timeline of the foundry's milestones, surfaced by the
// get_career_timeline tool. Intentionally empty for now — the foundry's
// milestones are coming soon. Repopulate with the foundry's own milestones.
export const CAREER_TIMELINE = [];

// The foundry's client engagements / case studies. compare_engagements filters
// this by domain substring. Intentionally empty for now — case studies are
// coming soon. Repopulate with the foundry's own engagements.
export const ENGAGEMENTS = [];

export function compareEngagements(domain, limit = 4) {
  const q = String(domain || '').toLowerCase().trim();
  if (!q) return [];
  const tokens = tokenize(q);
  const scored = ENGAGEMENTS.map((e) => {
    const hay = (e.title + ' ' + e.blurb + ' ' + e.domains.join(' ')).toLowerCase();
    const domainHit = e.domains.some((d) => d.includes(q) || q.includes(d)) ? 3 : 0;
    const tokenHits = tokens.filter((t) => hay.includes(t)).length;
    return { e, score: domainHit + tokenHits };
  });
  return scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.e);
}

// ─────────────────────────────────────────────────────────────────────────────
// Patent search — token-overlap matching that beats raw substring on paraphrased
// queries (e.g. a loosely worded topic vs an exact patent title). Light stop-word
// filter, simple stemming, ranked by overlap. (PATENTS is currently empty, so
// searchPatents returns [] until the foundry's own filings are added.)
// ─────────────────────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'have',
  'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was',
  'were', 'will', 'with', 'about', 'into', 'over', 'under', 'across', 'his',
  'her', 'their', 'them', 'me', 'my', 'i', 'we', 'us', 'you', 'your', 'he',
  'she', 'they', 'how', 'what', 'when', 'where', 'who', 'why', 'tell',
]);

function tokenize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map((t) => t.replace(/(ies|es|s)$/, '')); // crude stemmer
}

export function searchPatents(query, limit = 3) {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const scored = PATENTS.map((p) => {
    const hayTokens = new Set(tokenize(`${p.pub} ${p.title} ${p.abstract} ${p.domain}`));
    const hits = tokens.filter((t) => hayTokens.has(t)).length;
    // also award substring match on pub number (people paste numbers verbatim)
    const substr = String(p.pub).toLowerCase().includes(String(query).toLowerCase()) ? 5 : 0;
    return { p, score: hits + substr };
  });

  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.p);
}
