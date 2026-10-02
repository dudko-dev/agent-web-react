# @dudko.dev/agent-web-react — instructions for Claude

React bindings for **`@dudko.dev/agent-web`**, the headless in-browser LLM agent.
This package adds a thin, UI layer: one hook (`useAgent`), a context provider,
and a set of optional pre-styled components. It ships **no agent logic of its
own** — the core does planning/tools/providers/vault; this package turns its
`AgentEvent` stream into React state and renders it.

The repo also contains a **Vite demo** (`demo/`) that is auto-deployed to
**GitHub Pages** on every push to `main`.

## Principles

- **The core is the engine; this is the dashboard.** All model/tool/vault logic
  lives in `@dudko.dev/agent-web` (a peer dependency). Never reimplement it here.
- **Headless-first.** The event→UI mapping is a **pure reducer** (`src/state.ts`,
  exported as `agentStateReducer`) with no React, clock or randomness — so it is
  unit-testable and lets hosts build a fully custom UI. Components are sugar.
- **`useAgent` is the seam.** It builds the agent, streams events into
  `AgentUiState`, and exposes `run/stop/reset/reload`. Everything else composes it.
- **Optional peers.** `react`, `react-dom`, and `@dudko.dev/agent-web` are peers.
  Model providers / WebLLM are the **core's** optional peers — this package never
  imports them directly.
- **Styling is opt-in.** Components carry `awr-`-prefixed classes and read
  `--awr-*` custom properties; `styles.css` is a separate import, copied verbatim
  into `dist`. No CSS-in-JS runtime, no CSS imported from TS.

## Layout

- `src/state.ts` — the pure `agentStateReducer` + `createInitialAgentState`.
- `src/types.ts` — `AgentUiState`, `ChatMessage`, `StepView`, `ToolCallView`, …
- `src/hooks/` — `use-agent` (the hook), `use-credentials` (vault),
  `use-webllm-model`, `use-mcp` (remote MCP + OAuth round-trip),
  `use-mcp-servers` (several servers), `use-chat-history`, `use-virtual-files`,
  `use-speech-to-text`.
- `src/chat-history.ts` — `ChatHistoryStore` (raw IndexedDB, memory fallback).
- `src/composer.ts` — the composer's pure helpers (slash commands, attachment
  kinds/refusals, notices); `src/image-resize.ts` — `downscaleImage`.
- `src/labels.tsx` — every UI string (`defaultLabels`, `AgentLabelsProvider`,
  `useLabels`); components take `labels` overrides.
- `src/mcp-types.ts` — structural types for the core's optional `./mcp` subpath,
  which `use-mcp` loads with a dynamic import (never a static one).
- `src/context.tsx` — `AgentProvider` + `useAgentContext`.
- `src/components/` — `AgentChat` (panel: history sidebar, transcript,
  composer, files panel; slots / render props / components / theme),
  `AgentComposer`, `MessageList`, `StepList` (+ `ToolCallRow`),
  `ToolApprovalPrompt`, `ApprovalModeSwitch`, `ChatHistoryList`, `FilesPanel`,
  `ContextMeter`, `Composer` (minimal), `PlanView`, `ModelLoadBar`,
  `UsageBadge`, `ApiKeyForm`, `icons`, `format`. Docs: `docs/chat.md`.
- `demo/src/components/McpPanel.tsx` — the demo's "bring your own MCP" panel.
- `src/styles.css` — optional theme (light + dark).
- `src/index.ts` — public surface (+ curated re-exports from the core).
- `tests/state.test.ts`, `tests/chat.test.ts` — `node --test` over the reducer,
  composer helpers, labels and the history store (imports from `dist`).
- `e2e/` — Playwright over the built demo: MCP (several servers, the OAuth
  redirect round-trip, IndexedDB reuse, CORS — `servers.ts` starts a real MCP
  server + authorization server on loopback) and the agent end to end against
  a scripted Gemini endpoint (`gemini.ts`, routed by the stage markers).
- `demo/` — the Vite + React demo (aliases the library to `../dist`).

## Commands

```bash
npm run typecheck     # tsc --noEmit
npm run format:check  # prettier
npm run build         # tsup → dist (ESM + CJS + d.ts) + copy styles.css
npm test              # node --test tests/*.test.ts (pretest builds)
npm run test:e2e      # playwright over the built demo (browser flows)

# demo
cd demo && npm install && npm run dev      # local dev (rebuild the lib first)
cd demo && npm run typecheck && npm run build
```

CI (`.github/workflows/ci.yml`) runs the library job (typecheck → format:check →
build → test), then a demo job (build lib → build demo) and a browser job
(Playwright over the built demo). Release (`release.yml`)
publishes to npm via Trusted Publishing after CI passes on `main`. Pages
(`deploy-demo.yml`) builds and deploys the demo. Keep all green before pushing.

## Conventions

- Prettier: no semicolons, single quotes, trailing commas, width 100.
- Intra-package imports use `.js` specifiers (tsup/esbuild resolve them to
  `.ts`/`.tsx`), matching the core package.
- The **demo** uses extensionless imports (Vite) and consumes the built
  library from `../dist` via a Vite alias + a tsconfig `paths` mapping — so
  build the library before building the demo.
- Keep the event→UI logic in the reducer, not the components. New event fields
  from the core map to new `AgentUiState` fields + a reducer case + a test.
- Every user-visible string goes through `labels` (add it to `AgentLabels` and
  `defaultLabels`); every new part of a component gets a `show*` prop or a
  render prop / slot — hosts must be able to hide, relabel or replace it.
- Don't import model providers, `ai`, or `zod` at runtime here — the core owns
  them. Type-only imports from `@dudko.dev/agent-web` are fine.
