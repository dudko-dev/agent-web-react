# @dudko.dev/agent-web-react

React bindings for [`@dudko.dev/agent-web`](https://www.npmjs.com/package/@dudko.dev/agent-web) —
the headless, universal **in-browser LLM agent**. Drop the agent into any React
app with a single hook and (optionally) a set of pre-styled components:

- 🪝 **`useAgent`** — build the agent from a config, stream its typed events into
  a ready-to-render state (plan, steps, tool calls, streamed answer, token
  usage, model-load progress, chat transcript), and get `run` / `stop` /
  `reset` / `reload`.
- 💬 **`<AgentChat>`** — a drop-in chat: every tool call with its cost, tokens by
  kind per answer and in total, thoughts, subagents, consent prompts; a
  composer with "+" / Ctrl+V / drag & drop attachments (images, PDFs, files),
  "/" commands, run timer, agents, model + thinking chip, the "⚡ Auto" consent
  chip and speech to text; saved chats in IndexedDB and a workspace (virtual
  file system) panel. Everything is a prop: show/hide, labels (i18n), render
  props, slots, swappable components, theme — see [docs/chat.md](docs/chat.md).
- 🧩 **Building blocks** — `<AgentComposer>`, `<MessageList>`, `<StepList>`,
  `<ToolApprovalPrompt>`, `<ChatHistoryList>`, `<FilesPanel>`, `<ContextMeter>`,
  `<ModelLoadBar>`, `<UsageBadge>`, `<ApiKeyForm>`; hooks `useChatHistory`,
  `useVirtualFiles`, `useSpeechToText`, `useMcpServers`.
- 🔑 **`useCredentials`** — store BYOK API keys **encrypted at rest**
  (WebCrypto + IndexedDB).
- 🖥️ **`useWebLLMModel`** — load a local WebGPU model with download progress.
- 🎛️ **Headless-first** — the event→UI logic is a pure, exported reducer
  (`agentStateReducer`); the components are optional sugar on top.

[![npm](https://img.shields.io/npm/v/@dudko.dev/agent-web-react.svg)](https://www.npmjs.com/package/@dudko.dev/agent-web-react)
[![npm downloads](https://img.shields.io/npm/dy/@dudko.dev/agent-web-react.svg)](https://www.npmjs.com/package/@dudko.dev/agent-web-react)
[![license](https://img.shields.io/npm/l/@dudko.dev/agent-web-react.svg)](https://www.npmjs.com/package/@dudko.dev/agent-web-react)
![GitHub last commit](https://img.shields.io/github/last-commit/dudko-dev/agent-web-react.svg)

> **▶︎ [Live demo](https://dudko-dev.github.io/agent-web-react/)** — three agents:
> one edits a sticky-notes board, one drives any number of MCP servers (plus a
> 185-tool mock catalogue to show tool search), and one plays chess against you
> — your move triggers it, analyst subagents run in Web Workers. Cloud BYOK or
> local WebGPU, all in your browser. Source in [`demo/`](demo/).

## Install

```bash
npm install @dudko.dev/agent-web-react @dudko.dev/agent-web react react-dom
```

Then add **only the model providers you use** (optional peers of the core,
dynamically imported):

```bash
# cloud, pick what you need
npm install @ai-sdk/openai        # or @ai-sdk/anthropic, @ai-sdk/google, @ai-sdk/xai, @ai-sdk/deepseek, @ai-sdk/openai-compatible
# local WebGPU models
npm install @browser-ai/web-llm @mlc-ai/web-llm
```

Import the optional stylesheet once (skip it if you style the components
yourself):

```ts
import '@dudko.dev/agent-web-react/styles.css'
```

## Quick start — a drop-in chat panel

`<AgentProvider>` builds one agent and shares it; `<AgentChat>` renders it.

```tsx
import { useMemo } from 'react'
import {
  AgentProvider,
  AgentChat,
  useCredentials,
  defineTool,
} from '@dudko.dev/agent-web-react'
import { z } from 'zod'
import '@dudko.dev/agent-web-react/styles.css'

export function Assistant() {
  const credentials = useCredentials() // encrypted vault (WebCrypto + IndexedDB)

  // Your app's actions, as tools. Keep the object referentially stable.
  const tools = useMemo(
    () => ({
      add_text: defineTool({
        description: 'Add a text block to the page.',
        inputSchema: z.object({ text: z.string() }),
        execute: async ({ text }) => addTextBlock(text), // your code
      }),
    }),
    [],
  )

  return (
    <AgentProvider
      config={{
        model: { providerType: 'google', model: 'gemini-3.5-flash', credentialRef: 'google' },
        credentials: credentials.store,
        tools,
        describeState: () => serializeMyState(), // optional grounding
      }}
    >
      <AgentChat title="Assistant" style={{ height: 520 }} />
    </AgentProvider>
  )
}
```

> **Using a bundler (Vite, Next, CRA)?** A provider **spec** like the one above
> asks the core to `import('@ai-sdk/google')` at runtime — but browser bundlers
> can't resolve that bare, `@vite-ignore`d import, so it fails with
> _“Provider package … is not installed”_ (and WebLLM fails with _“webLLM is not
> a function”_). Build the model yourself and pass it **directly** instead — see
> [Models in a bundler](#models-in-a-bundler-vite-next-cra). It's a few extra
> lines and works in every bundler.

Store the user's key once (encrypted at rest), e.g. from a settings form:

```tsx
const credentials = useCredentials()
await credentials.setKey('google', userProvidedKey)
// or drop in <ApiKeyForm credentials={credentials} credentialRef="google" />
```

## The `useAgent` hook (headless)

`useAgent` is the whole library in one hook — use it directly if you want your
own UI:

```tsx
import { useAgent } from '@dudko.dev/agent-web-react'

function Custom() {
  const agent = useAgent({
    // In a bundler, pass a model you built (see “Models in a bundler”); a
    // provider spec like this one only resolves where dynamic imports do.
    model: { providerType: 'openai', model: 'gpt-5.4-mini', credentialRef: 'openai' },
    credentials,
    tools,
  })

  return (
    <>
      <button disabled={!agent.isReady} onClick={() => agent.run('Add a totals row')}>
        Run
      </button>
      {agent.isRunning && <button onClick={agent.stop}>Stop</button>}

      {/* Everything below is live, derived from the event stream: */}
      {agent.plan && <p>{agent.plan.thought}</p>}
      {agent.steps.map((s) => (
        <div key={s.id}>
          {s.index}/{s.total} · {s.step.description} · {s.status}
          {s.toolCalls.map((c, i) => (
            <code key={i}>{c.name}</code>
          ))}
        </div>
      ))}
      <p>{agent.finalText}</p>
      <small>{agent.usage.totalTokens} tokens</small>
    </>
  )
}
```

`useAgent(config, options)` returns the full [`AgentUiState`](src/types.ts) plus:

| Field | Description |
| --- | --- |
| `run(goal, { images, files, attachments, label })` | Start a run (with attachments); resolves with the `RunResult` |
| `stop()` | Abort the in-flight run |
| `reset()` | Clear the whole conversation (and the agent's memory of it) |
| `reload()` | Rebuild the agent (e.g. after storing a new key) |
| `status` | `idle` \| `initializing` \| `ready` \| `running` \| `error` |
| `isReady` / `isRunning` | convenience booleans |
| `messages` | transcript; each assistant message keeps its steps, tool calls, thoughts, approvals, subagents, usage and duration |
| `plan` / `steps` | the live plan and per-step tool calls (with timing) |
| `finalText` / `finalReasoning` | the streamed answer and its thoughts |
| `usage` / `totalUsage` | tokens of this run / of the conversation, by kind |
| `pendingApprovals`, `approve(id, { remember })`, `deny(id)` | tool consent |
| `approvalMode` / `setApprovalMode(mode)` | the autopilot switch, live |
| `compact()` | summarise the stored transcript now |
| `sessionId` / `loadChat(chat)` | the memory session; switch conversations |
| `subagents`, `skills`, `discoveredTools`, `compactions`, `budget` | the rest of the run, folded |
| `modelLoad` | WebLLM download progress, when loading |

**Options:** `deps` (rebuild the agent when these change — e.g. on a model
switch), `onEvent` (tap the raw event stream), `autoStart`, `maxEvents`,
`approvals` (route consent requests into the hook; default true).

> Keep `tools` and `describeState` referentially stable (`useMemo` /
> `useCallback`); pass a changed `deps` array to rebuild the agent on a
> model/provider switch.

## Local WebGPU model (no key, offline)

```tsx
import { useAgent, useWebLLMModel, ModelLoadBar } from '@dudko.dev/agent-web-react'
import { webLLM } from '@browser-ai/web-llm' // your app's optional peer

// Build WebLLM in your own code so the bundler includes it (see note below).
const createLocalModel = (id: string, opts?: object) => Promise.resolve(webLLM(id, opts as never))

function LocalAgent() {
  const local = useWebLLMModel('Qwen2.5-1.5B-Instruct-q4f16_1-MLC', { create: createLocalModel })
  const agent = useAgent(
    { model: local.model!, tools },
    { deps: [local.model] }, // build once the model is loaded
  )

  if (!local.ready) {
    return local.loading ? (
      <ModelLoadBar load={{ progress: local.progress, text: local.text }} />
    ) : (
      <button disabled={!local.supported} onClick={local.load}>
        Load local model
      </button>
    )
  }
  return <AgentChat controller={agent} />
}
```

> `load()` eagerly downloads the weights (so the progress bar fills during load,
> not silently on the first message) and `ready` flips only once the model can
> actually answer. The `create` option is what makes it work under a bundler —
> see below.

## Models in a bundler (Vite, Next, CRA)

The core builds cloud providers with `import('@ai-sdk/<provider>')` and WebLLM
with `import('@browser-ai/web-llm')`. Those are **bare, `@vite-ignore`d dynamic
imports** — great for Node/SSR/import-map setups, but a browser bundler either
leaves them unresolvable at runtime (cloud → _“Provider package … is not
installed”_) or stubs them to an empty module (WebLLM → _“webLLM is not a
function”_).

The fix is the same for both: **build the model in your own code** (a static
import your bundler can see) and hand the agent a direct `LanguageModel`.

**Cloud** — construct the provider from the vault-stored key:

```tsx
import { useEffect, useState } from 'react'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import type { LanguageModel } from 'ai'
import { useAgent, useCredentials } from '@dudko.dev/agent-web-react'

function CloudAgent() {
  const credentials = useCredentials()
  const [model, setModel] = useState<LanguageModel>()

  useEffect(() => {
    credentials.store.getApiKey('google').then((key) => {
      setModel(key ? createGoogleGenerativeAI({ apiKey: key })('gemini-3.5-flash') : undefined)
    })
  }, [credentials.store, credentials.version])

  const agent = useAgent({ model: model!, credentials: credentials.store, tools }, { deps: [model] })
  // …render <AgentChat controller={agent} /> once model is set
}
```

> Anthropic needs `headers: { 'anthropic-dangerous-direct-browser-access': 'true' }`
> passed to `createAnthropic({ … })` for direct browser calls.

**Local** — pass a statically-imported `webLLM` factory via `useWebLLMModel`'s
`create` option (see the WebLLM example above).

The [`demo/`](demo/) app does exactly this — see
[`demo/src/providers.ts`](demo/src/providers.ts).

## The `useMcp` hook — connect a remote MCP server

Let the user name their own MCP server at runtime and hand its tools to the
agent. Auth is either a static header or the full OAuth 2.1 flow with **dynamic
client registration** — no client ID to configure, and the access token is
refreshed for you when it expires mid-run.

```tsx
const mcp = useMcp({ clientName: 'my-app' })

await mcp.connect({ url, oauth: true })       // or { url, headers: { Authorization } }

// The server wants a sign-in: send the user off from a real click.
{mcp.status === 'needs-authorization' && <button onClick={mcp.authorize}>Authorize</button>}

// Then just merge the tools into any agent config.
const config = { model, tools: { ...myTools, ...mcp.tools } }
```

`useMcp` returns `{ status, tools, catalog, error, authorizationUrl,
oauthSupported, completingAuthorization, connect, disconnect, authorize,
forgetAuthorization, checkOAuthSupport }`. `status` is
`idle | connecting | connected | needs-authorization | error`.

The OAuth round-trip navigates away from your app, so the hook persists what it
needs and, on the way back, finishes the code exchange, strips `?code=…` from
the address bar and reconnects before rendering — `completingAuthorization`
covers that window.

Two notes:

- The connector lives in the core's optional `@dudko.dev/agent-web/mcp` subpath
  and is loaded with a **dynamic import**, so apps that never call `connect`
  don't pay for `@modelcontextprotocol/sdk`. Install it alongside the core when
  you do use MCP.
- `oauthSupported` is `false` on cores older than `@dudko.dev/agent-web@0.0.9`,
  which introduced `BrowserOAuthProvider`; header auth still works there. The
  peer floor is `>=0.0.11` — that is the first core whose own peer ranges
  resolve against AI SDK v7.

## Several MCP servers — `useMcpServers`

```tsx
const mcp = useMcpServers({ clientName: 'my-app' }) // the list persists; reconnects on load
await mcp.add({ name: 'docs', url, auth: 'oauth' }) // 'none' | 'bearer' (+ token) | 'oauth'
mcp.servers  // [{ name, url, status, catalog, error, … }]
const config = { model, tools: { ...myTools, ...mcp.tools } } // "<name>__<tool>"
```

Servers connect in parallel, each with its own deadline; paginated tool lists
are read to the end; tools a server marks read-only skip the "ask before
changes" prompt. With hundreds of tools the core switches to **tool search**
(a compact catalogue + `find_tools`) above `toolSearchThreshold` — see the
core's [capabilities doc](https://github.com/dudko-dev/agent-web/blob/main/docs/capabilities.md).

## Components

All components are optional and styled by `styles.css` (class-prefixed `awr-`,
themeable via `--awr-*` custom properties, light + dark, or `theme`). Each
accepts a `className` and `labels`; data components take plain props so you can
use them standalone. The full guide: [docs/chat.md](docs/chat.md).

| Component | Purpose |
| --- | --- |
| `<AgentChat>` | Full panel: transcript with per-answer activity + composer + optional history and files panels. Reads a `controller` prop or the `<AgentProvider>` context. |
| `<AgentComposer>` | The input and its toolbar: attachments, commands, timer, agents, model/thinking, consent, mic, send/stop. |
| `<MessageList>` | The transcript; each answer with its steps, tool calls, thoughts, usage. |
| `<StepList>` / `<ToolCallRow>` | Execution steps / one tool call with its cost and images. |
| `<ToolApprovalPrompt>` | Consent cards (Allow once / Always / Deny). |
| `<ApprovalModeSwitch>` | Segmented consent-mode switch. |
| `<ChatHistoryList>` | Saved chats (from `useChatHistory`). |
| `<FilesPanel>` | A `VirtualFileSystem`, live: preview, download, delete, upload. |
| `<ContextMeter>` | Tokens by kind, budget bar, last compaction, Compact. |
| `<PlanView>` | A plan's reasoning + step list. |
| `<ModelLoadBar>` | WebLLM download/init progress. |
| `<UsageBadge>` | Compact token readout. |
| `<ApiKeyForm>` | BYOK key entry that writes to the encrypted vault. |
| `<Composer>` | The minimal textarea + send/stop (kept for existing apps). |

### Build your own UI

The components are a thin layer over the exported, **pure** reducer. Use it
directly if you'd rather render everything yourself:

```ts
import { agentStateReducer, createInitialAgentState } from '@dudko.dev/agent-web-react'

let state = createInitialAgentState()
state = agentStateReducer(state, { type: 'event', event }) // fold each AgentEvent
```

## How it fits together

```
@dudko.dev/agent-web (peer)     →  the headless agent + providers + vault
@dudko.dev/agent-web-react      →  useAgent / <AgentProvider> / components
your app                        →  tools, credentials, and where the panel goes
```

The React package re-exports the core primitives you usually need
(`createAgent`, `defineTool`, `VaultCredentialStore`, `createWebLLMModel`,
`isWebGPUAvailable`, and the key types), so a React app can import everything
from one place.

> **Direct browser calls & CORS:** not every provider allows direct BYOK calls
> from a browser origin. Google (Gemini), openai-compatible and the gateway are
> the reliable direct paths; Anthropic works (a required header is injected);
> OpenAI/xAI/DeepSeek usually need a proxy. See the core's
> [providers doc](https://github.com/dudko-dev/agent-web/blob/main/docs/providers.md).
> Ship only the **user's own** key to the browser — shared/app keys belong
> behind a proxy or the gateway.

## Browser tests

`npm run test:e2e` builds the demo and drives it in Chromium:

- MCP: connecting to one and to several servers, the full OAuth redirect
  round-trip (authorize → come back with a code → connected), reconnecting
  with the stored tokens after a reload, and an unreachable server;
- the agent, against a scripted Gemini endpoint ([`e2e/gemini.ts`](e2e/gemini.ts),
  the real `@ai-sdk/google` provider underneath): tool calls and tokens by
  kind in the transcript, a chat saved and restored after a reload, an image
  attached (shown, sent as a file part, saved in the workspace), a file
  dropped anywhere on the page, consent in "Ask" mode, slash commands, the
  chess move that triggers the agent, and Russian labels. The MCP and authorization servers it
talks to are started on loopback by [`e2e/servers.ts`](e2e/servers.ts), CORS
headers included — so the test also pins the deployment requirement that the
challenge header be exposed.

These cover what unit tests structurally cannot: effect ordering across a real
render, a real navigation away and back, and IndexedDB.

## Demo & deployment

The [`demo/`](demo/) app (Vite + React) is deployed to GitHub Pages by
[`.github/workflows/deploy-demo.yml`](.github/workflows/deploy-demo.yml) on
every push to `main`. To run it locally:

```bash
npm install && npm run build      # build the library into dist/
cd demo && npm install && npm run dev
```

The demo aliases `@dudko.dev/agent-web-react` to the built `../dist`, so rebuild
the library (`npm run build`) after changing its source.

## License

MIT © Siarhei Dudko
