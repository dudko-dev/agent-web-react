import type { AgentEvent, IUsage } from '@dudko.dev/agent-web'
import type { AgentUiState, ChatMessage, StepView, ToolCallView } from './types.js'

/**
 * The reducer that turns the agent's `AgentEvent` stream into a renderable
 * {@link AgentUiState}. It is a pure function of (state, action) with no React,
 * no clock and no randomness (ids come from a monotonic `seq`), so it can be
 * unit-tested in isolation and reused to build a fully custom UI.
 */
export type AgentAction =
  /** Clear the whole conversation (transcript + current run), keeping status. */
  | { type: 'reset' }
  /** Set the lifecycle status (owned by the hook). */
  | { type: 'status'; status: AgentUiState['status']; error?: string }
  /** Fold one streamed agent event into the view. */
  | { type: 'event'; event: AgentEvent; maxEvents?: number }

const emptyUsage = (): IUsage => ({ inputTokens: 0, outputTokens: 0, totalTokens: 0 })

const addUsage = (a: IUsage, b: IUsage): IUsage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  totalTokens: a.totalTokens + b.totalTokens,
})

/** A fresh, empty view. */
export const createInitialAgentState = (): AgentUiState => ({
  status: 'idle',
  goal: undefined,
  plan: undefined,
  planThought: '',
  steps: [],
  finalText: '',
  usage: emptyUsage(),
  modelLoad: undefined,
  replan: undefined,
  error: undefined,
  stopped: false,
  messages: [],
  events: [],
  seq: 0,
})

/** Clear only the per-run view; keep the transcript, status and seq counter. */
const resetRun = (state: AgentUiState): AgentUiState => ({
  ...createInitialAgentState(),
  status: state.status,
  messages: state.messages,
  seq: state.seq,
})

/** Apply `fn` to the step whose id matches, leaving the rest untouched. */
const patchStep = (steps: StepView[], id: string, fn: (s: StepView) => StepView): StepView[] =>
  steps.map((s) => (s.id === id ? fn(s) : s))

/** Finalize the trailing pending assistant message with the given content. */
const finalizeAssistant = (messages: ChatMessage[], content: string): ChatMessage[] => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role === 'assistant' && m.pending) {
      const next = messages.slice()
      next[i] = { ...m, content: content || m.content, pending: false }
      return next
    }
  }
  return messages
}

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

const applyEvent = (state: AgentUiState, event: AgentEvent): AgentUiState => {
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
        messages: [
          ...base.messages,
          { id: userId, role: 'user', content: event.goal, pending: false },
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
        toolCalls: [],
        status: 'running',
        blocked: false,
      }
      return { ...state, steps: [...state.steps, view] }
    }

    case 'step.text-delta':
      return {
        ...state,
        steps: patchStep(state.steps, event.step.id, (s) => ({ ...s, text: s.text + event.delta })),
      }

    case 'step.tool-call': {
      const call: ToolCallView = { name: event.name, input: event.input, status: 'calling' }
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
                return { ...c, output: event.output, ok: event.ok, status: 'done' as const }
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
          // The result carries the authoritative, ordered tool-call list.
          toolCalls: event.result.toolCalls.map((c) => ({
            name: c.name,
            input: c.input,
            output: c.output,
            ok: c.ok,
            status: 'done' as const,
          })),
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
        messages: finalizeAssistant(state.messages, event.text),
      }

    case 'usage':
      return { ...state, usage: addUsage(state.usage, event.usage) }

    case 'stopped':
      return {
        ...state,
        stopped: true,
        messages: finalizeAssistant(state.messages, state.finalText || 'Stopped.'),
      }

    case 'error':
      // A per-step ('execute'/'plan'/...) error does not end the run — only a
      // top-level 'run' error does, and it arrives with no trailing `final`.
      return event.phase === 'run'
        ? {
            ...state,
            error: event.error,
            messages: finalizeAssistant(state.messages, state.finalText || `Error: ${event.error}`),
          }
        : { ...state, error: event.error }

    case 'retry':
      return state

    default:
      return state
  }
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
      const next = applyEvent(state, action.event)
      const cap = action.maxEvents ?? 200
      const events =
        cap > 0 ? [...state.events, action.event].slice(-cap) : [...state.events, action.event]
      return { ...next, events }
    }
    default:
      return state
  }
}
