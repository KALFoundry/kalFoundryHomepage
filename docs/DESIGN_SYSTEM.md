# kal_foundry — SIGNAL Design System

> v1.0 · studio brand for a digital foundry — design, AI, and digital products
> A hybrid of Mercury-grade restraint and terminal precision.

This document is the single source of truth for the KAL Foundry brand. Pair with `tokens.css` for the implementation. Both files are designed to drop into any project (the studio site, slide decks, business cards, etc.) and keep things consistent.

---

## 0 · The brief

| | |
|---|---|
| **Who**     | KAL Foundry — a digital foundry for design, AI, and digital products |
| **For**     | Clients from Fortune 500 to solo founders |
| **What**    | Studio site demonstrating range: strategy, AI architecture, shipped products, current work |
| **Why**     | Be memorable in a sea of generic studio sites. Read as senior, technical, exact. |
| **How**     | Modern, tech-forward, terminal-fluent. Mercury-grade restraint, hacker-grade specificity. |
| **Not**     | Generic dark-neon dev studio. AI-slop gradients. Stock 3D blobs. Emojis in headlines. |

The system is named **SIGNAL** — a fork of two earlier explorations (Operator, the Mercury-adjacent warm direction, and Terminal, the brutalist mono direction). It carries Operator's warm paper + single accent and Terminal's mono UI + hairline grids.

---

## 1 · Colour

The palette is small on purpose. Eight named tokens, one accent, one signal colour, four status colours. Light and dark modes are the same system inverted — not a recolour.

### Light mode

| Token         | Hex       | Use |
|---------------|-----------|-----|
| `surface`     | `#f4f1ea` | page background — warm paper |
| `surface-2`   | `#ebe7dd` | cards, sections, bands |
| `surface-3`   | `#e3dfd3` | deeper recess (rare) |
| `ink`         | `#13141a` | headings, primary text |
| `ink-2`       | `#3a3a44` | body copy |
| `ink-muted`   | `#7f7d76` | meta, captions, labels |
| `accent`      | `#d97757` | one warm accent. ≤ 5% of any composition |
| `signal`      | `#4a8de2` | links, code highlights, data points |

### Dark mode

| Token         | Hex       |
|---------------|-----------|
| `surface`     | `#13141a` |
| `surface-2`   | `#1a1c24` |
| `surface-3`   | `#22242e` |
| `ink`         | `#ede9df` |
| `ink-2`       | `#a8a59c` |
| `ink-muted`   | `#5e5d57` |
| `accent`      | `#d97757` (unchanged) |
| `signal`      | `#4a8de2` (unchanged) |

### Rules

- **Accent never above 5%** of a screen. It's a punctuation mark, not a fill.
- **Signal only on data**: hyperlinks, syntax highlight, metrics, code.
- **No accent on accent.** Sienna and signal-blue never touch.
- **Status colours (`ok`, `warn`, `err`)** appear only on system feedback — never decoratively.

---

## 2 · Typography

Three families. Each has a job; never mix them inside a single phrase.

| Family | Use |
|---|---|
| **JetBrains Mono** | All UI: headings, navigation, buttons, labels, metadata. Weights 400/500/600. |
| **Instrument Serif** *italic* | The "moment" font. One line per page, max. Used for emotional emphasis or punctuation of an idea. Italic only. |
| **Geist** (sans) | Body copy and long-form reading. Weight 400 with 500 for emphasis. |

### Scale

| Token         | Size      | Family | Weight | Tracking | Line-height |
|---------------|-----------|--------|--------|----------|-------------|
| `--t-display` | 56 / 3.5rem | mono | 600 | -0.04em | 0.98 |
| `--t-h1`      | 40 / 2.5rem | mono | 600 | -0.025em | 1.05 |
| `--t-h2`      | 28 / 1.75rem | mono | 500 | -0.025em | 1.15 |
| `--t-h3`      | 20 / 1.25rem | mono | 500 | -0.01em | 1.3 |
| `--t-body`    | 15 / 0.9375rem | sans | 400 | 0 | 1.55 |
| `--t-meta`    | 11 / 0.6875rem | mono | 400 | 0.12em | 1 |
| `--t-micro`   | 10 / 0.625rem | mono | 500 | 0.16em | 1 |

### Tics & conventions

- **Lower-case headlines.** Always. `we build ai systems`.
- **snake_case for identifiers.** `kal_foundry`, `case_004`, `production_rag`.
- **Brackets for the wordmark.** `[kal_foundry]`.
- **Em-dashes**, never exclamations.
- **Numbers, never adjectives.** `4.2× faster`, not "blazing fast".
- **Italic serif** appears once per page, as a closing thought or pull.

---

## 3 · Voice

> *Lower-case headlines. Italic serif when something matters. Numbers, never adjectives.*

| ✗ Off-brand | ✓ On-brand |
|---|---|
| "Excited to share my latest AI project 🚀" | "case/004 — production retrieval, 4× faster." |
| "Innovative ML solutions for tomorrow" | "systems that survive prod, today." |
| "10x engineer · AI thought leader" | "digital foundry. ML in production." |
| "Let's revolutionize how we think about AI" | "most agent demos break in production. here's why." |

**Voice principles**
1. Specific over general. Always.
2. Past tense over future tense. Shipped > said.
3. Logs over lore. Show the work.
4. Quiet competence. Few words, all earned.

---

## 4 · Identity

### Bracket monogram
The primary mark. Used for favicons, social avatars, app icons.
```
[ kf ]
```
- Brackets are accent (`#d97757`); letters are ink.
- Minimum size: 24×24.
- Clear-space: equal to the cap-height of the "k" on all sides.

### Bracket wordmark
The primary lockup. Header, team page, slides.
```
[ kal_foundry ]
```

### Serif sign-off
The studio mark. Email signatures, about page, letters.
```
— the foundry
```
*(Instrument Serif italic, ink colour, em-dash leading)*

### Signature lockup
Black bar, full-bleed. Used on dark hero strips, business cards.
```
[ kal_foundry ]   / DIGITAL FOUNDRY · AI · PRODUCT
```

---

## 5 · Components

All components are flat. No rounded corners. No drop shadows on UI elements. Hairline borders or none.

### Buttons

| Variant | Background | Text | Border | Font |
|---|---|---|---|---|
| **primary** | `ink` | `surface` | none | mono 11/600 |
| **secondary** | transparent | `ink` | `1px solid ink` | mono 11/500 |
| **accent** | `accent` | `#fff` | none | mono 11/500 |
| **link** | transparent | `signal` | none | mono 11/400, underlined |

Label conventions: `./view_work`, `cat resume.md`, `mailto:team`, `read more →`.

### Navigation

```
[ kal_foundry ]                  work   about   now   team ↗
```
Brackets in accent, name in ink-600, nav items in ink-2 (mono 11/1.4 tracking), team link in signal blue with `↗`. (`team ↗` points at `resume.html`, the team/capabilities page; `cv.html` redirects there.)

### Cards

Hairline border, `surface-2` background, internal padding 16–20px, no shadow. Header has eyebrow + date in mono 10 muted; title in mono 20/600 with optional serif-italic emphasis; body in sans 13; tag row in mono 10 muted at bottom.

### Forms

Inputs are hairline-bordered, padding 12/16, mono labels above. Focus state: `2px solid signal`, no glow.

---

## 6 · Spacing & grid

- **Base unit: 4px.** All spacing is a multiple of 4.
- **Container max-width: 1240px.**
- **Page gutter: 32px (20px on mobile).**
- **Vertical rhythm: 80px between major sections.**

Hairline page grid (40×40px) can be used as a background motif on hero sections.

---

## 7 · Motion

Quiet. The system never bounces, never spins.

- **Default easing:** `cubic-bezier(0.2, 0.7, 0.3, 1)` — calm, decisive.
- **Default duration:** 240ms.
- **Page enters:** fade up 8px over 420ms.
- **Hover states:** colour shift only, 120ms. No transforms.
- **Parallax is allowed** on hero sections — scroll-bound, not autoplay.

---

## 8 · Surface usage matrix

| Surface | Direction |
|---|---|
| Studio site | SIGNAL (default) |
| Team / capabilities PDF | SIGNAL light |
| Slide decks | SIGNAL light, sparing accent |
| GitHub README banners | SIGNAL dark |
| Product landing pages | SIGNAL light |
| Business cards | SIGNAL light or dark |
| Social avatar | bracket monogram |

---

## 9 · For Claude Code

When generating code against this system:

1. **Import `tokens.css` at the entry point** — every value is a CSS variable.
2. **Use `var(--token)` everywhere.** Never hard-code colours, font families, or spacing.
3. **Respect the type rules.** Mono for UI, serif italic for one emphasis per page, sans for body.
4. **No new accents.** If a UI surface needs distinction, use `surface-2` or hairline borders — not a new colour.
5. **Lower-case headlines.** Use `text-transform` only if the source is mixed-case.
6. **Hairline borders, not shadows.** `border: 1px solid var(--hair)`.

The studio site is the reference implementation. Mirror its patterns.
