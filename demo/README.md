# agent-web-react — demo

A Vite + React app showcasing [`@dudko.dev/agent-web-react`](../): an in-browser
LLM agent driving tools. Pick a cloud model (bring your own key, stored
encrypted) or load a local WebGPU model — everything runs in the browser.

Two panels:

- **Sticky notes** — the agent edits a board through locally defined tools.
- **Your MCP server** — paste any remote MCP endpoint and the agent picks up
  *its* tools. Auth is none, a bearer token, or **OAuth 2.1 + dynamic client
  registration**: the app registers itself with your authorization server, runs
  PKCE, keeps the tokens encrypted in IndexedDB and refreshes them on expiry.
  The server must send CORS headers for this origin (including
  `Access-Control-Expose-Headers: WWW-Authenticate, mcp-session-id`) — the
  browser talks to it directly, nothing is proxied.

> The OAuth panel needs a core that exports `BrowserOAuthProvider`
> (`@dudko.dev/agent-web` ≥ 0.0.9). On an older core the panel says so and
> disables Connect for that mode; header auth is unaffected.

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
