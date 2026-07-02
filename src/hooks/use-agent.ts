import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { DependencyList } from 'react'
import {
  createAgent,
  type Agent,
  type AgentEventHandler,
  type BrowserAgentConfig,
  type RunResult,
} from '@dudko.dev/agent-web'
import { agentStateReducer, createInitialAgentState } from '../state.js'
import type { AgentUiState } from '../types.js'
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
}

export interface UseAgentReturn extends AgentUiState {
  /** Run a goal. Resolves with the RunResult, or `undefined` if it couldn't start. */
  run: (goal: string) => Promise<RunResult | undefined>
  /** Abort the in-flight run (observed between phases and mid-stream). */
  stop: () => void
  /** Clear the whole conversation — transcript and current run. */
  reset: () => void
  /** Rebuild the agent now (e.g. after the user stores a new API key). */
  reload: () => void
  /** The built agent, once ready. */
  agent: Agent | undefined
  isRunning: boolean
  isReady: boolean
}

/**
 * The primary React binding for `@dudko.dev/agent-web`. Builds the agent from a
 * {@link BrowserAgentConfig}, streams its typed events into a renderable
 * {@link AgentUiState} (plan, steps, tool calls, streamed final answer, token
 * usage, model-load progress and a chat transcript), and exposes `run` / `stop`
 * / `reset` / `reload`.
 *
 * ```tsx
 * const agent = useAgent({
 *   model: { providerType: 'openai', model: 'gpt-4o-mini', credentialRef: 'openai' },
 *   credentials,
 *   tools,
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
    let cancelled = false
    dispatch({ type: 'status', status: 'initializing' })
    createAgent(cfg)
      .then((agent) => {
        if (cancelled) return
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

  // Abort any in-flight run when the component unmounts.
  useEffect(() => () => abortRef.current?.abort(), [])

  const run = useCallback(async (goal: string): Promise<RunResult | undefined> => {
    const agent = agentRef.current
    if (!agent || abortRef.current) return undefined // not ready, or already running
    const controller = new AbortController()
    abortRef.current = controller
    dispatch({ type: 'status', status: 'running' })
    try {
      return await agent.run(goal, {
        signal: controller.signal,
        onEvent: (event) => {
          dispatch({ type: 'event', event, maxEvents: optionsRef.current.maxEvents })
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
      dispatch({ type: 'status', status: 'ready' })
    }
  }, [])

  const stop = useCallback(() => abortRef.current?.abort(), [])
  const reset = useCallback(() => dispatch({ type: 'reset' }), [])

  return {
    ...state,
    run,
    stop,
    reset,
    reload,
    agent: agentRef.current,
    isRunning: state.status === 'running',
    isReady: state.status === 'ready',
  }
}
