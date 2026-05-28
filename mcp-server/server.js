#!/usr/bin/env node
// ask_foundry · MCP server (stdio transport)
//
// Same three tools the chat backend uses, exposed over the Model Context
// Protocol so Claude Desktop (or any MCP-compatible host) can attach and
// answer questions about KAL Foundry's work with the same affordances.
//
//   send_contact_email   — POSTs to https://www.kalfoundry.com/api/contact
//   lookup_patent        — the foundry's patent portfolio (coming soon)
//   link_to_page         — returns a relative URL on kalfoundry.com
//
// Setup (Claude Desktop):
//
//   1. `cd mcp-server && npm install`
//   2. Add this to ~/Library/Application Support/Claude/claude_desktop_config.json:
//
//        {
//          "mcpServers": {
//            "ask_foundry": {
//              "command": "node",
//              "args": ["/absolute/path/to/kalFoundryHomepage/mcp-server/server.js"]
//            }
//          }
//        }
//
//   3. Restart Claude Desktop. The three tools appear under "ask_foundry".

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import {
  PAGES,
  KNOWLEDGE_BASE,
  searchPatents,
  recommendNextPage,
  CAREER_TIMELINE,
  compareEngagements,
} from '../api/_knowledge.js';

const SITE_BASE = process.env.ASK_FOUNDRY_BASE_URL || 'https://www.kalfoundry.com';

// ─── Tool definitions ───────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'send_contact_email',
    description:
      "Send KAL Foundry an email on the user's behalf. Use ONLY when the user explicitly asks to contact, reach, or message the foundry. Confirm message content and a reply-to address with the user before calling.",
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: "The message the user wants delivered to the foundry.",
        },
        replyTo: {
          type: 'string',
          description: "The user's reply-to email address.",
        },
      },
      required: ['message'],
      additionalProperties: false,
    },
  },
  {
    name: 'lookup_patent',
    description:
      "Search the foundry's patent portfolio (coming soon). When filings are published, substring matches across publication number, title, abstract, and technical domain. Returns up to 3 matches.",
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'A publication number, title keyword, abstract phrase, or domain name.',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'link_to_page',
    description:
      "Return a clickable URL to a portfolio page on kalfoundry.com. Use to point a user at a specific section of the foundry's portfolio.",
    inputSchema: {
      type: 'object',
      properties: {
        page: {
          type: 'string',
          enum: ['work', 'case', 'patents', 'resume', 'now', 'about'],
        },
      },
      required: ['page'],
      additionalProperties: false,
    },
  },
  {
    name: 'recommend_next_page',
    description:
      "Recommend one or two portfolio pages the user should read next based on a topic. Returns page slugs + URLs ranked by relevance.",
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'The topic the user is exploring.' },
      },
      required: ['topic'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_career_timeline',
    description:
      "Return the foundry's milestones as a structured list of stops (year, role, where, blurb). Detailed history coming soon.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'compare_engagements',
    description:
      "Filter the foundry's anonymized client case studies by a domain or topic. Returns matching case codes with summaries. Case studies coming soon.",
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'Business domain, technology area, or keyword.' },
      },
      required: ['domain'],
      additionalProperties: false,
    },
  },
];

// ─── Dispatchers ────────────────────────────────────────────────────────────

async function dispatchSendContactEmail(args) {
  const message = String(args?.message || '').trim().slice(0, 2000);
  const replyTo = args?.replyTo ? String(args.replyTo).slice(0, 200).trim() : null;
  if (!message) {
    return { content: [{ type: 'text', text: 'error: empty message' }], isError: true };
  }
  try {
    const resp = await fetch(`${SITE_BASE}/api/contact`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-via': 'mcp',
        'x-mcp-origin': '1',
      },
      body: JSON.stringify({ message, replyTo, via: 'mcp' }),
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      return {
        content: [{ type: 'text', text: `contact failed: ${resp.status} ${txt.slice(0, 200)}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: 'text', text: `email sent to the foundry${replyTo ? ` (reply-to ${replyTo})` : ''}.` }],
    };
  } catch (e) {
    return {
      content: [{ type: 'text', text: `network error: ${String(e?.message || e).slice(0, 200)}` }],
      isError: true,
    };
  }
}

function dispatchLookupPatent(args) {
  const q = String(args?.query || '').trim();
  if (!q) return { content: [{ type: 'text', text: 'no query' }], isError: true };
  const hits = searchPatents(q, 3);
  if (hits.length === 0) {
    return { content: [{ type: 'text', text: `the foundry's patent portfolio is coming soon — no published filings matched "${q}" yet.` }] };
  }
  const text = hits
    .map(
      (p) =>
        `• ${p.pub} — ${p.title}\n  domain: ${p.domain}\n  ${p.abstract}`,
    )
    .join('\n\n');
  return { content: [{ type: 'text', text }] };
}

function dispatchLinkToPage(args) {
  const page = args?.page;
  if (!PAGES[page]) {
    return { content: [{ type: 'text', text: `unknown page: ${page}` }], isError: true };
  }
  const { href, label } = PAGES[page];
  return {
    content: [{ type: 'text', text: `${label}\n${SITE_BASE}${href}` }],
  };
}

function dispatchRecommendNextPage(args) {
  const topic = String(args?.topic || '').trim();
  if (!topic) return { content: [{ type: 'text', text: 'no topic provided' }], isError: true };
  const hits = recommendNextPage(topic, 2).filter((h) => h.score > 0);
  if (hits.length === 0) {
    return { content: [{ type: 'text', text: `no clear recommendation for "${topic}".` }] };
  }
  const text = hits
    .map((h) => `• ${h.label}\n  ${SITE_BASE}${h.href}`)
    .join('\n\n');
  return { content: [{ type: 'text', text }] };
}

function dispatchCareerTimeline() {
  const text = CAREER_TIMELINE
    .map((t) => `${t.year}  ·  ${t.role} — ${t.where}\n  ${t.blurb}`)
    .join('\n\n');
  return { content: [{ type: 'text', text }] };
}

function dispatchCompareEngagements(args) {
  const domain = String(args?.domain || '').trim();
  if (!domain) return { content: [{ type: 'text', text: 'no domain provided' }], isError: true };
  const hits = compareEngagements(domain, 4);
  if (hits.length === 0) {
    return { content: [{ type: 'text', text: `case studies coming soon — no published engagements matched "${domain}" yet.` }] };
  }
  const text = hits
    .map((e) => `${e.code} · ${e.title} (${e.years})\n  ${e.blurb}\n  domains: ${e.domains.join(', ')}`)
    .join('\n\n');
  return { content: [{ type: 'text', text }] };
}

// ─── Wire the MCP server ────────────────────────────────────────────────────

const server = new Server(
  { name: 'ask_foundry', version: '1.0.0' },
  {
    capabilities: {
      tools: {},
      // Expose the knowledge base as a single resource for clients that want
      // to seed context without calling tools.
      resources: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  switch (name) {
    case 'send_contact_email':
      return dispatchSendContactEmail(args);
    case 'lookup_patent':
      return dispatchLookupPatent(args);
    case 'link_to_page':
      return dispatchLinkToPage(args);
    case 'recommend_next_page':
      return dispatchRecommendNextPage(args);
    case 'get_career_timeline':
      return dispatchCareerTimeline();
    case 'compare_engagements':
      return dispatchCompareEngagements(args);
    default:
      return {
        content: [{ type: 'text', text: `unknown tool: ${name}` }],
        isError: true,
      };
  }
});

// Resource: a single read-only knowledge dump for clients that prefer reading
// over tool-calling. Optional — most clients will just use the tools.
try {
  const {
    ListResourcesRequestSchema,
    ReadResourceRequestSchema,
  } = await import('@modelcontextprotocol/sdk/types.js');

  const KB_URI = 'ask-foundry://knowledge';

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: KB_URI,
        name: 'about-foundry',
        description: 'Curated knowledge base — career, patents, engagements, principles.',
        mimeType: 'text/markdown',
      },
    ],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    if (req.params.uri !== KB_URI) {
      throw new Error('unknown resource');
    }
    return {
      contents: [
        {
          uri: KB_URI,
          mimeType: 'text/markdown',
          text: KNOWLEDGE_BASE,
        },
      ],
    };
  });
} catch {
  // Older SDK without resource schemas — tools still work.
}

const transport = new StdioServerTransport();
await server.connect(transport);

// Log a friendly banner to stderr so users see the server is alive without
// polluting stdout (which carries the MCP protocol).
process.stderr.write('[ask_foundry-mcp] ready · 3 tools · knowledge resource\n');
