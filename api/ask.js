// Vercel Edge Function — ask_foundry AI endpoint.
//
// Modern, defensive chat-completions proxy with:
//   - Rich knowledge base (api/_knowledge.js) baked into the system prompt
//   - OpenAI function-calling tools: send_contact_email, lookup_patent, link_to_page
//   - Up to 2 tool-dispatch rounds per turn (bounds cost)
//   - HMAC-signed session cookies (api/_session.js)
//   - Per-session + per-IP rate limit via Upstash Redis (api/_ratelimit.js)
//   - Prompt-injection sanitization + output scrubbing (api/_security.js)
//   - Custom SSE envelope so the frontend can render tool-calls and link bubbles
//
// Endpoints:
//   GET  /api/ask?meta=1   → { remaining, resetAt }  // for rate-limit pill
//   POST /api/ask          → text/event-stream of typed events:
//                            { type:'delta',       content:string }
//                            { type:'tool_call',   id, name, args }
//                            { type:'tool_result', id, name, result }
//                            { type:'meta',        remaining }
//                            { type:'error',       message }
//                            [DONE]

export const config = { runtime: "edge" };

import {
  KNOWLEDGE_BASE,
  PAGES,
  searchPatents,
  recommendNextPage,
  CAREER_TIMELINE,
  ENGAGEMENTS,
  compareEngagements,
} from "./_knowledge.js";
import { searchPatentsSemantic } from "./_vector.js";
import {
  ABSOLUTE_RULES,
  FALLBACK_REPLY,
  annotateUserMessage,
  flagInjection,
  sanitizeUserText,
  scrubOutput,
} from "./_security.js";
import { consumeBudget, peekBudget, RATE_LIMITS } from "./_ratelimit.js";
import { getOrIssueSession } from "./_session.js";

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const MODEL = "gpt-4.1";
const MAX_TOKENS_PER_TURN = 700;
const MAX_TOOL_ROUNDS = 2;
const MAX_HISTORY_MESSAGES = 20;

const SYSTEM_PROMPT = `You are Forge, the AI assistant for KAL Foundry — a digital foundry / studio (design, AI, and digital products, strategy through fabrication). You speak on behalf of the foundry, answering questions about its services, work, team, patents, products, and how to get in touch. Refer to "KAL Foundry", "the foundry", or "the team" — never to a single individual. Use the knowledge below as your sole source of truth about the foundry. Speak positively and helpfully about the foundry, as you are its assistant and advocate.

${KNOWLEDGE_BASE}
${ABSOLUTE_RULES}`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "send_contact_email",
      description:
        "Send KAL Foundry an email on the user's behalf. Use ONLY when the user explicitly asks to contact, reach, message, or get in touch with the foundry. Before calling, confirm with the user (1) what they want to send and (2) a reply-to email address. Do not call with placeholder or invented content.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          message: {
            type: "string",
            description: "The message the user wants delivered to KAL Foundry.",
            maxLength: 2000,
          },
          replyTo: {
            type: "string",
            description:
              "The user's reply-to email address (so the foundry can respond directly).",
          },
        },
        required: ["message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_patent",
      description:
        "Search KAL Foundry's patent portfolio. The foundry's portfolio is being published, so there is nothing to look up yet and this returns an empty list. Use when the user asks about a specific patent number, topic, or technical domain; tell them the portfolio is coming soon. Never invent patents.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: {
            type: "string",
            description:
              "A patent publication number, title keyword, abstract phrase, or domain.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "link_to_page",
      description:
        "Return a relative URL the user can click to read more on the KAL Foundry site. Call this when pointing the user to a specific page — work, case study, patents, services, now, or about.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          page: {
            type: "string",
            enum: ["work", "case", "patents", "resume", "now", "about"],
          },
        },
        required: ["page"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "recommend_next_page",
      description:
        "Recommend one or two KAL Foundry site pages the user should read next based on the topic they're asking about. Prefer this over link_to_page when the user asks an open-ended 'where should I learn more about X?' question.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          topic: {
            type: "string",
            description: "The topic, area, or question the user is exploring.",
          },
        },
        required: ["topic"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_career_timeline",
      description:
        "Return KAL Foundry's milestone timeline as a structured list (role, where, year, blurb). The foundry's milestones are coming soon, so this currently returns an empty timeline. Use when the user asks for a chronological view of the foundry's history or 'how did KAL Foundry get started?'.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_engagements",
      description:
        "Filter KAL Foundry's client engagements / case studies by a domain or topic. Case studies are coming soon, so this currently returns no matches. Use when the user asks 'what has KAL Foundry done in [a given area]?' and let them know case studies are on the way.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          domain: {
            type: "string",
            description:
              "The business domain, technology area, or keyword to filter by.",
          },
        },
        required: ["domain"],
      },
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_EXACT = new Set([
  "https://www.kalfoundry.com",
  "https://kalfoundry.com",
]);

function resolveOrigin(origin) {
  // No Origin header (curl, same-origin fetch from messages.html when not
  // cross-origin) → permissive. Browsers always send Origin on cross-origin.
  if (!origin) return "*";
  if (ALLOWED_EXACT.has(origin)) return origin;
  // Localhost / loopback for `vercel dev` + local Python http.server.
  if (
    origin.startsWith("http://localhost") ||
    origin.startsWith("http://127.0.0.1")
  )
    return origin;
  return null; // explicit reject — was previously `*.vercel.app`, now locked
}

function corsHeaders(origin) {
  const allow = resolveOrigin(origin);
  if (allow === null) return null;
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool dispatchers
// ─────────────────────────────────────────────────────────────────────────────

async function dispatchSendContactEmail(args, ctx) {
  const message = String(args?.message || "")
    .slice(0, 2000)
    .trim();
  const replyTo = args?.replyTo
    ? String(args.replyTo).slice(0, 200).trim()
    : null;
  if (!message) return { ok: false, error: "empty message" };

  // Internal call to /api/contact, same Vercel deployment. The contact handler
  // already handles validation, Resend, and email shaping.
  const base = ctx.origin || "https://www.kalfoundry.com";
  try {
    const resp = await fetch(`${base}/api/contact`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-via": "ask_foundry",
      },
      body: JSON.stringify({
        message,
        replyTo,
        sessionId: ctx.sessionId,
        via: "chat",
        history: ctx.history?.slice(-6) || [],
      }),
    });
    if (!resp.ok) return { ok: false, error: `contact ${resp.status}` };
    return { ok: true, summary: "email sent to kal foundry" };
  } catch (e) {
    return { ok: false, error: "network" };
  }
}

async function dispatchLookupPatent(args) {
  const q = String(args?.query || "").trim();
  const note =
    "the foundry's patent portfolio is being published — nothing to look up yet.";
  if (!q) return { matches: [], source: "empty", note };

  // Try semantic first. searchPatentsSemantic returns null when credentials
  // are missing or the upstream call fails — in either case we fall back to
  // the token-overlap searcher in _knowledge.js so the chat stays useful.
  let hits = null;
  try {
    hits = await searchPatentsSemantic(q, 3);
  } catch (e) {
    console.error("[ask_foundry] semantic search threw", e?.message || e);
    hits = null;
  }
  let source = "semantic";
  if (!hits) {
    hits = searchPatents(q, 3);
    source = "token";
  }
  const matches = hits.map((p) => ({
    pub: p.pub,
    title: p.title,
    domain: p.domain,
    abstract: p.abstract || "",
    status: p.status,
    filed_date: p.filed_date,
    score: p.score,
  }));
  // The portfolio store is empty for now, so matches will be []; surface a
  // friendly note so the model can explain rather than going silent.
  return matches.length ? { source, matches } : { source, matches, note };
}

function dispatchLinkToPage(args) {
  const page = args?.page;
  if (!PAGES[page]) return { error: "unknown page" };
  return { href: PAGES[page].href, label: PAGES[page].label };
}

function dispatchRecommendNextPage(args) {
  const topic = String(args?.topic || "").trim();
  if (!topic) return { recommendations: [] };
  const hits = recommendNextPage(topic, 2);
  return {
    recommendations: hits
      .filter((h) => h.score > 0)
      .map((h) => ({ page: h.page, href: h.href, label: h.label })),
  };
}

function dispatchCareerTimeline() {
  // CAREER_TIMELINE is empty for now — the foundry's milestones are coming soon.
  return CAREER_TIMELINE.length
    ? { timeline: CAREER_TIMELINE }
    : { timeline: [], note: "the foundry's milestones are coming soon." };
}

function dispatchCompareEngagements(args) {
  const note = "case studies coming soon.";
  const domain = String(args?.domain || "").trim();
  if (!domain) return { matches: [], note };
  const hits = compareEngagements(domain, 4);
  // ENGAGEMENTS is empty for now, so hits will be []; surface a friendly note.
  return {
    matches: hits.map((e) => ({
      code: e.code,
      title: e.title,
      years: e.years,
      blurb: e.blurb,
      domains: e.domains,
    })),
    ...(hits.length ? {} : { note }),
  };
}

// Short, human reasoning blurb emitted before a tool dispatch so the user sees
// the agent decide what it's about to do. Kept terse — recency-style cue, not
// a true chain-of-thought.
function deriveReasoning(name, args) {
  switch (name) {
    case "send_contact_email":
      return args?.replyTo
        ? `drafting a note to KAL Foundry, reply-to ${args.replyTo}…`
        : `drafting a note to KAL Foundry…`;
    case "lookup_patent":
      return args?.query
        ? `checking the patent index for "${String(args.query).slice(0, 60)}"…`
        : `checking the patent index…`;
    case "link_to_page":
      return args?.page
        ? `pulling the ${args.page} page link…`
        : `finding the right page…`;
    case "recommend_next_page":
      return args?.topic
        ? `figuring out which page covers "${String(args.topic).slice(0, 60)}"…`
        : `picking pages to recommend…`;
    case "get_career_timeline":
      return `assembling the foundry's timeline…`;
    case "compare_engagements":
      return args?.domain
        ? `filtering engagements by "${String(args.domain).slice(0, 60)}"…`
        : `filtering the foundry's engagements…`;
    default:
      return `running ${name}…`;
  }
}

async function executeToolCall(call, ctx) {
  let args = {};
  try {
    args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
  } catch {
    return { ok: false, error: "bad tool args" };
  }
  switch (call.function.name) {
    case "send_contact_email":
      return dispatchSendContactEmail(args, ctx);
    case "lookup_patent":
      return dispatchLookupPatent(args);
    case "link_to_page":
      return dispatchLinkToPage(args);
    case "recommend_next_page":
      return dispatchRecommendNextPage(args);
    case "get_career_timeline":
      return dispatchCareerTimeline();
    case "compare_engagements":
      return dispatchCompareEngagements(args);
    default:
      return { ok: false, error: "unknown tool" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI streaming + tool-call dispatch loop
// ─────────────────────────────────────────────────────────────────────────────

// OpenAI moderation pre-screen. Returns { flagged, categories } or null on
// error. Cheap (~30ms, free) — call before consuming budget so abusive content
// is rejected without paying for an LLM completion.
async function moderate(text) {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const resp = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "omni-moderation-latest",
        input: String(text || "").slice(0, 4000),
      }),
    });
    if (!resp.ok) return null;
    const j = await resp.json();
    const r = j.results?.[0];
    if (!r) return null;
    return {
      flagged: !!r.flagged,
      categories: Object.entries(r.categories || {})
        .filter(([, v]) => v)
        .map(([k]) => k),
    };
  } catch {
    return null;
  }
}

async function callOpenAI(messages, signal) {
  return fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    signal,
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      stream: true,
      // Ask OpenAI to append a final SSE chunk with token usage so we can
      // surface it in the behind-the-scenes panel without a second API call.
      stream_options: { include_usage: true },
      temperature: 0.4,
      max_tokens: MAX_TOKENS_PER_TURN,
    }),
  });
}

// Process one OpenAI SSE stream, forwarding text deltas as typed events and
// collecting any tool_calls. Returns the accumulated assistant message ready to
// append to the conversation for a follow-up turn.
async function streamRound(upstream, send, accumulator) {
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finishReason = null;
  // Tool-call deltas come in fragments keyed by index.
  const toolCalls = {}; // { [idx]: { id, type, function: { name, arguments } } }

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop(); // keep trailing partial line in buffer
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || !line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") {
        finishReason = finishReason || "stop";
        break;
      }
      let chunk;
      try {
        chunk = JSON.parse(payload);
      } catch {
        continue;
      }
      // Usage chunk arrives separately from choice deltas (when stream_options
      // include_usage is set). Bubble it up to the caller via the accumulator.
      if (chunk.usage) {
        accumulator.usage = chunk.usage;
      }
      const choice = chunk.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta || {};
      if (delta.content) {
        accumulator.text += delta.content;
        // Output filter: if accumulated text matches a leak pattern, swap to
        // fallback and stop forwarding from this stream. Caller will end turn.
        const scrubbed = scrubOutput(accumulator.text);
        if (scrubbed !== accumulator.text) {
          accumulator.text = scrubbed;
          accumulator.aborted = true;
          // Replace what we already streamed with the fallback + tag as refusal.
          send({ type: "refusal", content: scrubbed, reason: "output_filter" });
          return { finishReason: "output_filter", toolCalls: [] };
        }
        send({ type: "delta", content: delta.content });
        accumulator.lastFlush = accumulator.text;
      }
      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          if (!toolCalls[idx]) {
            toolCalls[idx] = {
              id: tc.id || "",
              type: "function",
              function: { name: "", arguments: "" },
            };
          }
          if (tc.id) toolCalls[idx].id = tc.id;
          if (tc.function?.name)
            toolCalls[idx].function.name = tc.function.name;
          if (tc.function?.arguments)
            toolCalls[idx].function.arguments += tc.function.arguments;
        }
      }
      if (choice.finish_reason) finishReason = choice.finish_reason;
    }
    if (accumulator.aborted) break;
  }
  return { finishReason, toolCalls: Object.values(toolCalls) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export default async function handler(req) {
  const origin = req.headers.get("origin") || "";
  const cors = corsHeaders(origin);
  if (cors === null) return new Response("origin not allowed", { status: 403 });

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  // Issue or recover the session cookie.
  const session = await getOrIssueSession(req);
  const baseHeaders = { ...cors };
  if (session.setCookie) baseHeaders["Set-Cookie"] = session.setCookie;

  // GET ?meta=1 — return current rate-limit budget for the pill UI.
  if (req.method === "GET") {
    const url = new URL(req.url);
    if (url.searchParams.get("meta") === "1") {
      const peek = await peekBudget(session.id);
      return new Response(
        JSON.stringify({
          remaining: peek.remaining,
          limit: RATE_LIMITS.SESSION_LIMIT,
          resetAt: peek.resetAt,
        }),
        {
          status: 200,
          headers: { ...baseHeaders, "Content-Type": "application/json" },
        },
      );
    }
    return new Response("method not allowed", {
      status: 405,
      headers: baseHeaders,
    });
  }

  if (req.method !== "POST") {
    return new Response("method not allowed", {
      status: 405,
      headers: baseHeaders,
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: "openai_key_missing" }), {
      status: 500,
      headers: { ...baseHeaders, "Content-Type": "application/json" },
    });
  }

  // Parse + validate body.
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad_json" }), {
      status: 400,
      headers: { ...baseHeaders, "Content-Type": "application/json" },
    });
  }

  const incoming = Array.isArray(body?.messages) ? body.messages : [];
  const safeHistory = incoming
    .filter(
      (m) =>
        (m?.role === "user" || m?.role === "assistant") &&
        typeof m?.content === "string",
    )
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({
      role: m.role,
      content:
        m.role === "user"
          ? sanitizeUserText(m.content)
          : String(m.content).slice(0, 4000),
    }))
    .filter((m) => m.content.length > 0);

  if (safeHistory.length === 0) {
    return new Response(JSON.stringify({ error: "empty_messages" }), {
      status: 400,
      headers: { ...baseHeaders, "Content-Type": "application/json" },
    });
  }

  // Annotate the latest user message if it tripped an injection signal.
  const lastUser = safeHistory[safeHistory.length - 1];
  if (lastUser.role === "user" && flagInjection(lastUser.content)) {
    lastUser.content = annotateUserMessage(lastUser.content);
  }

  // Moderation pre-screen on the latest user turn. Cheap; rejects abuse before
  // we spend an LLM call (or a budget unit). Fails open if API hiccups.
  const mod = await moderate(lastUser.content);
  if (mod?.flagged) {
    return new Response(
      JSON.stringify({
        error: "content_policy",
        categories: mod.categories,
      }),
      {
        status: 400,
        headers: { ...baseHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Rate-limit budget consumption.
  const ip =
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "unknown";
  const budget = await consumeBudget(session.id, ip);
  if (!budget.ok) {
    return new Response(
      JSON.stringify({
        error: "rate_limited",
        exceeded: budget.exceeded || "session",
        resetAt: budget.resetAt,
      }),
      {
        status: 429,
        headers: {
          ...baseHeaders,
          "Content-Type": "application/json",
          "Retry-After": String(
            Math.max(
              1,
              Math.ceil((new Date(budget.resetAt) - new Date()) / 1000),
            ),
          ),
        },
      },
    );
  }

  // Build the conversation for the model.
  const conversation = [
    { role: "system", content: SYSTEM_PROMPT },
    ...safeHistory,
  ];

  const ctx = {
    sessionId: session.id,
    origin: "https://www.kalfoundry.com",
    history: safeHistory,
  };

  // ─── SSE stream ──────────────────────────────────────────────────────────
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };
      const sendDone = () => {
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        controller.close();
      };

      const turnStart = Date.now();
      const turnUsage = {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      };
      const turnTools = [];

      function emitDebug() {
        send({
          type: "debug",
          model: MODEL,
          usage: turnUsage,
          tools: turnTools,
          latency_ms: Date.now() - turnStart,
        });
      }

      try {
        // Initial budget meta event so the UI can update the pill before any
        // text streams in.
        send({
          type: "meta",
          remaining: budget.remaining,
          resetAt: budget.resetAt,
        });

        for (let round = 0; round < MAX_TOOL_ROUNDS + 1; round++) {
          const upstream = await callOpenAI(conversation);
          if (!upstream.ok || !upstream.body) {
            const errText = await upstream.text().catch(() => "upstream");
            console.error(
              "[ask_foundry] openai upstream",
              upstream.status,
              errText.slice(0, 400),
            );
            send({ type: "error", message: "foundry_bot_upstream_error" });
            emitDebug();
            sendDone();
            return;
          }
          const accumulator = {
            text: "",
            lastFlush: "",
            aborted: false,
            usage: null,
          };
          const { finishReason, toolCalls } = await streamRound(
            upstream,
            send,
            accumulator,
          );

          // Roll up usage from this round.
          if (accumulator.usage) {
            turnUsage.prompt_tokens += accumulator.usage.prompt_tokens || 0;
            turnUsage.completion_tokens +=
              accumulator.usage.completion_tokens || 0;
            turnUsage.total_tokens += accumulator.usage.total_tokens || 0;
          }
          for (const tc of toolCalls) turnTools.push(tc.function.name);

          // Hit output filter mid-stream — bail out clean.
          if (accumulator.aborted) {
            emitDebug();
            sendDone();
            return;
          }

          // No tool calls → we're done for this turn.
          if (!toolCalls.length || finishReason !== "tool_calls") {
            // Final-output scrub belt-and-suspenders.
            const finalScrub = scrubOutput(accumulator.text);
            if (
              finalScrub !== accumulator.text &&
              finalScrub === FALLBACK_REPLY
            ) {
              // Output filter caught something on the way out — tell the UI to
              // replace the streamed text and tag the bubble as a refusal so
              // the user can read the "why?" rationale.
              send({
                type: "refusal",
                content: FALLBACK_REPLY,
                reason: "output_filter",
              });
            }
            emitDebug();
            sendDone();
            return;
          }

          // ── Tool round ─────────────────────────────────────────────────
          // Append the assistant turn (with tool_calls) to the conversation.
          conversation.push({
            role: "assistant",
            content: accumulator.text || null,
            tool_calls: toolCalls.map((tc) => ({
              id: tc.id,
              type: "function",
              function: {
                name: tc.function.name,
                arguments: tc.function.arguments,
              },
            })),
          });

          // Dispatch each call, forward tool_call + tool_result events, push
          // tool results into conversation for the next round.
          for (const tc of toolCalls.slice(0, 3)) {
            let argsPreview = {};
            try {
              argsPreview = tc.function.arguments
                ? JSON.parse(tc.function.arguments)
                : {};
            } catch {}
            // Reasoning preview first, then the tool_call. The UI renders the
            // reasoning line briefly before the spinner appears, so the user
            // sees the agent decide what it's doing.
            send({
              type: "reasoning",
              id: tc.id,
              text: deriveReasoning(tc.function.name, argsPreview),
            });
            send({
              type: "tool_call",
              id: tc.id,
              name: tc.function.name,
              args: argsPreview,
            });

            const result = await executeToolCall(tc, ctx);
            send({
              type: "tool_result",
              id: tc.id,
              name: tc.function.name,
              result,
            });

            conversation.push({
              role: "tool",
              tool_call_id: tc.id,
              content: JSON.stringify(result),
            });
          }
          // Loop back for another streaming round.
        }

        // If we exit the loop, we hit MAX_TOOL_ROUNDS without a stop.
        send({ type: "error", message: "tool_loop_exhausted" });
        emitDebug();
        sendDone();
      } catch (e) {
        console.error("[ask_foundry] handler error", e);
        try {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", message: "internal_error" })}\n\n`,
            ),
          );
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...baseHeaders,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
