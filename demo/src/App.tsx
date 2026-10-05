import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Square } from 'chess.js'
import type { BrowserAgentConfig, ModelInput, ProviderType } from '@dudko.dev/agent-web'
import {
  AgentChat,
  ChatHistoryStore,
  IndexedDBStore,
  MemoryStore,
  createFileTools,
  createSubagentTool,
  useAgent,
  useCredentials,
  useMcpServers,
  useLocalModel,
  type AgentChatProps,
  type AgentToolSet,
} from '@dudko.dev/agent-web-react'
import type { LanguageModel } from 'ai'
import { ANALYST_PROMPT, engineTools } from './chess/analyst-tools'
import { ChessPanel } from './chess/ChessPanel'
import { outcomeText, useChessGame } from './chess/game'
import { AgentSettingsPanel } from './components/AgentSettingsPanel'
import { McpPanel } from './components/McpPanel'
import { NotesBoard } from './components/NotesBoard'
import { Settings } from './components/Settings'
import { buildMockCatalog } from './mockCatalog'
import { isLocal, MODELS } from './models'
import { useNotesBoard } from './notes'
import { buildCloudModel } from './cloud'
import { engineFor } from './local-engines'
import { RU_LABELS } from './i18n'
import { Markdown } from './markdown'
import {
  enabledSkillsFor,
  useDemoSettings,
  useSettingsConfig,
  type AnalystMode,
  type ThinkingChoice,
  type View,
} from './settings'
import { pdfToMarkdown, workspace } from './workspace'

const NOTES_PROMPT = `You manage a sticky-notes board through the provided tools.
Add, update, remove and list notes to satisfy the user's request. Keep each note
short (a few words). When asked for a list or a plan, create one note per item.
Use colors meaningfully — e.g. red for urgent, green for done.
Files the user attaches are in the workspace under /attachments — read them with fs_read when asked about them.`

const MCP_PROMPT = `You drive the remote MCP servers the user connected (tools are prefixed "<server>__").
You know nothing about their tools beyond names and descriptions — read them, pick the ones that fit, and call them.
Never invent a tool or a parameter. Answer questions with the data the tools return.
The user's workspace is reachable with the fs_* tools (attachments are under /attachments; save longer reports there as Markdown).`

const chessPrompt = (
  analysts: AnalystMode,
) => `You play chess as Black against the user (White) on the board shown in this app. Each run starts right after the user's move and is ONE step: reply to that move.
On your turn: 1) call get_position; 2) pick 2-4 candidate moves and ${
  analysts === 'off'
    ? 'check them with evaluate_moves'
    : 'ask consult_analyst about EACH candidate — one call per candidate, all in the same step so they run in parallel — and weigh their verdicts'
}; 3) play the best one with make_move — exactly one move per turn.
Then reply with one or two friendly sentences: your idea and any threat. Never ask the user anything.
If make_move fails, read its error (it lists the legal moves) and try again. If the game is over, say so and do not move.`

const VIEWS: View[] = ['notes', 'mcp', 'chess']

/**
 * Which panel to open on load. An OAuth round-trip comes back to the bare page
 * URL (a redirect_uri may not carry a fragment), so `?code=…` is what tells us
 * the visitor was in the middle of connecting an MCP server.
 */
const initialView = (): View => {
  const params = new URLSearchParams(window.location.search)
  if (params.has('code') || params.has('error')) return 'mcp'
  const hash = window.location.hash.replace(/^#\/?/, '') as View
  return VIEWS.includes(hash) ? hash : 'notes'
}

const CUSTOM_MODEL_KEY = 'agent-web-demo:openrouter-model'
const readCustomModelId = (fallback: string): string => {
  try {
    return localStorage.getItem(CUSTOM_MODEL_KEY) ?? fallback
  } catch {
    return fallback
  }
}
const writeCustomModelId = (id: string) => {
  try {
    localStorage.setItem(CUSTOM_MODEL_KEY, id)
  } catch {
    /* private mode */
  }
}

export const App = () => {
  const [modelId, setModelId] = useState('google-flash')
  const model = MODELS.find((m) => m.id === modelId) ?? MODELS[0]
  const local = isLocal(model)
  // OpenRouter's "any model": the id the user typed (remembered).
  const [customModelId, setCustomModelId] = useState(() =>
    readCustomModelId(MODELS.find((m) => m.customModel)?.model ?? ''),
  )
  const cloudModelId = model.customModel ? customModelId.trim() || model.model : model.model

  const credentials = useCredentials()
  // One hook for every on-device runtime: WebLLM, the browser's built-in model,
  // transformers.js (local-engines.ts). WebLLM models load with their own
  // window, not WebLLM's 4096 default.
  const localModel = useLocalModel(model.model, engineFor(model), {
    contextWindowTokens: model.runtime === 'web-llm' ? model.contextWindow : undefined,
  })

  // Cloud models are built in-app from the vault-stored key and passed to the
  // agent directly (see cloud.ts). Rebuilds when the key or model changes.
  const [cloudModel, setCloudModel] = useState<LanguageModel | undefined>(undefined)
  useEffect(() => {
    if (local || !model.provider) {
      setCloudModel(undefined)
      return
    }
    let active = true
    credentials.store
      .getApiKey(model.credentialRef!)
      .then(async (key) => {
        const built = key ? await buildCloudModel(model.provider!, cloudModelId, key) : undefined
        if (active) setCloudModel(built)
      })
      .catch(() => {
        if (active) setCloudModel(undefined)
      })
    return () => {
      active = false
    }
  }, [local, model, cloudModelId, credentials.store, credentials.version])
  const resolvedModel = local ? localModel.model : cloudModel

  // ── Agent settings shared by every tab ─────────────────────────────────────
  const { settings, update, reset: resetSettings } = useDemoSettings()
  // The window runs must fit: a loaded local model reports its own.
  const modelWindow = local
    ? (localModel.contextWindow ?? model.contextWindow)
    : model.contextWindow
  const { config: settingsConfig, rebuildKey } = useSettingsConfig(settings, modelWindow)
  // The model's memory per conversation. With saved chats it lives in
  // IndexedDB too (keyed by the chat id), so a reopened chat continues with its
  // context; the chess game is not saved, so its memory isn't either.
  const memories = useMemo(() => {
    const persistent = settings.history ? new IndexedDBStore() : undefined
    return {
      notes: persistent ?? new MemoryStore(),
      mcp: persistent ?? new MemoryStore(),
      chess: new MemoryStore(),
    }
  }, [settings.history])
  // Saved chats (transcripts with tool calls, usage and images), one DB per tab.
  const histories = useMemo(
    () => ({
      notes: new ChatHistoryStore({ dbName: 'agent-web-demo-chats-notes' }),
      mcp: new ChatHistoryStore({ dbName: 'agent-web-demo-chats-mcp' }),
    }),
    [],
  )
  // The agents can read the attachments and write files into the workspace.
  const fileTools = useMemo(() => createFileTools(workspace), [])
  // Each tab gets only its own skills (chess coaching has no place in an MCP
  // chat); custom skills apply everywhere.
  const skillsByTab = useMemo(
    () => ({
      notes: enabledSkillsFor(settings, 'notes'),
      mcp: enabledSkillsFor(settings, 'mcp'),
      chess: enabledSkillsFor(settings, 'chess'),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings.customSkills, settings.enabledSkills],
  )
  const base = (tab: View): Partial<BrowserAgentConfig> => ({
    model: resolvedModel as ModelInput,
    credentials: credentials.store,
    memory: memories[tab],
    sessionId: tab,
    ...settingsConfig,
    skills: skillsByTab[tab],
    // The consent mode is applied live by useAgent — no rebuild on a switch.
    toolApproval: { mode: settings.approvalMode },
    // Images, where the core can't tell from the model (built-in, Gemma 4).
    ...(model.vision ? { vision: true } : {}),
    // Stream the agent's internal phases to the console — handy for poking.
    logLevel: 'debug',
  })
  const deps = [modelId, resolvedModel, rebuildKey, memories]

  // ── Tab 1: sticky notes ─────────────────────────────────────────────────────
  const board = useNotesBoard()
  const notesAgent = useAgent(
    {
      ...base('notes'),
      model: resolvedModel as ModelInput,
      tools: { ...board.tools, ...fileTools },
      describeState: board.describeState,
      systemPrompt: NOTES_PROMPT,
    },
    { deps: [...deps, skillsByTab.notes] },
  )

  // ── Tab 2: any number of MCP servers (+ an optional mock catalogue) ────────
  const [view, setView] = useState<View>(initialView)
  const mcp = useMcpServers({ clientName: 'agent-web-demo' })
  const [mockCatalog, setMockCatalog] = useState(false)
  const mcpTools = useMemo<AgentToolSet>(
    () => ({ ...mcp.tools, ...fileTools, ...(mockCatalog ? buildMockCatalog() : {}) }),
    [mcp.tools, mockCatalog, fileTools],
  )
  const mcpAgent = useAgent(
    {
      ...base('mcp'),
      model: resolvedModel as ModelInput,
      tools: mcpTools,
      systemPrompt: MCP_PROMPT,
    },
    { deps: [...deps, mcpTools, skillsByTab.mcp] },
  )

  // ── Tab 3: chess against the agent, with analyst subagents ─────────────────
  const game = useChessGame()
  // The last step error of the agent's turn (see playAgentTurn).
  const chessErrorRef = useRef<string | undefined>(undefined)
  const workerAnalystsBlocked = settings.analysts === 'worker' && local
  const analysts = useMemo<AgentToolSet>(() => {
    if (settings.analysts === 'off' || !resolvedModel) return {} as AgentToolSet
    const description =
      'Ask a chess analyst sub-agent to assess ONE candidate move in the current position (it runs an engine search). Call it once per candidate, several in the same step to run them in parallel.'
    const hostTools = { get_position: game.tools.get_position }
    const inWorker = settings.analysts === 'worker' && !local
    return {
      consult_analyst: inWorker
        ? createSubagentTool({
            name: 'analyst',
            description,
            // Each delegation gets a fresh worker: a 3-ply search per candidate,
            // in parallel, without ever blocking the page.
            worker: () =>
              new Worker(new URL('./chess/analyst.worker.ts', import.meta.url), { type: 'module' }),
            workerConfig: {
              model: {
                // The worker builds it with the same builder (cloud.ts).
                providerType: model.provider as ProviderType,
                model: cloudModelId,
                credentialRef: model.credentialRef,
              },
              systemPrompt: ANALYST_PROMPT,
              maxIterations: 3,
              maxStepsPerTask: 4,
              replan: false,
            },
            credentials: credentials.store,
            tools: hostTools,
            maxConcurrent: 4,
            timeoutMs: 120_000,
            readOnly: true,
          })
        : createSubagentTool({
            name: 'analyst',
            description,
            config: {
              model: resolvedModel,
              tools: engineTools(2),
              systemPrompt: ANALYST_PROMPT,
              maxIterations: 3,
              maxStepsPerTask: 4,
              replan: false,
            },
            tools: hostTools,
            maxConcurrent: 2,
            readOnly: true,
          }),
    }
  }, [settings.analysts, resolvedModel, local, model, cloudModelId, credentials.store, game.tools])
  const chessAgent = useAgent(
    {
      ...base('chess'),
      model: resolvedModel as ModelInput,
      tools: { ...game.tools, ...analysts },
      describeState: game.describeState,
      systemPrompt: chessPrompt(settings.analysts),
      // A turn is one step: read, weigh, move. No second step to re-read the
      // board (it then found White to move and "waited"), no replanner calls.
      maxPlanSteps: 1,
      replan: false,
    },
    {
      deps: [...deps, analysts, skillsByTab.chess],
      // A step error (quota, network) doesn't end the run; keep it for the board.
      onEvent: (e) => {
        if (e.type === 'error') chessErrorRef.current = e.error
      },
    },
  )

  // Whether the agent moved is read off the board, never off its words: a turn
  // that ends with Black still to move is a failed turn, and the board stays
  // locked until it does move (Retry, or the engine).
  const [chessIssue, setChessIssue] = useState<string | undefined>()
  const chessRun = chessAgent.run
  const { current: chessNow, agentColor } = game
  const playAgentTurn = useCallback(
    async (goal: string) => {
      setChessIssue(undefined)
      chessErrorRef.current = undefined
      const result = await chessRun(goal)
      const now = chessNow()
      if (now.outcome || now.turn !== agentColor) return // it moved
      const error = chessErrorRef.current
      setChessIssue(
        result === undefined && !error
          ? 'The agent could not start its turn (still loading, or busy).'
          : result?.stopped
            ? 'The agent’s turn was stopped before it moved.'
            : result?.budgetExceeded
              ? `The agent hit its ${result.budgetExceeded.kind} limit before moving.`
              : error
                ? `The agent failed: ${error}`
                : 'The agent ended its turn without making a move.',
      )
    },
    [chessRun, chessNow, agentColor],
  )
  const onUserMove = useCallback(
    (from: Square, to: Square) => {
      const san = game.userMove(from, to)
      if (!san) return
      // The rules decide the end: a mating (or drawing) move ends the game here,
      // and the agent isn't asked to play on.
      if (game.current().outcome) return
      // The move IS the trigger: no chat message, the agent just answers it.
      void playAgentTurn(`White played ${san}. Your move.`)
    },
    [game, playAgentTurn],
  )
  const onNewGame = () => {
    game.newGame()
    chessAgent.reset()
    setChessIssue(undefined)
  }

  // ── Routing & one-model-at-a-time ──────────────────────────────────────────
  useEffect(() => {
    const next = view === 'notes' ? '' : `#/${view}`
    if (window.location.hash !== next) {
      // Keep the query string: useMcpServers reads (and clears) the OAuth
      // callback params from it, and this effect runs while that is in flight.
      const { pathname, search } = window.location
      window.history.replaceState(null, '', `${pathname}${search}${next}`)
    }
  }, [view])

  // One model, three agents: stop the panels the user left, so a local WebGPU
  // engine never has two generations running against it at once.
  const stops = { notes: notesAgent.stop, mcp: mcpAgent.stop, chess: chessAgent.stop }
  useEffect(() => {
    for (const v of VIEWS) if (v !== view) stops[v]()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  // Everything below is a prop of <AgentChat> — the "Chat UI" settings flip them.
  const ru = settings.lang === 'ru'
  const chatCommon: Partial<AgentChatProps> = {
    showContext: settings.maxTotalTokens || true,
    showThoughts: settings.showThoughts,
    showToolCalls: settings.showToolCalls,
    showUsage: settings.showUsage,
    showTotalUsage: settings.showUsage,
    theme: settings.theme,
    labels: ru ? RU_LABELS : undefined,
    files: settings.filesPanel ? workspace : undefined,
    // Answers are Markdown — render them (any renderer plugs in here).
    renderContent: (m) => (m.role === 'assistant' ? <Markdown text={m.content} /> : m.content),
  }
  const composer = (placeholder: string): AgentChatProps['composer'] => ({
    placeholder: ru ? undefined : placeholder,
    // The model and thinking chips switch the same state as the settings panel.
    model: {
      label: model.label.split(' — ')[0],
      options: MODELS.map((m) => ({ id: m.id, label: m.label, group: m.group })),
      value: modelId,
      onSelect: setModelId,
    },
    thinking: {
      value: settings.thinking,
      onChange: (thinking) => update({ thinking: thinking as ThinkingChoice }),
    },
    // PDFs the model can't read become Markdown in the browser.
    convertFile: pdfToMarkdown,
    // Drop files anywhere on the page.
    dropZone: 'window',
  })
  const mcpToolCount = Object.keys(mcp.tools).length + (mockCatalog ? 1 : 0)

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__brand">
          <span className="app__logo">🤖</span>
          <div>
            <h1 className="app__title">agent-web-react</h1>
            <p className="app__subtitle">
              An in-browser LLM agent that plans, calls tools, thinks, asks for consent, delegates
              to sub-agents in Web Workers — and plays chess.
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
        {(
          [
            ['notes', 'Sticky notes'],
            ['mcp', 'MCP servers'],
            ['chess', 'Chess vs agent'],
          ] as [View, string][]
        ).map(([v, label]) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            className={`app__tab${view === v ? ' is-active' : ''}`}
            onClick={() => setView(v)}
          >
            {label}
          </button>
        ))}
      </nav>

      <main className={`app__main app__main--${view}`}>
        <section className="app__left">
          <div className="app__setup">
            <Settings
              models={MODELS}
              selected={model}
              onSelect={setModelId}
              credentials={credentials}
              local={localModel}
              customModelId={customModelId}
              onCustomModelId={(id) => {
                setCustomModelId(id)
                writeCustomModelId(id)
              }}
              onKeyChange={() => {
                notesAgent.reload()
                mcpAgent.reload()
                chessAgent.reload()
              }}
              ready={Boolean(resolvedModel)}
            />
            <AgentSettingsPanel
              settings={settings}
              view={view}
              modelWindow={modelWindow}
              update={update}
              onReset={resetSettings}
            />
          </div>
          <div className="app__chat">
            {view === 'notes' && (
              <AgentChat
                controller={notesAgent}
                title="Notes agent"
                emptyState="Pick a model, add your key (or load a local model), then ask me to build your board. Attach a file (drop it anywhere, paste an image, or press +) and ask about it."
                history={settings.history ? histories.notes : false}
                composer={composer(
                  'e.g. Add a 3-item launch checklist and make the urgent one red',
                )}
                {...chatCommon}
              />
            )}
            {view === 'mcp' &&
              (mcpToolCount > 0 ? (
                <AgentChat
                  controller={mcpAgent}
                  title="MCP agent"
                  emptyState="Your servers' tools are loaded — ask for something that uses them."
                  history={settings.history ? histories.mcp : false}
                  composer={composer('e.g. What can you do? Then ask it to actually do it.')}
                  {...chatCommon}
                />
              ) : (
                <div className="app__empty">
                  Connect one or more servers on the right (or add the mock catalogue), and their
                  tools become this agent’s toolbox.
                </div>
              ))}
            {view === 'chess' && (
              <AgentChat
                controller={chessAgent}
                title="Chess agent (Black)"
                emptyState="You are White. Make a move on the board — each move triggers the agent, which reads the position, checks candidates and replies with its move."
                composer={composer('Chat with your opponent — or just make a move on the board')}
                {...chatCommon}
                files={undefined}
                // The game's own verdict, after whatever the model said.
                slots={{
                  afterMessages: game.outcome ? (
                    <div className="chess-note chess-note--result" role="status">
                      🏁 {outcomeText(game.outcome)}
                    </div>
                  ) : chessIssue && !chessAgent.isRunning ? (
                    <div className="chess-note chess-note--issue" role="alert">
                      ⚠ {chessIssue} The board waits for its move — Retry or Engine move.
                    </div>
                  ) : undefined,
                }}
              />
            )}
          </div>
        </section>

        <section className="app__right">
          {view === 'notes' && <NotesBoard notes={board.notes} onClear={board.clear} />}
          {view === 'mcp' && (
            <McpPanel
              mcp={mcp}
              mockCatalog={mockCatalog}
              onMockCatalog={setMockCatalog}
              toolCount={Object.keys(mcpTools).length}
              searchMode={
                (mcpAgent.agent?.toolStrategy ??
                  (Object.keys(mcpTools).length > 40 ? 'search' : 'all')) === 'search'
              }
            />
          )}
          {view === 'chess' && (
            <ChessPanel
              game={game}
              agentBusy={chessAgent.isRunning}
              agentReady={chessAgent.isReady}
              analysts={settings.analysts}
              analystsNote={
                workerAnalystsBlocked
                  ? 'A local WebGPU model lives in this page and cannot be shared with workers — the analysts run in-process instead.'
                  : undefined
              }
              onAnalysts={(analysts) => update({ analysts })}
              onUserMove={onUserMove}
              agentIssue={chessIssue}
              onAskAgent={() => void playAgentTurn("It's your move.")}
              onEngineMove={() => {
                if (game.engineMove()) setChessIssue(undefined)
              }}
              onNewGame={onNewGame}
            />
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
