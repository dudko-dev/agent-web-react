import { useEffect, useMemo, useState } from 'react'
import type { BrowserAgentConfig, ModelInput } from '@dudko.dev/agent-web'
import {
  AgentChat,
  useAgent,
  useCredentials,
  useMcp,
  useWebLLMModel,
} from '@dudko.dev/agent-web-react'
import type { LanguageModel } from 'ai'
import { McpPanel } from './components/McpPanel'
import { NotesBoard } from './components/NotesBoard'
import { Settings } from './components/Settings'
import { isLocal, MODELS } from './models'
import { useNotesBoard } from './notes'
import { buildCloudModel, createLocalModel } from './providers'

const SYSTEM_PROMPT = `You manage a sticky-notes board through the provided tools.
Add, update, remove and list notes to satisfy the user's request. Keep each note
short (a few words). When asked for a list or a plan, create one note per item.
Use colors meaningfully — e.g. red for urgent, green for done.`

const MCP_SYSTEM_PROMPT = `You drive a remote MCP server the user connected themselves.
You have no prior knowledge of what its tools do beyond their names and descriptions —
read them, pick the ones that fit, and call them. Never invent a tool or a parameter.
If the tools cannot satisfy the request, say so plainly instead of guessing.`

type View = 'notes' | 'mcp'

/**
 * Which panel to open on load. An OAuth round-trip comes back to the bare page
 * URL (a redirect_uri may not carry a fragment), so `?code=…` is what tells us
 * the visitor was in the middle of connecting their MCP server.
 */
const initialView = (): View => {
  const params = new URLSearchParams(window.location.search)
  if (params.has('code') || params.has('error')) return 'mcp'
  return window.location.hash.replace(/^#\/?/, '') === 'mcp' ? 'mcp' : 'notes'
}

export const App = () => {
  const [modelId, setModelId] = useState('google-flash')
  const model = MODELS.find((m) => m.id === modelId) ?? MODELS[0]
  const local = isLocal(model)

  const credentials = useCredentials()
  const board = useNotesBoard()
  // Inject a statically-imported WebLLM factory so the weights actually bundle
  // (the core's dynamic import gets stubbed to an empty module by Vite).
  const webllm = useWebLLMModel(model.model, { create: createLocalModel })

  // Cloud models are built in-app from the vault-stored key. We pass the agent
  // a direct LanguageModel rather than a ProviderModelSpec, because the core's
  // dynamic `import('@ai-sdk/…')` can't be resolved from a browser bundle (see
  // providers.ts). Rebuilds whenever the key or selected model changes.
  const [cloudModel, setCloudModel] = useState<LanguageModel | undefined>(undefined)
  useEffect(() => {
    if (local) {
      setCloudModel(undefined)
      return
    }
    let active = true
    credentials.store
      .getApiKey(model.credentialRef!)
      .then((key) => {
        if (active) setCloudModel(key ? buildCloudModel(model, key) : undefined)
      })
      .catch(() => {
        if (active) setCloudModel(undefined)
      })
    return () => {
      active = false
    }
  }, [local, model, credentials.store, credentials.version])

  // Local → the loaded WebGPU model; cloud → the built provider model. Either is
  // undefined until ready, which keeps the agent idle (useAgent won't build
  // without a model) rather than constructing a broken one.
  const resolvedModel = local ? webllm.model : cloudModel

  const config = useMemo<BrowserAgentConfig>(
    () => ({
      model: resolvedModel as ModelInput,
      credentials: credentials.store,
      tools: board.tools,
      describeState: board.describeState,
      systemPrompt: SYSTEM_PROMPT,
      maxIterations: 6,
      // Stream the agent's internal phases (planning, tool dispatch, raw model
      // output) to the browser console — handy for poking at the demo.
      logLevel: 'debug',
    }),
    [resolvedModel, credentials.store, board.tools, board.describeState],
  )

  const agent = useAgent(config, {
    // Rebuild when the resolved model changes identity: model loaded, key
    // added/replaced, or provider switched.
    deps: [modelId, resolvedModel],
  })

  // ── Panel 2: the same agent, but driving whatever MCP server the visitor
  // connects. Its own agent instance so the two chats keep separate histories.
  const [view, setView] = useState<View>(initialView)
  const mcp = useMcp({ clientName: 'agent-web-demo' })

  useEffect(() => {
    const next = view === 'mcp' ? '#/mcp' : ''
    if (window.location.hash !== next) {
      // Keep the query string: useMcp reads (and clears) the OAuth callback
      // params from it, and this effect runs while that is still in flight.
      const { pathname, search } = window.location
      window.history.replaceState(null, '', `${pathname}${search}${next}`)
    }
  }, [view])

  const mcpConfig = useMemo<BrowserAgentConfig>(
    () => ({
      model: resolvedModel as ModelInput,
      credentials: credentials.store,
      tools: mcp.tools ?? {},
      systemPrompt: MCP_SYSTEM_PROMPT,
      maxIterations: 6,
      logLevel: 'debug',
    }),
    [resolvedModel, credentials.store, mcp.tools],
  )

  const mcpAgent = useAgent(mcpConfig, { deps: [modelId, resolvedModel, mcp.tools] })

  // One model, two agents: stop whichever panel the user just left, so a local
  // WebGPU engine never has two generations running against it at once.
  const stopNotes = agent.stop
  const stopMcp = mcpAgent.stop
  useEffect(() => {
    if (view === 'mcp') stopNotes()
    else stopMcp()
  }, [view, stopNotes, stopMcp])

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__brand">
          <span className="app__logo">🤖</span>
          <div>
            <h1 className="app__title">agent-web-react</h1>
            <p className="app__subtitle">
              An in-browser LLM agent editing a board via tools — plan, execute, replan.
            </p>
          </div>
        </div>
        <nav className="app__links">
          <a href="https://github.com/dudko-dev/agent-web-react" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a
            href="https://www.npmjs.com/package/@dudko.dev/agent-web-react"
            target="_blank"
            rel="noreferrer"
          >
            npm
          </a>
        </nav>
      </header>

      <nav className="app__tabs" role="tablist">
        <button
          role="tab"
          aria-selected={view === 'notes'}
          className={`app__tab${view === 'notes' ? ' is-active' : ''}`}
          onClick={() => setView('notes')}
        >
          Sticky notes
        </button>
        <button
          role="tab"
          aria-selected={view === 'mcp'}
          className={`app__tab${view === 'mcp' ? ' is-active' : ''}`}
          onClick={() => setView('mcp')}
        >
          Your MCP server
        </button>
      </nav>

      <main className="app__main">
        <section className="app__left">
          <Settings
            models={MODELS}
            selected={model}
            onSelect={setModelId}
            credentials={credentials}
            webllm={webllm}
            onKeyChange={() => {
              agent.reload()
              mcpAgent.reload()
            }}
          />
          <div className="app__chat">
            {view === 'notes' ? (
              <AgentChat
                controller={agent}
                title="Notes agent"
                placeholder="e.g. Add a 3-item launch checklist and make the urgent one red"
                emptyState="Pick a model, add your key (or load a local model), then ask me to build your board."
              />
            ) : mcp.status === 'connected' ? (
              <AgentChat
                controller={mcpAgent}
                title="MCP agent"
                placeholder="e.g. What can you do? Then ask it to actually do it."
                emptyState="Your server's tools are loaded — ask for something that uses them."
              />
            ) : (
              <div className="app__empty">
                Connect a server on the right, and its tools become this agent’s toolbox.
              </div>
            )}
          </div>
        </section>

        <section className="app__right">
          {view === 'notes' ? (
            <NotesBoard notes={board.notes} onClear={board.clear} />
          ) : (
            <McpPanel mcp={mcp} />
          )}
        </section>
      </main>

      <footer className="app__footer">
        Keys are stored <strong>encrypted at rest</strong> (WebCrypto + IndexedDB) and never leave
        your browser. Built with{' '}
        <a
          href="https://www.npmjs.com/package/@dudko.dev/agent-web"
          target="_blank"
          rel="noreferrer"
        >
          @dudko.dev/agent-web
        </a>
        .
      </footer>
    </div>
  )
}
