// Vercel Edge Function · forwards messages from the contact thread in
// messages.html to team@kalfoundry.com via Resend.
//
// Contract:
//   POST /api/contact
//   body: {
//     message: string,           // required, <= 5000 chars
//     replyTo?: string | null,   // optional, email address; used as Reply-To
//     history?: [{role, content}, ...]  // optional, last 10 included in email
//   }
//   resp: 200 { ok: true }  ·  4xx/5xx text error

export const config = { runtime: 'edge' };

const TO_ADDRESS = 'team@kalfoundry.com';
const FROM_ADDRESS = process.env.RESEND_FROM || 'ask-foundry@resend.dev';

const ALLOWED_ORIGINS = new Set([
  'https://www.kalfoundry.com',
  'https://kalfoundry.com',
]);

function corsHeaders(origin) {
  // No Origin (server-side / curl / same-origin) → permissive.
  // Allowlisted origin → echo back. Localhost for dev. Everything else → reject.
  const allow =
    !origin ? '*' :
    ALLOWED_ORIGINS.has(origin) ? origin :
    origin.startsWith('http://localhost') ? origin :
    origin.startsWith('http://127.0.0.1') ? origin :
    null;
  if (allow === null) return null;
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]),
  );
}

export default async function handler(req) {
  const origin = req.headers.get('origin') || '';
  const cors = corsHeaders(origin);
  if (cors === null) return new Response('origin not allowed', { status: 403 });

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405, headers: cors });
  }
  if (!process.env.RESEND_API_KEY) {
    return new Response('RESEND_API_KEY not configured', { status: 500, headers: cors });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response('bad json', { status: 400, headers: cors });
  }

  const message = String(body?.message || '').trim().slice(0, 5000);
  if (!message) {
    return new Response('empty message', { status: 400, headers: cors });
  }

  const replyTo =
    typeof body?.replyTo === 'string' &&
    /^[\w.+-]+@[\w-]+(?:\.[\w-]+)+$/.test(body.replyTo)
      ? body.replyTo
      : null;

  const history = Array.isArray(body?.history) ? body.history.slice(-10) : [];
  const transcript = history
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string')
    .map((m) => (m.role === 'user' ? '> ' : '< ') + String(m.content).slice(0, 2000))
    .join('\n');

  // Provenance tags — used to distinguish chat tool-calls from MCP clients.
  const via = ['chat', 'mcp', 'direct'].includes(body?.via) ? body.via : 'direct';
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.slice(0, 64) : null;
  const mcpHeader = req.headers.get('x-via') || req.headers.get('x-mcp-origin');

  const subject = `[ask_foundry] new message${replyTo ? ' · ' + replyTo : ' · anonymous'} · via:${via}`;
  const text = [
    'message:',
    message,
    '',
    '— context —',
    'reply-to: ' + (replyTo || '(anonymous)'),
    'sent: ' + new Date().toISOString(),
    'origin: ' + origin,
    'via: ' + via + (mcpHeader ? ' (' + mcpHeader + ')' : ''),
    'session: ' + (sessionId || '(none)'),
    '',
    '— thread —',
    transcript || '(no prior context)',
  ].join('\n');

  const html =
    '<div style="font-family:ui-monospace,Menlo,monospace;font-size:14px;line-height:1.5;color:#1a1410">' +
      '<p style="margin:0 0 12px"><strong>new message via ask_foundry</strong></p>' +
      '<blockquote style="margin:0 0 16px;padding:8px 12px;border-left:3px solid #d97757;background:#f9f5ed;white-space:pre-wrap">' +
        escapeHtml(message) +
      '</blockquote>' +
      '<p style="margin:8px 0;font-size:12px;color:#666">reply-to: ' +
        (replyTo
          ? `<a href="mailto:${escapeHtml(replyTo)}">${escapeHtml(replyTo)}</a>`
          : '(anonymous)') +
      '</p>' +
      '<p style="margin:8px 0;font-size:12px;color:#666">origin: ' +
        escapeHtml(origin || 'unknown') +
      '</p>' +
      '<p style="margin:8px 0;font-size:12px;color:#666">via: ' +
        escapeHtml(via) +
        (sessionId ? ' · session ' + escapeHtml(sessionId.slice(0, 8)) : '') +
      '</p>' +
      (transcript
        ? '<details style="margin-top:16px"><summary style="cursor:pointer;color:#666;font-size:12px">prior thread</summary><pre style="white-space:pre-wrap;font-size:12px;color:#444">' +
          escapeHtml(transcript) +
          '</pre></details>'
        : '') +
    '</div>';

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [TO_ADDRESS],
      subject,
      text,
      html,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  if (!r.ok) {
    const err = await r.text().catch(() => 'resend error');
    return new Response(err, { status: 502, headers: cors });
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
