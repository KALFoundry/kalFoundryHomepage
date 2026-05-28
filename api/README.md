# `/api` — Vercel Edge Functions

Two endpoints powering `messages.html`:

- **`/api/ask`** — streams answers from OpenAI (`gpt-4.1`) for the Forge thread (KAL Foundry's AI assistant).
- **`/api/contact`** — sends emails to team@kalfoundry.com via Resend for the contact thread.

Both hide secrets server-side; the browser never sees the API keys.

## Deploy

```bash
# 1. install vercel CLI once
npm i -g vercel

# 2. from repo root, link this directory to a new or existing Vercel project
vercel link

# 3. add your OpenAI key as a secret (Production + Preview + Development)
vercel env add OPENAI_API_KEY

# 4. deploy
vercel --prod
```

Vercel auto-detects the `api/` folder and routes `POST /api/ask` to this
Edge Function. The static site (`index.html`, etc.) is served from the
project root alongside.

## Wire the frontend

After the first successful `vercel --prod`, copy the production URL it
prints (e.g. `https://www.kalfoundry.com`) and paste it into `messages.html`:

```js
const ENDPOINT = "https://www.kalfoundry.com/api/ask";
```

Redeploy (`vercel --prod` or `git push` if you connected git).

## CORS

Production allowlist in `api/ask.js` / `api/contact.js`:

```js
const ALLOWED_EXACT = new Set([
  'https://www.kalfoundry.com',
  'https://kalfoundry.com',
]);
```

Localhost is also permitted for `vercel dev` and local `python3 -m http.server`.
Everything else returns 403.

## Cost & abuse controls

- `gpt-4.1` ≈ $2 input / $8 output per 1M tokens. A typical Q&A is well
  under $0.005. Set a **hard monthly cap** in your OpenAI billing
  dashboard.
- `max_tokens: 600` caps response length per call.
- History trimmed server-side to the last 20 turns (`slice(-20)`) and each
  message content capped at 4000 chars.
- For real rate-limiting (per-IP), add Vercel KV or Upstash Redis and
  bucket on `req.headers.get('x-forwarded-for')`. Not needed for launch.

## `/api/contact` — Resend (for the contact thread)

The contact thread in `messages.html` sends each message as an email to
`team@kalfoundry.com` via Resend.

1. Sign up at [https://resend.com](https://resend.com) (free tier: 3000 emails/mo).
2. Either verify a sending domain (recommended for production) OR use Resend's
   built-in test sender `onboarding@resend.dev`, which can only deliver to the
   email address on your Resend account — fine for early launches.
3. In the Resend dashboard, **API Keys** → create one and copy it.
4. Add it to Vercel:
   ```bash
   vercel env add RESEND_API_KEY
   ```
5. *(Optional)* Set a custom `From` address if you have a verified domain:
   ```bash
   vercel env add RESEND_FROM
   # e.g. ask-foundry@your-verified-domain.com
   ```
   Without this, the function uses `ask-foundry@resend.dev` (defaults to Resend's
   test sender which restricts to your verified inbox).
6. Redeploy: `vercel --prod`.
7. In `messages.html`, set:
   ```js
   const CONTACT_ENDPOINT = "https://<your-vercel-url>/api/contact";
   ```

### Contract

```
POST /api/contact
body: {
  message: string,                          // required, ≤5000 chars
  replyTo?: string | null,                  // optional — picked up from user's text
  history?: [{role, content}, ...]          // optional — last 10 included in email
}
resp: 200 { ok: true }
```

The function emails KAL Foundry with the message, a `Reply-To` header (if
`replyTo` is provided) so a reply from the inbox lands directly with the
visitor, and the thread context appended as a collapsible `<details>` block.

### Cost & abuse controls (contact)

- Resend free tier hard-caps at 3000/mo.
- Server-side caps: `message` ≤5000 chars, `history` ≤10 turns.
- Add per-IP throttling via Vercel KV / Upstash if abuse becomes a problem.

## Local dev

```bash
vercel dev
# → http://localhost:3000/api/ask
# → http://localhost:3000/api/contact
```

Or just keep using `python3 -m http.server 8765` for the static site; the
mock fallbacks in `messages.html` fire when `ENDPOINT` / `CONTACT_ENDPOINT`
are null.
