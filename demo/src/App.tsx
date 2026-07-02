import { useMemo, useState } from 'react'
import type { BrowserAgentConfig, ModelInput } from '@dudko.dev/agent-web'
import { AgentChat, useAgent, useCredentials, useWebLLMModel } from '@dudko.dev/agent-web-react'
import { NotesBoard } from './components/NotesBoard'
import { Settings } from './components/Settings'
import { isLocal, MODELS } from './models'
import { useNotesBoard } from './notes'

const SYSTEM_PROMPT = `You manage a sticky-notes board through the provided tools.
Add, update, remove and list notes to satisfy the user's request. Keep each note
short (a few words). When asked for a list or a plan, create one note per item.
Use colors meaningfully — e.g. red for urgent, green for done.`

export const App = () => {
  const [modelId, setModelId] = useState('google')
  const model = MODELS.find((m) => m.id === modelId) ?? MODELS[0]
  const local = isLocal(model)

  const credentials = useCredentials()
  const board = useNotesBoard()
  const webllm = useWebLLMModel(model.model)

  // Cloud → a resolvable ProviderModelSpec; local → the loaded LanguageModel
  // (undefined until the user downloads it, which keeps the agent idle).
  const modelInput: ModelInput | undefined = local
    ? webllm.model
    : { providerType: model.providerType, model: model.model, credentialRef: model.credentialRef! }

  const config = useMemo<BrowserAgentConfig>(
    () => ({
      model: modelInput as ModelInput,
      credentials: credentials.store,
      tools: board.tools,
      describeState: board.describeState,
      systemPrompt: SYSTEM_PROMPT,
      maxIterations: 6,
    }),
    [modelInput, credentials.store, board.tools, board.describeState],
  )

  const agent = useAgent(config, {
    deps: [modelId, local && webllm.ready],
    autoStart: local ? webllm.ready : true,
  })

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

      <main className="app__main">
        <section className="app__left">
          <Settings
            models={MODELS}
            selected={model}
            onSelect={setModelId}
            credentials={credentials}
            webllm={webllm}
            onKeyChange={agent.reload}
          />
          <div className="app__chat">
            <AgentChat
              controller={agent}
              title="Notes agent"
              placeholder="e.g. Add a 3-item launch checklist and make the urgent one red"
              emptyState="Pick a model, add your key (or load a local model), then ask me to build your board."
            />
          </div>
        </section>

        <section className="app__right">
          <NotesBoard notes={board.notes} onClear={board.clear} />
        </section>
      </main>

      <footer className="app__footer">
        Keys are stored <strong>encrypted at rest</strong> (WebCrypto + IndexedDB) and never leave
        your browser. Built with{' '}
        <a href="https://www.npmjs.com/package/@dudko.dev/agent-web" target="_blank" rel="noreferrer">
          @dudko.dev/agent-web
        </a>
        .
      </footer>
    </div>
  )
}
