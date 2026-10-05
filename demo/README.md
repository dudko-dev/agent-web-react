# agent-web-react — demo

A Vite + React app showcasing [`@dudko.dev/agent-web-react`](../): an in-browser
LLM agent driving tools. Pick a cloud model (bring your own key, stored
encrypted) or an on-device one — everything runs in the browser.

**Models** (October 2026): Gemini (3.8 Flash, 3.5 Flash-Lite, 3.1 Pro), Claude
(Haiku 4.5, Sonnet 5.5, Opus 5.5, Fable 5.1), GPT-6 (Luna, Sol, Astra), Kimi
(K2.6, K3), Groq and Cerebras for speed (GPT-OSS, Qwen3.8 with images), Mistral
(Small 4, Medium 3.5) and OpenRouter (type any model id). Every one of them
answers a page directly with your key (CORS). On the device: WebLLM (Gemma 3 1B,
Llama 3.2 1B/3B, Qwen3.5 0.8B–9B, Ministral 3 3B, Phi-4 mini, Llama 3.1 8B and
Phi-3.5 Vision for images), Chrome's built-in Gemini Nano (no download), and
transformers.js (SmolVLM 256M and Gemma 4 E2B, images). Each provider and
runtime is fetched the first time you pick one of its models.

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
  and plays with `make_move`. No chat message needed. The rules, not the
  model, decide the outcome: a mate, stalemate or draw ends the game on the
  spot (a mating move is never answered), and a turn the agent ends without
  moving — an API error, a spent quota, a stop — is shown as such, with the
  board locked until it moves (Retry, or the built-in engine).

The **Agent settings** panel drives the core's features live: tool consent
(⚡ autopilot / ask before changes / ask everything / read-only), thinking
level ("none" turns a local Qwen's thinking off), token / tool-call / step limits, context window and auto-compaction,
skills (each tab lists its own built-in examples; your own or imported
`SKILL.md` ones apply to every tab), the chess analysts — and the **chat UI**: tool calls, token usage, saved chats
(IndexedDB), the files panel, theme, and the labels (English / Russian — every
string of the chat is a prop).

The chat itself shows every tool call with its cost, tokens by kind per answer
and in total, thoughts, subagents and consent prompts; the composer has
attachments, "/" commands, a run timer, the running-agents count, the model +
thinking chip, the consent chip and a speech-to-text mic.

For quick answers: a fast provider (Groq, Cerebras, Flash-Lite), a small local
model with Thinking "none", and **Fast answers** in the agent settings (no
replanner, no separate final answer: 2 model calls per turn instead of 3+).

Local models: pick one and press "Download & load". Switching to another one
shows it as not loaded (the loaded one stays in memory, so switching back is
instant); loading it frees the previous model's GPU memory first, and
"Unload" frees it on demand. Each is loaded with its own context window —
WebLLM's default is 4096 tokens; Qwen3.5 0.8B/2B get 32k, 4B/9B 16k, Llama 3.2
1B 16k, the rest 8k (each note says the VRAM it takes) — and the agent
fits its runs into it: compaction, tool lists and tool results are sized from
the window ("Window: auto"). **Phi-3.5 Vision** is a local multimodal model:
paste or drop an image and ask about it.

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
