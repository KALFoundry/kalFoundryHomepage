# Claude collaborator guide

## Project overview

Static studio site for **KAL Foundry** — a digital foundry for design, AI, and digital products, strategy through fabrication. Serving clients from Fortune 500 to solo founders. The site was forked from a personal-portfolio template and rebranded to the company. The homepage uses a scroll-driven parallax that zooms into a macOS desktop (≥ 768px) or an iPhone home screen (< 768px). App icons and window cards are the primary navigation into:

- `work.html` — selected work (the foundry's products)
- `patents.html` — the foundry's patent portfolio (placeholder shell — content to come)
- `case.html` — featured case-study template (placeholder shell — content to come)
- `about.html`, `now.html`, `resume.html` (the **team / capabilities** page; `cv.html` redirects here)

The site has no build step. Vanilla HTML + CSS + a small scroll script.

## Content: KAL Foundry only

This site originated as a clone of a personal portfolio. **All of the original owner's personal content has been deliberately removed** — there is no individual's résumé, career history, employer names, education, or personal patent records anywhere. The site carries **only generic KAL Foundry company content**, and several pages are intentionally minimal shells ("— coming soon —") to be filled in later.

When editing or adding content:

- **Never reintroduce the personal persona.** Do not add an individual's name, a prior-employer pedigree, past employers, a university, dated personal career timelines, or real patent records / co-inventor names. If you find any such remnant, remove it.
- **Keep it company-level and generic.** KAL Foundry positioning: a digital foundry for design, AI, and digital products; contact `team@kalfoundry.com`; site `www.kalfoundry.com`.
- **Services:** Design & Brand · Strategy & AI Consulting · Digital Products · Production & Launch.
- **Products (real KF work — keep):** **Armory Hub** (security-first mobile app for personal firearm/ammo/accessory inventory), **backgClear** (SaaS background removal), **Ironwork Series** (architectural metalwork).
- **Do not fabricate** metrics, clients, patents, or case studies. Where real content doesn't exist yet, leave the existing minimal placeholder.

The AI assistant is **Forge** (handle `ask_foundry`); it speaks on behalf of KAL Foundry. Its knowledge base (`api/_knowledge.js`) and tools have likewise been stripped of personal content.

## Primary experience

- Desktop viewers see a MacBook UI with clickable window cards and a dock.
- Mobile viewers see an iPhone UI with app icons and a dock.
- Scroll progress drives hero opacity, device scale, and a late-fading "fixed mini-nav."
- `prefers-reduced-motion` collapses the animation to its end state.

## Goals for Claude

When editing or extending this site, apply these rules:

1. **Brand voice and design system are non-negotiable.**
   - Mono (JetBrains Mono) for UI; Instrument Serif italic for one "moment" per page; Geist sans for body.
   - Lowercase headlines. snake_case ids. `[brackets]` for the wordmark (`[ kal_foundry ]`).
   - Numbers, never adjectives. Em-dashes, never exclamations.
   - One accent (`--accent` burnt sienna). No new palette.
   - Hairline borders, no shadows on UI elements.
2. **Keep the homepage interaction lightweight.**
   - Preserve the parallax scale/opacity animation.
   - Use CSS media queries to switch between desktop and mobile devices — never UA sniffing.
   - Preserve the reduced-motion fallback.
3. **Semantic, accessible HTML.**
   - Every icon link has a clear `aria-label`.
   - Internal links use relative paths.
   - External links open in a new tab with `rel="noopener noreferrer"`.
4. **No frameworks. No dependencies.**
   - Vanilla HTML/CSS/JS only. Inline `<script>` blocks for page-local interactivity are fine.

## File map

### Pages (in nav)
- `index.html` — homepage with parallax device hero (iPhone + MacBook).
- `work.html` — selected work; filterable card grid (currently the three KF products).
- `patents.html` — patent portfolio; minimal placeholder shell (data arrays empty; render JS preserved).
- `case.html` — featured case-study template; minimal placeholder shell.
- `about.html`, `now.html`, `resume.html` (team/capabilities) — supporting pages. `cv.html` redirects to `resume.html`.

### Device-only "app" surfaces (NOT in nav, reachable only from homepage MacBook dock + iPhone grid)
- `finder.html` — Mac Finder window; the navigation hub for browsing internal pages as files. Rows postMessage `{type:'openApp', href, label}` to the parent to swap apps inside the device frame.
- `trello.html` — Trello-style kanban board (lists: services · active · shipped · patents · stack). Cards link to relevant pages.
- `iterm2.html` — emulated zsh terminal session with typewriter intro (sessionStorage-gated; reduced-motion-safe; click-to-skip).
- `messages.html` — Messages-style chat UI for **Forge**. **AI endpoint hookup**: the `ENDPOINT` const at the top of the inline `<script>` points at `/api/ask`. Contract: `POST {message: string}` → expect a streamed/`{reply: string}` response.

### Stylesheets
- `assets/styles/style.css` — global site styles and `.lb-*` component vocabulary.
- `assets/styles/tokens.css` — design tokens (SIGNAL system). Imported by `style.css`.

### Backend
- `api/ask.js` — the Forge agentic assistant (Vercel Edge Function; six function-calling tools).
- `api/_knowledge.js` — Forge's knowledge base (KAL Foundry about/services/work/team/contact only; no personal content).
- `api/contact.js` — contact-form handler (Resend).
- `api/_patents.full.json` — patent records store; **emptied** (no personal patent data). Repopulate only with the foundry's own future filings.
- `mcp-server/` — same tools over MCP (`ask_foundry`).
- `scripts/ingest-patents.mjs` — patent-ingest template into Upstash Vector (no source data wired in yet).

### Governing docs (in `docs/`)
- `docs/DESIGN_SYSTEM.md` — brand law: voice, type, colour, components.
- `docs/BUILD_GUIDE.md` — UX strategy and page architecture.
- `docs/OPTIMIZATION_GUIDE.md` — performance, a11y, maintenance.
- `docs/CONTENT_GUIDE.md` — editorial rules; **read before editing patent or case copy**.
- `README.md` — entry point + project conventions.

### Source-only (NOT deployed — excluded via `.vercelignore`)
- `_source/` — source materials excluded from deploy. The original personal patent-portfolio source has been removed; add the foundry's own source assets here as needed.
- `loganlabs-ai-main/` — the original template, kept locally for reference; excluded from git + Vercel. Safe to delete.

## Adding a new page

Mirror the existing pages:

```html
<a class="lb-back" href="index.html"><span class="dot"></span> HOME</a>

<header class="lb-nav">
  <a class="lb-brand" href="index.html"><span class="br">[</span>kal_foundry<span class="br">]</span></a>
  <span class="lb-nav-spacer"></span>
  <a href="work.html">work</a>
  <a href="patents.html">patents</a>
  <a href="about.html">about</a>
  <a href="now.html">now</a>
  <a href="resume.html" class="is-signal">team ↗</a>
</header>

<!-- hero-strip with grid bg → sections → lb-footer -->
```

Add the corresponding `aria-label`'d icon to the iPhone grid and a window card to the MacBook desktop in `index.html`, plus dock entries on both.

## Implementation notes

- All visual values come from `tokens.css`. Never hard-code colours, type, or spacing.
- Reuse `.lb-*` classes from `style.css` for chrome (nav, footer, cards, buttons, sections).
- Page-specific styles can live in an inline `<style>` block in the page itself or get added to `style.css` if they're shared.
- Keep the homepage at the root `index.html` (don't move into a subfolder).
- Avoid verbose prose; cut to the noun.

## Accessibility

- Maintain visible keyboard focus (`:focus-visible` outline in `var(--signal)`).
- Respect `prefers-reduced-motion`.
- `aria-label` every icon link.
- Tap targets ≥ 44×44 on mobile.

## Working with the patents page

`patents.html` is currently a minimal placeholder: the `DOMAINS` and `PATENTS` data arrays are empty and the render/filter JS is preserved but renders nothing. To populate it later with the foundry's *own* filings:

1. Add records to the `PATENTS` (and `DOMAINS`) arrays in the inline `<script>` — the existing render and client-side filtering will pick them up; no build step needed.
2. **Only the foundry's own IP.** Do not reintroduce the previous owner's personal/USPTO records or co-inventor names.
3. Keep the list filterable and fast — static HTML rows + tiny inline JS, no virtualization library.
