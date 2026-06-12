# kalfoundry.com — Project Report

**Status:** ✅ Production · `https://www.kalfoundry.com`
**Owner:** KAL Foundry · Digital Foundry · AI · Product
**Last updated:** 2026-05-27

---

## 1 · What it is

A studio site for KAL Foundry — a digital foundry for design, AI, and digital products, strategy through fabrication. A small team serving clients from Fortune 500 to solo founders. The site was forked from a personal-portfolio template and rebranded; **all of the original owner's personal content has been removed** and several pages are intentionally minimal placeholders. Two audiences in mind:

- **Prospective clients** — quickly understand the foundry's capabilities, work, and how the studio operates
- **Technical peers** — see a real, production-grade AI agent (ask_foundry / "Forge") that demonstrates function-calling tools, RAG, defense-in-depth, and MCP integration

The site is intentionally **vanilla HTML/CSS/JS with no build step**, with the AI surfaces powered by lightweight Vercel Edge Functions. The bet: production-quality engineering judgement shows clearest in restraint, not framework theatrics.

---

## 2 · Surfaces (18 deployed pages)

### Core narrative pages (7)
| Page | Purpose |
|---|---|
| `index.html` | Parallax homepage. macOS desktop ≥768px, iOS home screen <768px. Scroll-driven zoom-in. |
| `about.html` | Studio story + 5 principles |
| `now.html` | Q2 2026 focus, what's shipping next, MCP showcase block |
| `work.html` | Selected work (the foundry's products) — filterable card grid |
| `case.html` | Placeholder case-study template (content to come) |
| `patents.html` | Patent portfolio — minimal placeholder shell (data arrays empty; render/filter JS preserved) |
| `resume.html` | Team / capabilities page + JSON-LD schema |

### Communication
| Page | Purpose |
|---|---|
| `messages.html` | Two-thread chat surface: **Forge** (AI / ask_foundry) + **the team** (direct email via Resend) |

### Documentation
| Page | Purpose |
|---|---|
| `architecture.html` | Full system design of ask_foundry — flow diagram, defenses, tools, stack |

### Device-frame apps (visible only from homepage device dock)
| Page | Purpose |
|---|---|
| `finder.html` | macOS Finder UI — file-listing navigation |
| `files.html` | iOS Files UI — same navigation, mobile-skinned |
| `iterm2.html` | Emulated zsh terminal with virtual filesystem (`open`, `cat`, `ls`, etc.) |
| `trello.html` | Kanban board: services · active · shipped · patents · stack |
| `arcade.html` + `snake.html` + `tetris.html` + `breakout.html` | Brand-styled browser games (side-experiment artifacts) |

### Redirects / glue
| Page | Purpose |
|---|---|
| `cv.html` | 308 redirect → `resume.html` (back-compat for old bookmarks) |

**Total deployed pages: 18** (17 unique + 1 redirect).

---

## 3 · ask_foundry — the agentic AI showcase

### Backend (`api/ask.js`, 854 LOC)

A single Vercel Edge Function. POST `/api/ask` accepts a chat history and returns a typed Server-Sent Events stream. The function orchestrates six stages per request:

1. **Signed session cookie** — HMAC-SHA256 over a `SESSION_SECRET`. HttpOnly, SameSite=Lax, 30-day Max-Age.
2. **Input sanitization** — strips control chars and zero-width unicode (homoglyph / smuggling defense). Caps each user message at 4 000 chars, history at 20 messages.
3. **OpenAI moderation pre-screen** — `omni-moderation-latest` rejects abusive content before the LLM is invoked. ~30 ms latency, ~$0 cost.
4. **Rate limit** — Upstash Redis pipelined `INCR + EXPIRE`. Three independent budgets:
   - 10 messages/day per session
   - 50 messages/day per IP
   - 3 messages/minute per session (burst limit)
5. **OpenAI streaming chat-completions** — `gpt-4.1`, six function-calling tools declared, `stream_options.include_usage = true`. System prompt is the curated `KNOWLEDGE_BASE` from `api/_knowledge.js` followed by `ABSOLUTE_RULES` from `api/_security.js` (recency-anchored hard rules).
6. **Tool-dispatch loop** — up to two rounds of tool execution. Each call emits reasoning preview + tool_call + tool_result SSE events. Mid-stream + final output scrubber catches any prompt-leak or first-person impersonation.

The response stream is a **typed envelope** the frontend renders distinctly:

| Event type | What it triggers in the UI |
|---|---|
| `delta` | Text chunk appended to the current bubble |
| `reasoning` | Italic gray "↪ checking the page index…" line |
| `tool_call` | Tool-bubble with spinner |
| `tool_result` | Tool-bubble flips to ✓ / ✗; renders link card or timeline component if applicable |
| `meta` | Updates the rate-limit pill |
| `refusal` | Replaces bubble + appends `why?` link → modal |
| `debug` | Stores model / tokens / latency / tools for the `⌃ debug` panel |

### Tools (6)
| Tool | Purpose | Implementation |
|---|---|---|
| `send_contact_email` | Drafts an email to the team | HTTP → `/api/contact` (Resend) |
| `lookup_patent` | Semantic search across the foundry's patent filings | OpenAI `text-embedding-3-small` → Upstash Vector cosine query. Falls back to token search if Vector unavailable. Vector store is currently empty (no records). |
| `link_to_page` | Returns a single site page URL | Closed-enum lookup |
| `recommend_next_page` | Suggests 1–2 pages by topic relevance | Token-overlap score over hand-tagged page keywords |
| `get_career_timeline` | Returns the foundry's structured arc | Renders as a vertical timeline component in the chat |
| `compare_engagements` | Filters engagements by domain | Domain-substring + token-overlap score |

### MCP server (`mcp-server/server.js`, 314 LOC)

Same six tools exposed over the Model Context Protocol via stdio. Lets Claude Desktop / Claude Code / any MCP host attach to ask_foundry and call the tools from a local Node process.

Also publishes the curated knowledge base as a read-only `ask-foundry://knowledge` MCP resource for hosts that prefer reading over tool-calling.

Activation flow (documented in `mcp-server/README.md`):
```json
{
  "mcpServers": {
    "ask_foundry": {
      "command": "node",
      "args": ["/absolute/path/to/kalfoundry/mcp-server/server.js"]
    }
  }
}
```

### Defense-in-depth (5 layers)

| Layer | What it catches | Implementation |
|---|---|---|
| Input sanitization | Control-char / zero-width-unicode smuggling | `api/_security.js` regex strip + length cap |
| Defensive system prompt | Most prompt-injection attempts | Nine "ABSOLUTE RULES" appended last for highest recency |
| Moderation pre-screen | Abusive content categories | OpenAI Moderation API call before chat-completions |
| Output scrubber | Leaks of system content or first-person impersonation | `scrubOutput()` regex + `FALLBACK_REPLY` |
| Rate limit | Cost runaway, abuse bursts | Upstash Redis 3-key budget (session/day, IP/day, burst/minute) |
| Origin allowlist (CORS) | Embedding from foreign sites | Set membership over kalfoundry.com + www + localhost |

### Frontend (`messages.html`, ~2 100 LOC inline)

- Markdown rendering (hand-rolled, ~80 LOC, XSS-safe)
- iMessage-palette bubbles · typing indicator · reasoning preview line · tool-call bubble · link card · timeline component · engagement card
- Rate-limit pill in header · 429 banner above composer · debug panel toggle
- Transparency modal for refusals
- localStorage persistence keyed by stable client-session id
- iOS-grade keyboard handling (`interactive-widget=resizes-content`, visualViewport listener, sticky header anchored to dvh)

---

## 4 · Infrastructure stack (everything is on free tiers)

| Layer | Service | Tier | Role |
|---|---|---|---|
| Edge runtime | Vercel | Hobby | Edge Functions + static asset hosting |
| DNS + CDN + WAF | Cloudflare | Free | DNS, proxy/orange-cloud, Bot Fight Mode, Web Analytics |
| Vector store | Upstash Vector | Free | Patent embeddings (currently empty), cosine similarity |
| KV store | Upstash Redis | Free | Rate-limit counters (3 keys per request) |
| LLM | OpenAI | Pay-as-you-go (capped) | `gpt-4.1` for chat · `text-embedding-3-small` for vector · `omni-moderation-latest` for moderation |
| Transactional email | Resend | Free | `/api/contact` → team@kalfoundry.com |
| Analytics | Cloudflare Web Analytics | Free | Visitor count, top pages, devices, countries — bot-filtered |

**Cost ceiling:** ~$25/month worst-case (OpenAI hard cap). At realistic studio-site traffic (≤100 conversations/month) actual spend is **single-digit dollars/month**.

---

## 5 · Security posture

### HTTP response headers (set in `vercel.json`)
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` (2-year HSTS)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=()`

### Cloudflare zone config
- SSL/TLS mode: **Full (strict)**
- Always Use HTTPS: on · Automatic HTTPS Rewrites: on · Min TLS 1.2
- Bot Fight Mode: on · Browser Integrity Check: on
- Brotli + Early Hints: on
- Orange-cloud proxy on both apex and www

### Application defenses
- Five-layer prompt-injection defense (see §3)
- CORS allowlist locked to `kalfoundry.com` + `www.kalfoundry.com` + localhost
- HMAC-signed session cookies (HttpOnly, Secure, SameSite=Lax)
- Rate limiting (session+IP+burst)
- OpenAI moderation pre-screen

### Deliberately out of scope
- **CSP** — would require nonce-strategy across inline scripts; deferred until a build step exists
- **HSTS preload list submission** — deferred ≥30 days post-launch (effectively irreversible)

---

## 6 · SEO + distribution

- **Per-page OG / Twitter meta** with `og:image:type`, `og:image:width/height`, `og:image:alt`, `twitter:card`, and a canonical URL
- **Brand OG image:** 2400×1260 (2× for Retina sharpness), served at `/assets/images/og.png?v=4`. Authored as SVG, rendered to PNG via Chrome headless.
- **JSON-LD schema** on `/resume.html` (team / capabilities page) — feeds Google Knowledge Graph
- **`/robots.txt`** allows everything, points to `/sitemap.xml`, disallows `/api/`
- **`/sitemap.xml`** — deployed pages with `lastmod` + priority
- **Favicon set:** `favicon.svg` + `apple-touch-icon.png` (180×180) + `site.webmanifest`
- **`cv.html` → resume.html** permanent redirect (308)
- **Google Search Console** registered with sitemap submitted *(user task — pending)*
- **Bing Webmaster Tools** importing from GSC *(user task — pending)*

---

## 7 · Files inventory

### HTML pages: 18 deployed
- 7 narrative pages · device-frame app surfaces · arcade games (incl. parent) · 1 redirect shim
- Vanilla HTML+CSS+JS (no build step, no framework)

### Edge / Node code: ~1 500 LOC
- `api/ask.js` (854) — main agentic Edge function
- `api/contact.js` (156) — Resend email forwarder
- `api/_knowledge.js` — curated KB (KAL Foundry company content only), PAGES, search helpers
- `api/_security.js` — sanitization + output scrub + ABSOLUTE_RULES
- `api/_session.js` — HMAC-signed cookies
- `api/_ratelimit.js` — Upstash Redis 3-key budget
- `api/_vector.js` — Upstash Vector semantic search
- `mcp-server/server.js` (314) — stdio MCP server
- `scripts/ingest-patents.mjs` (189) — patent-ingest template (extract + embed); no source data wired in yet

### Assets
- `assets/images/og.png` — 2400×1260 brand OG image
- `assets/images/og.svg` — source SVG
- `assets/images/wallpaper.webp` — MacBook desktop wallpaper poster/fallback
- `assets/backgroundDrive.mp4` — idle-loaded desktop-only MacBook video wallpaper enhancement
- `assets/images/ios_wallpaper.webp` + `assets/images/ios_wallpaper.jpg` — iPhone home wallpaper
- `assets/icons/*.png` — Mac dock + iPhone home grid icons (extracted from `.icns` via `sips`)
- `favicon.svg`, `apple-touch-icon.png`, `site.webmanifest`

### Config + manifests
- `vercel.json` — security headers + cv.html redirect
- `package.json` — root (`type: module`, no deps)
- `mcp-server/package.json` — pins `@modelcontextprotocol/sdk`

### Source-only (not deployed)
- `_source/` — source materials excluded from deploy (the original personal patent-portfolio source has been removed; add the foundry's own source assets here as needed)
- `KAL-Foundry-Capabilities.pdf` — team / capabilities PDF
- `docs/` — design system + build guide + content guide
- `CLAUDE.md` — project ground truth for Claude collaboration
- `PROJECT_REPORT.md` — this file

---

## 8 · Env vars (all on Vercel, all encrypted)

| Var | Purpose |
|---|---|
| `OPENAI_API_KEY` | Chat + embeddings + moderation |
| `RESEND_API_KEY` | Transactional email |
| `RESEND_FROM` | Optional sender override |
| `SESSION_SECRET` | HMAC for signed session cookies |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | Rate-limit counters |
| `UPSTASH_VECTOR_REST_URL` + `UPSTASH_VECTOR_REST_TOKEN` | Patent semantic search |

All seven set across **Production** and **Development** environments. Preview not configured (no git connection — see "next steps").

---

## 9 · Observability

- **Vercel Logs** — real-time Edge function invocations, errors, latencies
- **Cloudflare Web Analytics** — visitors, page views, top pages, countries, browsers, devices, real-time view
- **Cloudflare Analytics (account-level)** — all HTTP requests including bots/crawlers
- **Upstash dashboards** — Redis command count, Vector query count
- **OpenAI usage dashboard** — token spend (hard-capped at user-set monthly limit)
- **Resend dashboard** — email deliveries, bounces (free tier: 3000/month)

---

## 10 · What's next (current open todos)

| Theme | Item |
|---|---|
| Marketing | LinkedIn launch post · directory + studio listing submissions |
| Content depth | Build out case_002.html and case_003.html (referenced from iterm2/finder as virtual files but not yet rendered) |
| Polish | Custom branded 404 page · Lighthouse + axe-core audit · image WebP variants |
| Capability | `schedule_intro_call` tool (needs a real Cal.com / Calendly link) |
| Infrastructure | Connect GitHub repo for preview deploys per branch · add Sentry-free for crash visibility |
| Quarterly maintenance | Refresh `now.html`, change log, `resume.html` with new milestones |
| Deferred | HSTS preload submission (≥30 days post-launch) |

---

## 11 · Design constraints honored

From the project's `CLAUDE.md`:

- **No frameworks, no dependencies** in the static layer — pure HTML/CSS/JS
- **No build step** — what you author is what ships
- **No new colors** — single accent (`--accent` = burnt sienna `#d97757`)
- **Brand voice** — lowercase headlines, snake_case ids, `[brackets]` wordmark, numbers over adjectives, em-dashes over exclamations
- **Type system** — JetBrains Mono (UI), Instrument Serif italic (one "moment" per page), Geist sans (body)
- **A11y** — `aria-label` on every icon link, `prefers-reduced-motion` honored, ≥44×44 tap targets on mobile
- **Anonymization** — no client names, no fabricated metrics, domain-only engagement labels per engagement convention

---

## 12 · Bottom line

A production AI agent + studio site shipped on the free tier of every service involved, with hard caps preventing any runaway costs. The system demonstrates — by being it, not describing it — modern AI-platform craft: function-calling tools, semantic search via embeddings, defense-in-depth, MCP integration, observability, accessibility, SEO, modern security headers, and a polished consumer-grade UI. Every piece has a story for a prospective client or peer reviewer to ask about.
