import type { AgentEvent, IPlan, IPlanStep, IUsage, ReplanMode } from '@dudko.dev/agent-web'

/** Why a run stopped early (a `budget.exceeded` event). */
export interface BudgetView {
  kind: 'input' | 'output' | 'reasoning' | 'total' | 'tool-calls'
  tokens: number
  cap: number
}

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

/** A file or image shown with a message (and, for images, sent to the model). */
export interface ChatAttachment {
  name: string
  mediaType: string
  /** A data URL (images: thumbnail + full view) — kept so a saved chat can show it again. */
  dataUrl?: string
  /** Where it was stored in the virtual file system, if it was. */
  path?: string
  size?: number
}

/** One turn of the chat transcript that a chat UI renders. */
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** An assistant message that is still streaming (no final/stopped/error yet). */
  pending: boolean
  /** User turn: what was attached (images, files). */
  attachments?: ChatAttachment[]
  /** Assistant turn: the run's steps — tool calls, thoughts, subagents — as they happened. */
  steps?: StepView[]
  /** Assistant turn: consent decisions of the run. */
  approvals?: ApprovalView[]
  /** Assistant turn: subagent delegations of the run. */
  subagents?: SubagentView[]
  /** Assistant turn: the synthesizer's thoughts. */
  reasoning?: string
  /** Assistant turn: tokens the run spent, by kind. */
  usage?: IUsage
  /** Assistant turn: wall-clock duration of the run (needs timestamps from the hook). */
  durationMs?: number
  /** Assistant turn: skills the run used. */
  skills?: string[]
  /** Assistant turn ended with an error. */
  error?: boolean
}

/** A single tool call as it appears in a step, streamed then finalized. */
export interface ToolCallView {
  name: string
  input: unknown
  output?: unknown
  ok?: boolean
  status: 'calling' | 'done'
  /** When the call started (ms epoch; set when the hook stamps events). */
  startedAt?: number
  /** How long the call took. */
  durationMs?: number
  /** ≈ tokens of the arguments the model wrote (chars / 4). */
  inputTokens?: number
  /** ≈ tokens of the result fed back to the model (chars / 4). */
  outputTokens?: number
}

/** A tool call waiting for (or decided by) the user's consent. */
export interface ApprovalView {
  id: string
  name: string
  input: unknown
  readOnly: boolean
  /** The step the call belongs to, when known. */
  stepId?: string
  status: 'pending' | 'approved' | 'denied'
  reason?: string
  /** Decided by policy (rule / read-only mode), not by a person. */
  automatic?: boolean
}

/** A delegated task running in a subagent (in-process or a Web Worker). */
export interface SubagentView {
  id: string
  name: string
  task: string
  status: 'running' | 'done' | 'error'
  /** The step that delegated it, when known. */
  stepId?: string
  /** What the child is doing right now ("step 2: …", "→ tool"). */
  activity: string
  /** Steps the child started. */
  steps: number
  /** Tool calls the child made. */
  toolCalls: number
  /** The child's answer (streamed, then final). */
  text: string
  usage: IUsage
  error?: string
}

/** One compaction of the context (a `context.compacted` event). */
export interface CompactionView {
  scope: 'history' | 'trace' | 'tool-results'
  beforeTokens: number
  afterTokens: number
}

/** An execution step with its accumulated text and tool calls. */
export interface StepView {
  id: string
  index: number
  total: number
  step: IPlanStep
  /** Streamed executor text for this step (step.text-delta). */
  text: string
  /** Streamed executor thoughts for this step (step.reasoning-delta). */
  reasoning: string
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
  /** The synthesizer's streamed thoughts (final.reasoning-delta). */
  finalReasoning: string
  /** Tool calls that asked for consent in this run, pending first-come. */
  approvals: ApprovalView[]
  /** Subagent delegations of this run. */
  subagents: SubagentView[]
  /** Skills activated in this run. */
  skills: string[]
  /** Tools activated by find_tools in this run. */
  discoveredTools: string[]
  /** Compactions in this run. */
  compactions: CompactionView[]
  /** Set when a run-level limit stopped the run early. */
  budget?: BudgetView
  /** Running token total across the current run. */
  usage: IUsage
  /** Token total across the whole conversation (every run since the last reset). */
  totalUsage: IUsage
  /** When the current run started (ms epoch; set when the hook stamps events). */
  runStartedAt?: number
  /** The id of the assistant message the current run streams into. */
  runMessageId?: string
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
