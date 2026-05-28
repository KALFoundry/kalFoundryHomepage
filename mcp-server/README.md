# `ask_foundry` · MCP server

A standalone [Model Context Protocol](https://modelcontextprotocol.io) server that exposes KAL Foundry's portfolio as three tools any MCP-compatible client (Claude Desktop, Claude Code, etc.) can use:

| Tool | What it does |
|---|---|
| `send_contact_email` | Forwards a message to the foundry via the deployed `/api/contact` endpoint. |
| `lookup_patent` | Searches the patent portfolio (publication number, title, abstract, domain). |
| `link_to_page` | Returns a URL to a specific portfolio page (`work`, `case`, `patents`, `resume`, `now`, `about`). |

A read-only `ask-foundry://knowledge` resource also exposes the curated knowledge base so clients can seed context without calling tools.

## Install

```bash
cd mcp-server
npm install
```

That's it — the server runs over stdio, no daemon, no port to bind.

## Use with Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) and add an entry:

```json
{
  "mcpServers": {
    "ask_foundry": {
      "command": "node",
      "args": ["/absolute/path/to/kalFoundryHomepage/mcp-server/server.js"]
    }
  }
}
```

Replace the path with the absolute path on your machine. Restart Claude Desktop. The three tools appear under the wrench icon, tagged `ask_foundry`.

## Use with any MCP client

Any MCP host that supports stdio transports works. The command is:

```bash
node /absolute/path/to/kalFoundryHomepage/mcp-server/server.js
```

The host pipes JSON-RPC over stdio.

## Configuration

The server reads one env var:

| Var | Default | Use |
|---|---|---|
| `ASK_FOUNDRY_BASE_URL` | `https://www.kalfoundry.com` | Base URL for `send_contact_email`. Override for local Vercel dev (`http://localhost:3000`). |

## Try it from the command line

A quick sanity check without a full MCP host — pipe a `tools/list` request in via JSON-RPC:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | node server.js \
  | head -1
```

You should see a JSON-RPC response listing the three tools.

## Notes

- `send_contact_email` calls the same hosted `/api/contact` endpoint the website uses. Emails are tagged `via: mcp` so the foundry can see which channel routed them.
- `lookup_patent` is a substring-match on a static index. No embeddings, no semantic search — fast and deterministic.
- The patent portfolio served here is a curated subset (~10 filings). The full list of 100+ patents held by the team lives on the patents page.
