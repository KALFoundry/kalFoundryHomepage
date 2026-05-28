# Content guide

> Editorial rules for `kal_foundry` site copy. Read before writing or rewriting any page text.

## 1 · The voice in one sentence

Lowercase headlines. Italic serif when something matters. Numbers, never adjectives.

## 2 · KAL Foundry content only

This site began as a clone of a personal portfolio. **All of the original owner's personal content has been removed** — no individual's name, career history, employer pedigree, education, or personal patent records appear anywhere. Write **only generic KAL Foundry company copy**.

- **Never reintroduce the personal persona.** If a draft or remnant carries an individual's name, an enterprise "Master Inventor" pedigree, old employers, a university, dated career timelines, or real USPTO/co-inventor records, cut it.
- **`patents.html` is currently a minimal placeholder.** The data arrays are empty and render nothing. Populate it later only with the foundry's *own* filings, in the SIGNAL voice (lowercase headlines, mono badges, numerals). Do not copy any source verbatim.
- **`case.html` is a placeholder case-study template.** Fill it only with the foundry's own engagements; don't fabricate clients or metrics.

## 3 · Headline rules

- **Lower-case.** Always. `ninety inventions.` not "Ninety Inventions."
- **End on a period.** Statements, not declarations.
- **One italic-serif "moment" per page, max.** It carries weight by being rare.
- **No exclamations.** Em-dashes instead.
- **No "I'm excited to…" / "Proud to share…" framing.** Show the work; don't perform around it.

## 4 · Numbers rules

- **Numerals over words.** `12 filings`, not "twelve filings" — *except* once per page as a deliberate serif moment.
- **Lead with the metric.** `4.2× faster.` not "much faster."
- **Avoid empty intensifiers.** "Significant", "robust", "scalable", "innovative", "cutting-edge", "next-gen" — cut them.
- **Numbers carry context.** `4 granted (33%)`. Not "many".

## 5 · Patent / case copy rules (when populated)

`patents.html` and `case.html` are empty placeholders today. When the foundry's own content is added later, apply these rules:

- **Patent titles stay verbatim.** They're legal language; don't rewrite them. Render them in Instrument Serif at body size to let the formal phrasing breathe inside the brand frame.
- **Inventor names stay verbatim.** Foundry team members render with `<em class="lb-self">` so they can be visually highlighted (mono, ink-on-accent or signal underline — small touch).
- **Status badges:** mono, uppercase, hairline bordered. `GRANTED` is solid ink; `PENDING` is hairline outline. No third state.
- **Dates:** mono, ISO-ish (`2025-03-18`) or shortened (`mar 2025`). Pick one per surface and stay consistent.
- **Domain narratives:** 1-2 sentences max. Lead with the technical noun, not the marketing verb.

## 6 · Section labels

Use mono micro-eyebrows for section navigation. Pattern: `// §NN · short_label`.

- `// §01 · domains`
- `// §02 · pipeline`
- `// §03 · collaborators`
- `// §04 · the index`

## 7 · Buttons / link affordances

- `./` prefix on action buttons. `./read_case_004`, `./view_index`, `./mailto_team`.
- External links get the `↗` glyph and `target="_blank" rel="noopener noreferrer"`.
- "open →" only inside MacBook window-cards on the homepage; not anywhere else.

## 8 · What to cut

Cut anything in this list whenever you see it in draft copy:

- "Cutting-edge", "state-of-the-art", "next-gen", "revolutionary", "innovative"
- "Excited to share", "Proud to announce", "Thrilled to"
- Adjective stacks ("scalable, robust, modern")
- Hype emojis (🚀 🔥 ⚡)
- Filler phrases ("at the end of the day", "the fact of the matter is")
- Em-dash replacements like " - " or "--". Use a real em-dash `—`.

## 9 · One italic-serif moment per page

Reserve `font-family: var(--font-serif); font-style: italic; color: var(--accent);` for one phrase per page. Use it on the line that does emotional work — a thesis, a tagline, a sign-off.

- `index.html` — *"that survive production."*
- `work.html` — *"retrieval, agents, platform."*
- `patents.html` — placeholder; choose one when populated.
- `about.html` — *"— the foundry"* (sign-off; counts as the moment).
- `now.html` — *"shipping rag infra."*
- `resume.html` (team page) — none; the team/capabilities page is print-leaning. (`cv.html` redirects here.)

Two italic-serif moments on one page reads as overwrought. Pick one.
