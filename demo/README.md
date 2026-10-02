# agent-web-react — demo

A Vite + React app showcasing [`@dudko.dev/agent-web-react`](../): an in-browser
LLM agent driving tools. Pick a cloud model (bring your own key, stored
encrypted) or load a local WebGPU model — everything runs in the browser.

Three tabs, sharing one "Agent settings" panel:

- **Sticky notes** — the agent edits a board through locally defined tools.
  Attach files (the "+" button, Ctrl+V for images, or drop them anywhere on the
  page): images go to vision models, PDFs to models that read them — and are
  converted to Markdown in the browser with
  [`@dudko.dev/pdf-to-md-core`](https://www.npmjs.com/package/@dudko.dev/pdf-to-md-core)
  for the ones that don't. Attachments land in a workspace (a virtual file
  system in IndexedDB) the agent reads and writes with its `fs_*` tools.
- **MCP servers** — connect **any number** of remote MCP endpoints; their tools
  merge into one agent (`<server>__<tool>`). Auth per server is none, a bearer
  token, or **OAuth 2.1 + dynamic client registration**: the app registers
  itself, runs PKCE, keeps the tokens encrypted in IndexedDB and refreshes them.
  The list is remembered and reconnects on load. Tick the **mock catalogue** to
  add 185 tools on six pretend servers and watch the agent switch to **tool
  search** (a compact catalogue + `find_tools`) instead of sending every schema.
  Each server must send CORS headers for this origin (including
  `Access-Control-Expose-Headers: WWW-Authenticate, mcp-session-id`).
- **Chess vs agent** — you play White; **your move is the trigger**: the agent
  reads the position with `get_position`, weighs candidates (`evaluate_moves`,
  or analyst **subagents** — each in its own **Web Worker**, or in-process),
  and plays with `make_move`. No chat message needed.

The **Agent settings** panel drives the core's features live: tool consent
(⚡ autopilot / ask before changes / ask everything / read-only), thinking
level, token / tool-call / step limits, context window and auto-compaction,
skills (built-in examples, your own, or imported `SKILL.md`), the chess
analysts — and the **chat UI**: tool calls, token usage, saved chats
(IndexedDB), the files panel, theme, and the labels (English / Russian — every
string of the chat is a prop).

The chat itself shows every tool call with its cost, tokens by kind per answer
and in total, thoughts, subagents and consent prompts; the composer has
attachments, "/" commands, a run timer, the running-agents count, the model +
thinking chip, the consent chip and a speech-to-text mic.

**Live:** https://dudko-dev.github.io/agent-web-react/

## Run locally

```bash
# from the repo root — build the library the demo consumes
npm install && npm run build

# then the demo
cd demo
npm install
npm run dev
```

The demo aliases `@dudko.dev/agent-web-react` to the built `../dist` (see
[`vite.config.ts`](vite.config.ts)), so re-run `npm run build` in the repo root
after editing the library source.

## Deployment

Pushed to GitHub Pages automatically by
[`../.github/workflows/deploy-demo.yml`](../.github/workflows/deploy-demo.yml).
The Vite `base` is `/agent-web-react/` to match the project-pages URL; override
it with the `DEMO_BASE` env var if you fork under a different repo name.
