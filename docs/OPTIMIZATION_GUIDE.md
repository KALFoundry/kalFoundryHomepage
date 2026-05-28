# Optimization guide

## Performance

- Keep the site static and self-contained. No frameworks, no build step.
- Inline critical homepage CSS in `<style>` inside `index.html`; share everything else through `style.css`.
- Use inline SVG for iconography instead of image files.
- Avoid extra JavaScript libraries. The only JS is small inline `<script>` per page.
- Defer expensive animation until after the initial paint.

## Patent-page performance

`patents.html` is a minimal placeholder today (empty data arrays render nothing). When populated with the foundry's own filings it becomes the biggest content surface on the site, so keep these constraints:

- **Render statically.** All patent rows ship in HTML. No client fetch, no virtualization.
- **Filter client-side, in-place.** Toggle `display: none` on row elements; don't rebuild the DOM.
- **Search is title-only, case-insensitive substring.** Don't introduce a fuzzy-match library.
- **Domain explorer:** swap detail-panel innerHTML from a JS array. One re-render per click.
- **Charts (pipeline bars, collaborator meters, etc.):** pure CSS `transform: scaleX()` with `transition`. No charting library.
- **Animate sparingly.** Bars grow once on load; clicks don't re-trigger animations.

## Accessibility

- Every interactive icon link has a clear `aria-label` for screen readers.
- `:focus-visible` outline uses `var(--signal)` at 2px for keyboard navigation.
- Preserve the `prefers-reduced-motion` fallback on the homepage and on any bar-grow animation.
- Maintain high text contrast on all surfaces. Don't lighten `--ink-2` for ornament.
- Tap targets ≥ 44×44 on mobile.
- Domain explorer rows are `<button>` (not `<div>`) so keyboard focus and Space/Enter activation are free.
- Filter chips on the index are `<button>`s. The search input is `<input type="search">` with a `<label>` (visually-hidden if needed).

## Maintainability

- All design values live in `tokens.css`. Never hard-code colours, type, or spacing.
- Keep HTML structure consistent across pages — copy the chrome from `work.html` or `patents.html`.
- Reuse `.lb-*` classes from `style.css`. Only introduce new namespaced classes (`.pat-*`, `.case-*`) when something is truly page-local.
- Don't add a `site/` subdirectory. The flat layout is intentional.
- Patent records (when added) live directly in `patents.html`'s inline `PATENTS` array — edit that, no separate source file. The previous owner's personal patent source has been removed from `_source/`.

## Quality checks

Before considering a change shipped:

- [ ] Validate at desktop (`≥ 768px`) and mobile (`< 768px`) widths.
- [ ] App icons are tappable on touch and accept keyboard focus.
- [ ] Fixed mini-nav appears after the parallax transition.
- [ ] External links use `target="_blank" rel="noopener noreferrer"`.
- [ ] Keyboard focus is visible and follows reading order.
- [ ] `prefers-reduced-motion` honored on homepage parallax.
- [ ] Patent filter + search work with keyboard only.
- [ ] Patent domain explorer cycles correctly when clicking rows in any order.
- [ ] No console errors on any page.

## Deployment

- Pure static HTML/CSS/JS. Host on any static provider (Vercel, Netlify, GitHub Pages, Cloudflare Pages).
- No build or bundling step.
- Set `Cache-Control` headers on the host if available; otherwise nothing to configure.
- Keep `_source/` (any non-deployed source assets) out of the deploy or block it via host rules — it is excluded via `.vercelignore`.
