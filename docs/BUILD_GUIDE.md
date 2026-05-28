# Build guide

> Implementation strategy for the homepage and per-page architecture.

## UX strategy

- The homepage is a single-scroll journey. It opens with a centered hero and zooms into the device screen.
- Mobile users see an iPhone home screen; desktop users see a MacBook desktop.
- Iconography is intentionally familiar: app tiles on mobile, window cards + dock on desktop.
- All click targets are app-like UI elements with `aria-label`s.
- After the parallax completes, a fixed mini-nav slides in from the bottom for fast access.

## Homepage architecture

1. `.home` is the parallax wrapper; its `min-height` controls how long the scroll lasts (currently `240vh`).
2. `.home-stage` is sticky and pins the hero/device for the duration of the scroll.
3. `.home-hero` fades and translates upward as the user scrolls (0 → 30% progress).
4. `.home-device` scales from 0.5 → 1.0 (10% → 80% progress).
5. Two device variants are present in the DOM but only one is visible at a time:
   - `.device-mobile` for `max-width: 767px`
   - `.device-desktop` for `min-width: 768px`
6. `.home-postscript` fades in late (75% → 95%).
7. `.home-fixed-nav` reveals once parallax is fully done (`> 92%`).
8. `prefers-reduced-motion`: collapse to end-state immediately; hide hero; show fixed nav.

## Devices: contents

### iPhone (`.device-mobile`)

- Dynamic island + iOS status bar (white-on-shadow over the wallpaper).
- Background: real wallpaper image (`backgrounds/ios_wallpaper.jpg`).
- Lockup: `[ kal_foundry ]` + meta line (`tap an app · or scroll`).
- One italic-serif moment line (`that survive production.`).
- 4-column app grid (8 items): **work · patents · about · now · team · github · finder · trello**.
- Dock (frosted): **work · about · now · mail**.

### MacBook (`.device-desktop`)

- Frame: bezel, lip, camera dot, menu bar.
- Menu bar: brand + File/View/Window/Help, status, clock. Dark-translucent over the pixel-art wallpaper so text stays readable.
- Desktop: real wallpaper image (`backgrounds/wallpaper.webp`, rendered crisp via `image-rendering: pixelated` on a `::before` pseudo-element so dock PNGs aren't affected). **No on-desktop folder icons** — Finder is the navigation hub for browsing internal pages.
- Dock (real Mac app icons throughout): **finder · trello · iterm2 · messages** + separator + **github · linkedin · mail**.
- Internal pages (work / case / patents / about / now / team) reachable via the **finder** app.

## The four device-only "apps"

These pages exist only inside the homepage device frame. They are **not** in `lb-nav` on any page. Each follows the standard page chrome (lb-back · lb-nav · content · lb-footer) but the lb-back pill is hidden in embed mode (`.is-embedded .lb-back { display: none; }`).

| App | What it is | Notable mechanics |
|---|---|---|
| `finder.html` | Mac Finder window for browsing internal pages as "files" | Rows postMessage `{type:'openApp', href, label}` to the parent → parent calls `closeApp()` then `openApp(href)`. Title-bar updates; ~200ms close-and-reopen gap is intentional ("navigating in Finder finishes; new app opens"). |
| `trello.html` | Kanban with lists: services · active · shipped · patents · stack | Cards link to `work.html`, `patents.html`, `case.html` as appropriate (patents/case currently placeholders). Static board — no client JS for v1. Horizontal scroll with `scroll-snap-type: x proximity`. |
| `iterm2.html` | Emulated zsh session with typewriter intro | Typewriter gated by `sessionStorage.iterm-seen` (runs once per session) AND `prefers-reduced-motion`. Click anywhere in pane to skip to end. |
| `messages.html` | Messages-style chat with mock replies | `const ENDPOINT = null` at the top of the inline script — set to a URL to wire an AI backend. Contract: `POST {message: string}` → `{reply: string}`. Adjust fetch body if your endpoint expects a different shape (e.g. OpenAI-style `messages: [{role, content}]`). |

## Full-screen mode

The green traffic light in the MacBook app window chrome toggles full-screen mode. CSS rule `.macbook.is-fullscreen .mac-app { position: fixed; inset: 0; z-index: 9999; }` makes the app escape the MacBook frame and fill the viewport. Chrome bar stays visible so the red light remains reachable.

**ESC behavior is two-stage**: first press exits fullscreen but keeps the app open; second press closes the app. `closeApp()` always clears `.is-fullscreen` so the state can't get stuck.

iPhone has no fullscreen toggle — the iframe already fills the phone screen.

## Adding a new page

For a **first-class portfolio page** (appears in nav):

1. Create `new-page.html` mirroring the chrome of `work.html` or `patents.html`. Include the embed-detection `<script>` in `<head>`.
2. Add the link to `.lb-nav` on every existing page (work, patents, about, now, team, case + each device-only app).
3. Add the link to `.home-fixed-nav` in `index.html`.
4. Add a row to `finder.html` (since Finder is the nav hub).
5. Update `claude.md` and `README.md` file maps.

For a **device-only app** (in dock only, not in nav):

1. Create `new-app.html` with the standard chrome + embed-detection script.
2. Add a dock entry in `index.html` (icon under `icons/` if you have one).
3. Update `claude.md`, `README.md`, and the table above.
4. **Do not** add to `lb-nav`. Do not add to `.home-fixed-nav`. Do not add to the existing pages' navs.

The cost of skipping any of these steps: a dead or asymmetric page that doesn't appear in one of the navigation surfaces. Always update all six.

## Patent page architecture (`patents.html`)

`patents.html` is currently a **minimal placeholder shell** — the `DOMAINS` and `PATENTS` data arrays are empty, so the page renders nothing. The render and client-side filter JS are preserved. Populate it later only with the foundry's *own* filings (no build step needed); do not reintroduce the previous owner's records or co-inventor names.

The shell is built to expand into the heaviest content surface on the site, composed of:

1. **Hero strip** — eyebrow, lowercase headline, italic-serif moment, short subtitle. Pattern from `work.html`.
2. **KPI strip** — mono-serif metrics in a hairline-divided grid.
3. **Domains explorer** — master/detail. Domain rows (left) drive a detail panel (right) with stats + narrative + patents in that domain. Click and keyboard activation; URL hash optional.
4. **Pipeline** — 2 tiles (granted vs. pending). Bar visualization in each.
5. **Top collaborators** — ranked list with meter bars.
6. **Full index** — every patent, filterable by status + domain, searchable by title. Render server-side (static HTML); filter client-side with vanilla JS.
7. **Footer** — `lb-footer` with availability + sign-off.

### Patent data shape

A single JS array in the inline `<script>` block drives the dynamic parts (domain explorer + index filter). It is empty today; add the foundry's own records in this shape:

```js
const PATENTS = [
  { n: 1, title: "…", inventors: [...], category: "cloud", status: "granted", date: "2026-05-05" },
];
```

Inventors as `[{name, self?}]` so the foundry's team members can be highlighted without string matching.

## Responsive implementation

- Media queries only. No runtime device detection.
- Keep mobile and desktop content in separate DOM subtrees to simplify layout and interaction.
- Hide the inactive device with `display: none`.
- The patents page collapses to a single column under 900px.

## Interaction details

- Scroll position drives a normalized progress `p` in `[0, 1]` of `(scrollY / range)`.
- Hero opacity/translation, device scale/lift, postscript fade, and fixed-nav reveal are all derived from `p`.
- Keep animation logic small; avoid layout thrashing (no offsetHeight reads in the rAF loop).
- Honor `prefers-reduced-motion` by jumping to the end state.

## Navigation and click behavior

- App icons are anchor (`<a>`) elements. Treat them like real apps.
- Internal links: relative paths, no trailing slash.
- External links: `target="_blank" rel="noopener noreferrer"`.

## Deliverables checklist

- [x] Parallax entrance animation on iPhone + MacBook.
- [x] Reduced-motion fallback collapses to end state.
- [x] Click-through to all pages from at least 2 surfaces (icon, dock, fixed nav).
- [x] Patent page reads as ranked information, not a marketing brochure.
- [x] Governing docs (`claude.md`, this guide, `OPTIMIZATION_GUIDE.md`, `CONTENT_GUIDE.md`, `DESIGN_SYSTEM.md`) reflect actual project state.
