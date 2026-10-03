import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { DependencyList } from 'react'
import {
  createAgent,
  type IUsage,
  type Agent,
  type AgentEventHandler,
  type BrowserAgentConfig,
  type CompactResult,
  type RunFile,
  type RunResult,
  type ToolApprovalDecision,
  type ToolApprovalMode,
  type ToolApprovalRequest,
} from '@dudko.dev/agent-web'
import { agentStateReducer, createInitialAgentState } from '../state.js'
import type { AgentUiState, ApprovalView, ChatAttachment, ChatMessage } from '../types.js'
import { errMessage } from '../util.js'

export interface UseAgentOptions {
  /**
   * Rebuild the agent when any of these values change — compared like a
   * `useEffect` dependency array (so it must keep a stable length across
   * renders). Default: build once on mount. Bump this when you switch
   * model/provider so a fresh agent is constructed with the new config.
   *
   * Keep dynamic config (`tools`, `describeState`) referentially stable across
   * renders (e.g. via `useRef`/`useCallback`) so it survives without a rebuild.
   */
  deps?: DependencyList
  /** Invoked for every raw agent event, after the internal reducer folds it. */
  onEvent?: AgentEventHandler
  /** Build the agent immediately on mount (default `true`). */
  autoStart?: boolean
  /** Cap the retained raw event log length (default 200; 0 = unbounded). */
  maxEvents?: number
  /**
   * Route tool-consent requests into the hook (`pendingApprovals`, `approve`,
   * `deny`) when the config has no `toolApproval.onRequest` of its own
   * (default true). Render them with `<ToolApprovalPrompt>`, or your own UI.
   */
  approvals?: boolean
}

export interface ApproveOptions {
  /** Also allow this tool for the rest of the agent's life ("always allow"). */
  remember?: boolean
}

export interface RunGoalOptions {
  /**
   * What the transcript shows for this turn when it differs from what the
   * agent receives — e.g. the typed text without the attached files' contents.
   */
  label?: string
  /** Images sent to the model with the goal (vision models; see `agent.capabilities`). */
  images?: RunFile[]
  /** PDFs / files / URLs sent to the model with the goal. */
  files?: RunFile[]
  /** What the transcript shows as attached to this turn (thumbnails, chips). */
  attachments?: ChatAttachment[]
}

export interface UseAgentReturn extends AgentUiState {
  /** Run a goal. Resolves with the RunResult, or `undefined` if it couldn't start. */
  run: (goal: string, options?: RunGoalOptions) => Promise<RunResult | undefined>
  /** Abort the in-flight run (observed between phases and mid-stream). */
  stop: () => void
  /** Clear the whole conversation — transcript, current run, and the agent's memory. */
  reset: () => void
  /** Rebuild the agent now (e.g. after the user stores a new API key). */
  reload: () => void
  /** The built agent, once ready. */
  agent: Agent | undefined
  isRunning: boolean
  isReady: boolean
  /** Tool calls waiting for the user's consent. */
  pendingApprovals: ApprovalView[]
  /** Let a pending call run (`remember` → never ask for this tool again). */
  approve: (id: string, options?: ApproveOptions) => void
  /** Refuse a pending call; the model is told and works around it. */
  deny: (id: string, reason?: string) => void
  /** The consent policy in effect. */
  approvalMode: ToolApprovalMode
  /** Switch the consent policy live — the "autopilot" toggle. */
  setApprovalMode: (mode: ToolApprovalMode) => void
  /** Summarise the stored transcript now (needs `config.memory`). */
  compact: () => Promise<CompactResult | undefined>
  /** The memory session runs use (config.sessionId until switched). */
  sessionId: string
  /**
   * Switch to another conversation: its id becomes the memory session of the
   * next runs, and its saved transcript (chat history) is shown.
   */
  loadChat: (chat: { sessionId: string; messages?: ChatMessage[]; totalUsage?: IUsage }) => void
}

/**
 * The primary React binding for `@dudko.dev/agent-web`. Builds the agent from a
 * {@link BrowserAgentConfig}, streams its typed events into a renderable
 * {@link AgentUiState} (plan, steps, tool calls, thoughts, consent requests,
 * subagents, streamed final answer, token usage, model-load progress and a chat
 * transcript), and exposes `run` / `stop` / `reset` / `reload` plus consent
 * (`approve` / `deny` / `setApprovalMode`) and `compact`.
 *
 * ```tsx
 * const agent = useAgent({
 *   model: { providerType: 'openai', model: 'gpt-4o-mini', credentialRef: 'openai' },
 *   credentials,
 *   tools,
 *   toolApproval: { mode: 'ask-writes' }, // requests land in agent.pendingApprovals
 * })
 * // <button disabled={!agent.isReady} onClick={() => agent.run(text)}>Run</button>
 * ```
 */
export const useAgent = (
  config: BrowserAgentConfig,
  options: UseAgentOptions = {},
): UseAgentReturn => {
  const [state, dispatch] = useReducer(agentStateReducer, undefined, createInitialAgentState)
  const agentRef = useRef<Agent | undefined>(undefined)
  const abortRef = useRef<AbortController | undefined>(undefined)
  const [generation, setGeneration] = useState(0)

  // Keep the latest callbacks/config without forcing an agent rebuild.
  const configRef = useRef(config)
  configRef.current = config
  const optionsRef = useRef(options)
  optionsRef.current = options

  // Consent requests waiting for approve()/deny(), by request id.
  const resolversRef = useRef(new Map<string, (d: ToolApprovalDecision) => void>())
  const settleAll = useCallback((decision: ToolApprovalDecision) => {
    for (const resolve of resolversRef.current.values()) resolve(decision)
    resolversRef.current.clear()
  }, [])
  const uiOnRequest = useCallback(
    (req: ToolApprovalRequest) =>
      new Promise<ToolApprovalDecision>((resolve) => {
        resolversRef.current.set(req.id, resolve)
      }),
    [],
  )

  // The memory session runs go to; a chat-history switch changes it.
  const [sessionId, setSessionId] = useState(config.sessionId ?? 'default')
  const sessionRef = useRef(sessionId)
  sessionRef.current = sessionId

  const configMode = config.toolApproval?.mode ?? 'autopilot'
  const [approvalMode, setApprovalModeState] = useState<ToolApprovalMode>(configMode)
  const modeRef = useRef<ToolApprovalMode>(configMode)

  const setApprovalMode = useCallback((mode: ToolApprovalMode) => {
    modeRef.current = mode
    agentRef.current?.setToolApprovalMode(mode)
    setApprovalModeState(mode)
  }, [])

  // The config's mode is the source of truth when IT changes; applied live.
  useEffect(() => {
    if (configMode !== modeRef.current) setApprovalMode(configMode)
  }, [configMode, setApprovalMode])

  const reload = useCallback(() => setGeneration((g) => g + 1), [])

  // Build (and rebuild) the agent. Model resolution is async (dynamic provider
  // imports, vault key fetch, WebLLM weight download), so this lives in effect.
  const { autoStart, deps } = options
  useEffect(() => {
    // Any dep change invalidates the current agent first.
    agentRef.current = undefined
    const cfg = configRef.current
    // Skip building until we're asked to (autoStart / reload) and actually have
    // a model — a local WebGPU model may still be downloading (config.model
    // undefined), in which case we sit idle rather than build a broken agent.
    const shouldBuild = (autoStart !== false || generation > 0) && Boolean(cfg.model)
    if (!shouldBuild) {
      dispatch({ type: 'status', status: 'idle' })
      return
    }
    // Consent requests come to the hook unless the host handles them itself.
    const routeApprovals = optionsRef.current.approvals !== false && !cfg.toolApproval?.onRequest
    const built: BrowserAgentConfig = routeApprovals
      ? {
          ...cfg,
          toolApproval: { ...cfg.toolApproval, mode: modeRef.current, onRequest: uiOnRequest },
        }
      : cfg
    let cancelled = false
    dispatch({ type: 'status', status: 'initializing' })
    createAgent(built)
      .then((agent) => {
        if (cancelled) return
        agent.setToolApprovalMode(modeRef.current)
        agentRef.current = agent
        dispatch({ type: 'status', status: 'ready' })
      })
      .catch((err) => {
        if (cancelled) return
        dispatch({ type: 'status', status: 'error', error: errMessage(err) })
      })
    return () => {
      cancelled = true
    }
    // `config` is intentionally excluded: rebuilds are driven only by `deps` /
    // reload(), so a new config object every render doesn't churn the agent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation, autoStart, ...(deps ?? [])])

  // Abort any in-flight run (and release waiting consent requests) on unmount.
  useEffect(
    () => () => {
      abortRef.current?.abort()
      settleAll({ approved: false, reason: 'the view was closed' })
    },
    [settleAll],
  )

  const run = useCallback(
    async (goal: string, runOptions?: RunGoalOptions): Promise<RunResult | undefined> => {
      const agent = agentRef.current
      if (!agent || abortRef.current) return undefined // not ready, or already running
      const controller = new AbortController()
      abortRef.current = controller
      dispatch({ type: 'status', status: 'running' })
      try {
        return await agent.run(goal, {
          signal: controller.signal,
          sessionId: sessionRef.current,
          ...(runOptions?.images?.length ? { images: runOptions.images } : {}),
          ...(runOptions?.files?.length ? { files: runOptions.files } : {}),
          onEvent: (event) => {
            const start = event.type === 'run.start'
            const shown = start && runOptions?.label ? { ...event, goal: runOptions.label } : event
            dispatch({
              type: 'event',
              event: shown,
              maxEvents: optionsRef.current.maxEvents,
              at: Date.now(),
              ...(start && runOptions?.attachments?.length
                ? { attachments: runOptions.attachments }
                : {}),
            })
            try {
              optionsRef.current.onEvent?.(event)
            } catch {
              /* a bad host handler must not break the run */
            }
          },
        })
      } catch (err) {
        dispatch({
          type: 'event',
          event: { type: 'error', phase: 'run', error: errMessage(err) },
          maxEvents: optionsRef.current.maxEvents,
        })
        return undefined
      } finally {
        abortRef.current = undefined
        settleAll({ approved: false, reason: 'the run ended' })
        dispatch({ type: 'status', status: 'ready' })
      }
    },
    [settleAll],
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
    settleAll({ approved: false, reason: 'stopped by the user' })
  }, [settleAll])

  const reset = useCallback(() => {
    dispatch({ type: 'reset' })
    // "New conversation" means the agent forgets it too, not just the view.
    void configRef.current.memory?.clear(sessionRef.current).catch(() => {})
  }, [])

  const loadChat = useCallback(
    (chat: { sessionId: string; messages?: ChatMessage[]; totalUsage?: IUsage }) => {
      abortRef.current?.abort()
      sessionRef.current = chat.sessionId
      setSessionId(chat.sessionId)
      dispatch({ type: 'load', messages: chat.messages ?? [], totalUsage: chat.totalUsage })
    },
    [],
  )

  const approve = useCallback((id: string, opts?: ApproveOptions) => {
    const resolve = resolversRef.current.get(id)
    if (!resolve) return
    resolversRef.current.delete(id)
    resolve({ approved: true, remember: opts?.remember })
  }, [])

  const deny = useCallback((id: string, reason?: string) => {
    const resolve = resolversRef.current.get(id)
    if (!resolve) return
    resolversRef.current.delete(id)
    resolve({ approved: false, reason })
  }, [])

  const compact = useCallback(async (): Promise<CompactResult | undefined> => {
    const agent = agentRef.current
    if (!agent) return undefined
    const result = await agent.compact({ sessionId: sessionRef.current })
    if (result.compacted) {
      dispatch({
        type: 'event',
        event: {
          type: 'context.compacted',
          scope: 'history',
          beforeTokens: result.beforeTokens,
          afterTokens: result.afterTokens,
        },
        maxEvents: optionsRef.current.maxEvents,
        at: Date.now(),
      })
    }
    return result
  }, [])

  return {
    ...state,
    run,
    stop,
    reset,
    reload,
    agent: agentRef.current,
    isRunning: state.status === 'running',
    isReady: state.status === 'ready',
    pendingApprovals: state.approvals.filter((a) => a.status === 'pending'),
    approve,
    deny,
    approvalMode,
    setApprovalMode,
    compact,
    sessionId,
    loadChat,
  }
}
