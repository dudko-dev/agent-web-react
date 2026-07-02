import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AgentEvent } from '@dudko.dev/agent-web'
import {
  agentStateReducer,
  createInitialAgentState,
  type AgentAction,
  type AgentUiState,
} from '../dist/index.js'

const event = (state: AgentUiState, e: AgentEvent, maxEvents?: number): AgentUiState =>
  agentStateReducer(state, { type: 'event', event: e, maxEvents } as AgentAction)

const step = { id: 's1', description: 'Add a note' }

test('run.start opens a user turn and a pending assistant turn', () => {
  const s = event(createInitialAgentState(), { type: 'run.start', goal: 'hello' })
  assert.equal(s.goal, 'hello')
  assert.equal(s.messages.length, 2)
  assert.deepEqual(
    s.messages.map((m) => [m.role, m.content, m.pending]),
    [
      ['user', 'hello', false],
      ['assistant', '', true],
    ],
  )
})

test('a full run folds into plan, steps, tool calls, usage and a final answer', () => {
  let s = createInitialAgentState()
  s = event(s, { type: 'run.start', goal: 'add a note' })
  s = event(s, { type: 'plan.created', plan: { thought: 'I will add it', steps: [step] } })
  assert.equal(s.plan?.steps.length, 1)
  assert.equal(s.planThought, 'I will add it')

  s = event(s, { type: 'step.start', step, index: 1, total: 1 })
  assert.equal(s.steps.length, 1)
  assert.equal(s.steps[0].status, 'running')

  s = event(s, { type: 'step.tool-call', step, name: 'add_note', input: { text: 'hi' } })
  assert.equal(s.steps[0].toolCalls[0].status, 'calling')

  s = event(s, { type: 'step.tool-result', step, name: 'add_note', output: { id: 1 }, ok: true })
  assert.equal(s.steps[0].toolCalls[0].status, 'done')
  assert.equal(s.steps[0].toolCalls[0].ok, true)

  s = event(s, {
    type: 'step.complete',
    step,
    result: {
      step,
      summary: 'added',
      blocked: false,
      toolCalls: [{ name: 'add_note', input: { text: 'hi' }, output: { id: 1 }, ok: true }],
    },
  })
  assert.equal(s.steps[0].status, 'done')
  assert.equal(s.steps[0].toolCalls.length, 1)

  s = event(s, {
    type: 'usage',
    phase: 'execute',
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
  })
  s = event(s, {
    type: 'usage',
    phase: 'synthesize',
    usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
  })
  assert.deepEqual(s.usage, { inputTokens: 12, outputTokens: 8, totalTokens: 20 })

  s = event(s, { type: 'final.text-delta', delta: 'Done' })
  s = event(s, { type: 'final.text-delta', delta: '!' })
  assert.equal(s.messages.at(-1)?.content, 'Done!')
  assert.equal(s.messages.at(-1)?.pending, true)

  s = event(s, { type: 'final', text: 'Done! Added one note.' })
  assert.equal(s.finalText, 'Done! Added one note.')
  assert.equal(s.messages.at(-1)?.content, 'Done! Added one note.')
  assert.equal(s.messages.at(-1)?.pending, false)
})

test('greeting path: an immediate final finalizes the assistant turn', () => {
  let s = event(createInitialAgentState(), { type: 'run.start', goal: 'hi there' })
  s = event(s, { type: 'final', text: 'Hello! What would you like to do?' })
  assert.equal(s.steps.length, 0)
  assert.equal(s.messages.at(-1)?.content, 'Hello! What would you like to do?')
  assert.equal(s.messages.at(-1)?.pending, false)
})

test('stop finalizes the pending turn without an error', () => {
  let s = event(createInitialAgentState(), { type: 'run.start', goal: 'do a thing' })
  s = event(s, { type: 'stopped' })
  assert.equal(s.stopped, true)
  assert.equal(s.messages.at(-1)?.pending, false)
  assert.equal(s.messages.at(-1)?.content, 'Stopped.')
})

test('a top-level run error finalizes the turn; a step error does not', () => {
  let s = event(createInitialAgentState(), { type: 'run.start', goal: 'x' })
  // A step-level error is recorded but keeps the assistant turn pending.
  s = event(s, { type: 'error', phase: 'execute', error: 'tool blew up' })
  assert.equal(s.error, 'tool blew up')
  assert.equal(s.messages.at(-1)?.pending, true)
  // A run-level error is terminal.
  s = event(s, { type: 'error', phase: 'run', error: 'model unreachable' })
  assert.equal(s.messages.at(-1)?.pending, false)
  assert.match(s.messages.at(-1)!.content, /model unreachable/)
})

test('a second run keeps the transcript but clears the per-run view', () => {
  let s = createInitialAgentState()
  s = event(s, { type: 'run.start', goal: 'first' })
  s = event(s, { type: 'step.start', step, index: 1, total: 1 })
  s = event(s, { type: 'final', text: 'first done' })
  s = event(s, { type: 'run.start', goal: 'second' })
  assert.equal(s.steps.length, 0) // cleared
  assert.equal(s.plan, undefined)
  assert.equal(s.messages.length, 4) // first pair + second pair
  assert.equal(s.goal, 'second')
})

test('the raw event log is capped by maxEvents', () => {
  let s = createInitialAgentState()
  for (let i = 0; i < 10; i++) {
    s = event(s, { type: 'model.load', progress: i / 10, text: `step ${i}` }, 3)
  }
  assert.equal(s.events.length, 3)
  assert.equal((s.events.at(-1) as { text: string }).text, 'step 9')
})

test('reset clears the run and the transcript but preserves status', () => {
  let s = createInitialAgentState()
  s = agentStateReducer(s, { type: 'status', status: 'ready' })
  s = event(s, { type: 'run.start', goal: 'x' })
  s = agentStateReducer(s, { type: 'reset' })
  assert.equal(s.messages.length, 0)
  assert.equal(s.status, 'ready')
})
