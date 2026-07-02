import type { AgentEvent, IPlan, IPlanStep, IUsage, ReplanMode } from '@dudko.dev/agent-web'

/**
 * Lifecycle of the agent instance the hook owns.
 * - `idle`         — no config yet, nothing built.
 * - `initializing` — building the agent (dynamic provider imports, vault key
 *                    fetch, and — for WebLLM — weight download).
 * - `ready`        — the agent is built and can run.
 * - `running`      — a run is in flight.
 * - `error`        — the agent failed to build (a run error keeps it `ready`).
 */
export type AgentStatus = 'idle' | 'initializing' | 'ready' | 'running' | 'error'

/** One turn of the chat transcript that a chat UI renders. */
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** An assistant message that is still streaming (no final/stopped/error yet). */
  pending: boolean
}

/** A single tool call as it appears in a step, streamed then finalized. */
export interface ToolCallView {
  name: string
  input: unknown
  output?: unknown
  ok?: boolean
  status: 'calling' | 'done'
}

/** An execution step with its accumulated text and tool calls. */
export interface StepView {
  id: string
  index: number
  total: number
  step: IPlanStep
  /** Streamed executor text for this step (step.text-delta). */
  text: string
  toolCalls: ToolCallView[]
  status: 'running' | 'done'
  summary?: string
  blocked: boolean
}

/** WebLLM weight-download / engine-init progress (model.load events). */
export interface ModelLoadState {
  progress: number
  text: string
}

export interface ReplanState {
  mode: ReplanMode
  reason: string
}

/**
 * The whole UI-facing view of an agent run, rebuilt purely from the stream of
 * `AgentEvent`s by {@link agentStateReducer}. `status` is owned by the hook
 * (build/run lifecycle) and layered on top; everything else here is derived
 * only from events, so the reducer is deterministic and testable without React.
 */
export interface AgentUiState {
  status: AgentStatus
  /** The goal of the current / most recent run. */
  goal?: string
  /** The last plan the agent produced (created or revised). */
  plan?: IPlan
  /** Streamed planner "thinking" text (plan.thought-delta). */
  planThought: string
  /** Execution steps, in order, with their tool calls. */
  steps: StepView[]
  /** The final answer (streamed via final.text-delta, finalized on final). */
  finalText: string
  /** Running token total across the current run. */
  usage: IUsage
  /** WebLLM progress, present only while a local model is loading. */
  modelLoad?: ModelLoadState
  /** The most recent replan decision, if any. */
  replan?: ReplanState
  /** Error message from the last run error / build failure. */
  error?: string
  /** True when the last run was aborted via stop(). */
  stopped: boolean
  /** A chat-style transcript built from every run, for chat UIs. */
  messages: ChatMessage[]
  /** The raw event log (most recent last), capped by `maxEvents`. */
  events: AgentEvent[]
  /** Monotonic counter; mints stable message ids without Date/Math.random. */
  seq: number
}
