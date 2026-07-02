# @dudko.dev/agent-web-react

React bindings for [`@dudko.dev/agent-web`](https://www.npmjs.com/package/@dudko.dev/agent-web) —
the headless, universal **in-browser LLM agent**. Drop the agent into any React
app with a single hook and (optionally) a set of pre-styled components:

- 🪝 **`useAgent`** — build the agent from a config, stream its typed events into
  a ready-to-render state (plan, steps, tool calls, streamed answer, token
  usage, model-load progress, chat transcript), and get `run` / `stop` /
  `reset` / `reload`.
- 🧩 **`<AgentProvider>` + components** — a drop-in `<AgentChat>` panel plus
  `<PlanView>`, `<StepList>`, `<Composer>`, `<ModelLoadBar>`, `<UsageBadge>`,
  and `<ApiKeyForm>`. Bring your own CSS or import the optional stylesheet.
- 🔑 **`useCredentials`** — store BYOK API keys **encrypted at rest**
  (WebCrypto + IndexedDB).
- 🖥️ **`useWebLLMModel`** — load a local WebGPU model with download progress.
- 🎛️ **Headless-first** — the event→UI logic is a pure, exported reducer
  (`agentStateReducer`); the components are optional sugar on top.

[![npm](https://img.shields.io/npm/v/@dudko.dev/agent-web-react.svg)](https://www.npmjs.com/package/@dudko.dev/agent-web-react)
[![npm downloads](https://img.shields.io/npm/dy/@dudko.dev/agent-web-react.svg)](https://www.npmjs.com/package/@dudko.dev/agent-web-react)
[![license](https://img.shields.io/npm/l/@dudko.dev/agent-web-react.svg)](https://www.npmjs.com/package/@dudko.dev/agent-web-react)
![GitHub last commit](https://img.shields.io/github/last-commit/dudko-dev/agent-web-react.svg)

> **▶︎ [Live demo](https://dudko-dev.github.io/agent-web-react/)** — an agent that
> edits a sticky-notes board via tools. Cloud BYOK or local WebGPU, all in your
> browser. Source in [`demo/`](demo/).

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
        model: { providerType: 'google', model: 'gemini-flash-latest', credentialRef: 'google' },
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
    model: { providerType: 'openai', model: 'gpt-5-mini', credentialRef: 'openai' },
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
| `run(goal)` | Start a run; resolves with the `RunResult` |
| `stop()` | Abort the in-flight run |
| `reset()` | Clear the whole conversation |
| `reload()` | Rebuild the agent (e.g. after storing a new key) |
| `status` | `idle` \| `initializing` \| `ready` \| `running` \| `error` |
| `isReady` / `isRunning` | convenience booleans |
| `messages` | chat transcript (`{ role, content, pending }[]`) |
| `plan` / `steps` | the live plan and per-step tool calls |
| `finalText` | the streamed final answer |
| `usage` | running token total |
| `modelLoad` | WebLLM download progress, when loading |

**Options:** `deps` (rebuild the agent when these change — e.g. on a model
switch), `onEvent` (tap the raw event stream), `autoStart`, `maxEvents`.

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
      setModel(key ? createGoogleGenerativeAI({ apiKey: key })('gemini-flash-latest') : undefined)
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

## Components

All components are optional and styled by `styles.css` (class-prefixed `awr-`,
themeable via `--awr-*` custom properties, light + dark). Each accepts a
`className`; data components take plain props so you can use them standalone.

| Component | Purpose |
| --- | --- |
| `<AgentChat>` | Full panel: transcript + live activity + composer. Reads a `controller` prop or the `<AgentProvider>` context. |
| `<MessageList>` | The chat transcript. |
| `<Composer>` | Textarea + send/stop button (Enter to send). |
| `<PlanView>` | A plan's reasoning + step list. |
| `<StepList>` | Live execution steps with tool calls. |
| `<ModelLoadBar>` | WebLLM download/init progress. |
| `<UsageBadge>` | Compact token readout. |
| `<ApiKeyForm>` | BYOK key entry that writes to the encrypted vault. |

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
