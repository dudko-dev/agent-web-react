import type { AgentEvent, IUsage } from '@dudko.dev/agent-web'
import type {
  AgentUiState,
  ApprovalView,
  ChatAttachment,
  ChatMessage,
  StepView,
  SubagentView,
  ToolCallView,
} from './types.js'

/**
 * The reducer that turns the agent's `AgentEvent` stream into a renderable
 * {@link AgentUiState}. It is a pure function of (state, action) with no React,
 * no clock and no randomness (ids come from a monotonic `seq`; times come in on
 * the action as `at`), so it can be unit-tested in isolation and reused to
 * build a fully custom UI.
 */
export type AgentAction =
  /** Clear the whole conversation (transcript + current run), keeping status. */
  | { type: 'reset' }
  /** Set the lifecycle status (owned by the hook). */
  | { type: 'status'; status: AgentUiState['status']; error?: string }
  /**
   * Fold one streamed agent event into the view. `at` (ms epoch, from the
   * hook) times runs and tool calls; `attachments` decorate the user turn a
   * `run.start` opens.
   */
  | {
      type: 'event'
      event: AgentEvent
      maxEvents?: number
      at?: number
      attachments?: ChatAttachment[]
    }
  /** Replace the transcript with a saved conversation (chat history). */
  | { type: 'load'; messages: ChatMessage[]; totalUsage?: IUsage }

interface EventContext {
  at?: number
  attachments?: ChatAttachment[]
}

/** ≈ tokens of a value as the model sees it (chars / 4). */
const approxTokens = (value: unknown): number => {
  if (value === undefined) return 0
  let text: string
  try {
    text = typeof value === 'string' ? value : (JSON.stringify(value) ?? '')
  } catch {
    text = String(value)
  }
  return Math.ceil(text.length / 4)
}

const emptyUsage = (): IUsage => ({
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  reasoningTokens: 0,
  cachedInputTokens: 0,
  cacheWriteTokens: 0,
})

const addUsage = (a: IUsage, b: IUsage): IUsage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  totalTokens: a.totalTokens + b.totalTokens,
  reasoningTokens: (a.reasoningTokens ?? 0) + (b.reasoningTokens ?? 0),
  cachedInputTokens: (a.cachedInputTokens ?? 0) + (b.cachedInputTokens ?? 0),
  cacheWriteTokens: (a.cacheWriteTokens ?? 0) + (b.cacheWriteTokens ?? 0),
})

/** A fresh, empty view. */
export const createInitialAgentState = (): AgentUiState => ({
  status: 'idle',
  goal: undefined,
  plan: undefined,
  planThought: '',
  steps: [],
  finalText: '',
  finalReasoning: '',
  totalUsage: emptyUsage(),
  runStartedAt: undefined,
  runMessageId: undefined,
  approvals: [],
  subagents: [],
  skills: [],
  discoveredTools: [],
  compactions: [],
  budget: undefined,
  usage: emptyUsage(),
  modelLoad: undefined,
  replan: undefined,
  error: undefined,
  stopped: false,
  messages: [],
  events: [],
  seq: 0,
})

/** Clear only the per-run view; keep the transcript, totals, status and seq counter. */
const resetRun = (state: AgentUiState): AgentUiState => ({
  ...createInitialAgentState(),
  status: state.status,
  messages: state.messages,
  totalUsage: state.totalUsage,
  seq: state.seq,
})

/** Apply `fn` to the step whose id matches, leaving the rest untouched. */
const patchStep = (steps: StepView[], id: string, fn: (s: StepView) => StepView): StepView[] =>
  steps.map((s) => (s.id === id ? fn(s) : s))

const patchApproval = (
  approvals: ApprovalView[],
  id: string,
  fn: (a: ApprovalView) => ApprovalView,
): ApprovalView[] => approvals.map((a) => (a.id === id ? fn(a) : a))

const patchSubagent = (
  subagents: SubagentView[],
  id: string,
  fn: (s: SubagentView) => SubagentView,
): SubagentView[] => subagents.map((s) => (s.id === id ? fn(s) : s))

/** The step currently executing (the last one still running). */
const runningStepId = (steps: StepView[]): string | undefined =>
  [...steps].reverse().find((s) => s.status === 'running')?.id

/** Fold one of a subagent's own events into its compact view. */
const applySubagentEvent = (view: SubagentView, event: AgentEvent): SubagentView => {
  switch (event.type) {
    case 'step.start':
      return {
        ...view,
        steps: view.steps + 1,
        activity: `step ${event.index}/${event.total}: ${event.step.description}`,
      }
    case 'step.tool-call':
      return { ...view, toolCalls: view.toolCalls + 1, activity: `→ ${event.name}` }
    case 'final.text-delta':
      return { ...view, text: view.text + event.delta, activity: 'writing the answer' }
    case 'final':
      return { ...view, text: event.text }
    case 'usage':
      return { ...view, usage: addUsage(view.usage, event.usage) }
    default:
      return view
  }
}

/** Finalize the trailing pending assistant message with the given content. */
const finalizeAssistant = (
  messages: ChatMessage[],
  content: string,
  extra: Partial<ChatMessage> = {},
): ChatMessage[] => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role === 'assistant' && m.pending) {
      const next = messages.slice()
      next[i] = { ...m, content: content || m.content, pending: false, ...extra }
      return next
    }
  }
  return messages
}

/** Duration of the current run at `at`, when both ends are known. */
const runDuration = (state: AgentUiState, at?: number): Partial<ChatMessage> =>
  at !== undefined && state.runStartedAt !== undefined
    ? { durationMs: Math.max(0, at - state.runStartedAt) }
    : {}

/** Update the trailing pending assistant message's streaming content. */
const streamAssistant = (messages: ChatMessage[], content: string): ChatMessage[] => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role === 'assistant' && m.pending) {
      const next = messages.slice()
      next[i] = { ...m, content }
      return next
    }
  }
  return messages
}

const applyEvent = (state: AgentUiState, event: AgentEvent, ctx: EventContext): AgentUiState => {
  switch (event.type) {
    case 'run.start': {
      // Start a new run: clear the previous run's view but keep the transcript,
      // then push the user turn and a pending assistant turn to stream into.
      const base = resetRun(state)
      const userId = `msg-${base.seq}`
      const assistantId = `msg-${base.seq + 1}`
      return {
        ...base,
        goal: event.goal,
        runStartedAt: ctx.at,
        runMessageId: assistantId,
        messages: [
          ...base.messages,
          {
            id: userId,
            role: 'user',
            content: event.goal,
            pending: false,
            ...(ctx.attachments?.length ? { attachments: ctx.attachments } : {}),
          },
          { id: assistantId, role: 'assistant', content: '', pending: true },
        ],
        seq: base.seq + 2,
      }
    }

    case 'model.load':
      return { ...state, modelLoad: { progress: event.progress, text: event.text } }

    case 'plan.thought-delta':
      return { ...state, planThought: state.planThought + event.delta }

    case 'plan.created':
      return {
        ...state,
        plan: event.plan,
        planThought: state.planThought || event.plan.thought,
      }

    case 'plan.revised':
      return { ...state, plan: event.plan, replan: { mode: 'revise', reason: event.reason } }

    case 'plan.step-added':
      // Execution is tracked from step.* events; the plan itself already
      // arrived via plan.created. Nothing to fold here.
      return state

    case 'step.start': {
      const view: StepView = {
        id: event.step.id,
        index: event.index,
        total: event.total,
        step: event.step,
        text: '',
        reasoning: '',
        toolCalls: [],
        status: 'running',
        blocked: false,
      }
      return { ...state, steps: [...state.steps, view] }
    }

    case 'step.reasoning-delta':
      return {
        ...state,
        steps: patchStep(state.steps, event.step.id, (s) => ({
          ...s,
          reasoning: s.reasoning + event.delta,
        })),
      }

    case 'step.text-delta':
      return {
        ...state,
        steps: patchStep(state.steps, event.step.id, (s) => ({ ...s, text: s.text + event.delta })),
      }

    case 'step.tool-call': {
      const call: ToolCallView = {
        name: event.name,
        input: event.input,
        status: 'calling',
        inputTokens: approxTokens(event.input),
        ...(ctx.at !== undefined ? { startedAt: ctx.at } : {}),
      }
      return {
        ...state,
        steps: patchStep(state.steps, event.step.id, (s) => ({
          ...s,
          toolCalls: [...s.toolCalls, call],
        })),
      }
    }

    case 'step.tool-result':
      return {
        ...state,
        steps: patchStep(state.steps, event.step.id, (s) => {
          // Match the last still-calling entry for this tool name.
          let done = false
          const toolCalls = s.toolCalls
            .slice()
            .reverse()
            .map((c) => {
              if (!done && c.status === 'calling' && c.name === event.name) {
                done = true
                return {
                  ...c,
                  output: event.output,
                  ok: event.ok,
                  status: 'done' as const,
                  outputTokens: approxTokens(event.output),
                  ...(ctx.at !== undefined && c.startedAt !== undefined
                    ? { durationMs: Math.max(0, ctx.at - c.startedAt) }
                    : {}),
                }
              }
              return c
            })
            .reverse()
          return { ...s, toolCalls }
        }),
      }

    case 'step.complete':
      return {
        ...state,
        steps: patchStep(state.steps, event.step.id, (s) => ({
          ...s,
          status: 'done',
          summary: event.result.summary,
          blocked: event.result.blocked,
          // The result carries the authoritative, ordered tool-call list; keep
          // the timing the streamed calls measured (matched in order per name).
          toolCalls: (() => {
            const seen = new Map<string, number>()
            return event.result.toolCalls.map((c) => {
              const nth = seen.get(c.name) ?? 0
              seen.set(c.name, nth + 1)
              const streamed = s.toolCalls.filter((t) => t.name === c.name)[nth]
              return {
                name: c.name,
                input: c.input,
                output: c.output,
                ok: c.ok,
                status: 'done' as const,
                inputTokens: approxTokens(c.input),
                outputTokens: approxTokens(c.output),
                ...(streamed?.startedAt !== undefined ? { startedAt: streamed.startedAt } : {}),
                ...(streamed?.durationMs !== undefined ? { durationMs: streamed.durationMs } : {}),
              }
            })
          })(),
        })),
      }

    case 'replan.decision':
      return { ...state, replan: { mode: event.mode, reason: event.reason } }

    case 'final.text-delta': {
      const finalText = state.finalText + event.delta
      return { ...state, finalText, messages: streamAssistant(state.messages, finalText) }
    }

    case 'final':
      return {
        ...state,
        finalText: event.text,
        messages: finalizeAssistant(state.messages, event.text, runDuration(state, ctx.at)),
      }

    case 'final.reasoning-delta':
      return { ...state, finalReasoning: state.finalReasoning + event.delta }

    case 'usage':
      return {
        ...state,
        usage: addUsage(state.usage, event.usage),
        totalUsage: addUsage(state.totalUsage, event.usage),
      }

    case 'tool.approval-requested':
      return {
        ...state,
        approvals: [
          ...state.approvals,
          {
            id: event.id,
            name: event.name,
            input: event.input,
            readOnly: event.readOnly,
            stepId: event.step?.id,
            status: 'pending',
          },
        ],
      }

    case 'tool.approval-resolved': {
      const known = state.approvals.some((a) => a.id === event.id)
      const decided = (a: ApprovalView): ApprovalView => ({
        ...a,
        status: event.approved ? 'approved' : 'denied',
        reason: event.reason,
        automatic: event.automatic,
      })
      return {
        ...state,
        approvals: known
          ? patchApproval(state.approvals, event.id, decided)
          : // A policy denial arrives without a request: record it too.
            [
              ...state.approvals,
              decided({
                id: event.id,
                name: event.name,
                input: undefined,
                readOnly: false,
                stepId: runningStepId(state.steps),
                status: 'pending',
              }),
            ],
      }
    }

    case 'subagent.start':
      return {
        ...state,
        subagents: [
          ...state.subagents,
          {
            id: event.id,
            name: event.name,
            task: event.task,
            status: 'running',
            stepId: runningStepId(state.steps),
            activity: 'starting',
            steps: 0,
            toolCalls: 0,
            text: '',
            usage: emptyUsage(),
          },
        ],
      }

    case 'subagent.event':
      return {
        ...state,
        subagents: patchSubagent(state.subagents, event.id, (s) =>
          applySubagentEvent(s, event.event),
        ),
      }

    case 'subagent.complete':
      return {
        ...state,
        subagents: patchSubagent(state.subagents, event.id, (s) => ({
          ...s,
          status: 'done',
          activity: 'done',
          text: event.text,
          usage: event.usage,
        })),
      }

    case 'subagent.error':
      return {
        ...state,
        subagents: patchSubagent(state.subagents, event.id, (s) => ({
          ...s,
          status: 'error',
          activity: 'failed',
          error: event.error,
        })),
      }

    case 'skill.activated':
      return state.skills.includes(event.name)
        ? state
        : { ...state, skills: [...state.skills, event.name] }

    case 'tools.discovered':
      return {
        ...state,
        discoveredTools: [...new Set([...state.discoveredTools, ...event.names])],
      }

    case 'context.compacted':
      return {
        ...state,
        compactions: [
          ...state.compactions,
          { scope: event.scope, beforeTokens: event.beforeTokens, afterTokens: event.afterTokens },
        ],
      }

    case 'budget.exceeded':
      return { ...state, budget: { kind: event.kind, tokens: event.tokens, cap: event.cap } }

    case 'stopped':
      return {
        ...state,
        stopped: true,
        // Nothing is waiting any more once the run has stopped.
        approvals: state.approvals.map((a) =>
          a.status === 'pending' ? { ...a, status: 'denied' as const, reason: 'stopped' } : a,
        ),
        messages: finalizeAssistant(
          state.messages,
          state.finalText || 'Stopped.',
          runDuration(state, ctx.at),
        ),
      }

    case 'error':
      // A per-step ('execute'/'plan'/...) error does not end the run — only a
      // top-level 'run' error does, and it arrives with no trailing `final`.
      return event.phase === 'run'
        ? {
            ...state,
            error: event.error,
            messages: finalizeAssistant(
              state.messages,
              state.finalText || `Error: ${event.error}`,
              { ...runDuration(state, ctx.at), error: true },
            ),
          }
        : { ...state, error: event.error }

    case 'retry':
      return state

    default:
      return state
  }
}

/**
 * Mirror the current run's activity onto its assistant message, so every turn
 * of the transcript keeps its own tool calls, thoughts, subagents and usage
 * after the next run starts. Only copies what changed (cheap on every event).
 */
const syncRunMessage = (state: AgentUiState): AgentUiState => {
  const id = state.runMessageId
  if (!id) return state
  const i = state.messages.findIndex((m) => m.id === id)
  if (i < 0) return state
  const m = state.messages[i]
  const decided = state.approvals.filter((a) => a.status !== 'pending')
  const patch: Partial<ChatMessage> = {}
  if (m.steps !== state.steps) patch.steps = state.steps
  if (m.subagents !== state.subagents) patch.subagents = state.subagents
  if (m.usage !== state.usage) patch.usage = state.usage
  if ((m.reasoning ?? '') !== state.finalReasoning) patch.reasoning = state.finalReasoning
  if (m.skills !== state.skills) patch.skills = state.skills
  if (
    (m.approvals?.length ?? 0) !== decided.length ||
    decided.some((a, k) => m.approvals?.[k] !== a)
  ) {
    patch.approvals = decided
  }
  if (Object.keys(patch).length === 0) return state
  const messages = state.messages.slice()
  messages[i] = { ...m, ...patch }
  return { ...state, messages }
}

export const agentStateReducer = (state: AgentUiState, action: AgentAction): AgentUiState => {
  switch (action.type) {
    case 'reset':
      // A full "new conversation" clear — unlike run.start, this also drops the
      // transcript. Keep status (the agent is still built) and the seq counter
      // (so ids stay unique across resets).
      return { ...createInitialAgentState(), status: state.status, seq: state.seq }
    case 'status':
      return {
        ...state,
        status: action.status,
        error: action.status === 'error' ? action.error : undefined,
      }
    case 'event': {
      const next = syncRunMessage(
        applyEvent(state, action.event, { at: action.at, attachments: action.attachments }),
      )
      const cap = action.maxEvents ?? 200
      const events =
        cap > 0 ? [...state.events, action.event].slice(-cap) : [...state.events, action.event]
      return { ...next, events }
    }
    case 'load': {
      // Ids of the loaded messages must not collide with ones minted later.
      const maxSeq = action.messages.reduce((n, m) => {
        const k = Number(/^msg-(\d+)$/.exec(m.id)?.[1] ?? -1)
        return Math.max(n, k + 1)
      }, state.seq)
      return {
        ...createInitialAgentState(),
        status: state.status,
        messages: action.messages.map((m) => (m.pending ? { ...m, pending: false } : m)),
        totalUsage: action.totalUsage ?? emptyUsage(),
        seq: maxSeq,
      }
    }
    default:
      return state
  }
}
