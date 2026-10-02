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
  assert.deepEqual(s.usage, {
    inputTokens: 12,
    outputTokens: 8,
    totalTokens: 20,
    reasoningTokens: 0,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
  })

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

test('thoughts stream into their step and the answer; usage keeps thinking and cache tokens', () => {
  let s = event(createInitialAgentState(), { type: 'run.start', goal: 'x' })
  s = event(s, { type: 'step.start', step, index: 1, total: 1 })
  s = event(s, { type: 'step.reasoning-delta', step, delta: 'hmm, ' })
  s = event(s, { type: 'step.reasoning-delta', step, delta: 'notes' })
  s = event(s, { type: 'final.reasoning-delta', delta: 'summing up' })
  s = event(s, {
    type: 'usage',
    phase: 'execute',
    usage: {
      inputTokens: 10,
      outputTokens: 6,
      totalTokens: 16,
      reasoningTokens: 4,
      cachedInputTokens: 7,
    },
  })
  assert.equal(s.steps[0].reasoning, 'hmm, notes')
  assert.equal(s.finalReasoning, 'summing up')
  assert.equal(s.usage.reasoningTokens, 4)
  assert.equal(s.usage.cachedInputTokens, 7)
})

test('consent requests are tracked until resolved; policy denials are recorded too', () => {
  let s = event(createInitialAgentState(), { type: 'run.start', goal: 'x' })
  s = event(s, { type: 'step.start', step, index: 1, total: 1 })
  s = event(s, {
    type: 'tool.approval-requested',
    id: 'a1',
    name: 'add_note',
    input: { text: 'hi' },
    readOnly: false,
    step,
  })
  assert.equal(s.approvals.length, 1)
  assert.equal(s.approvals[0].status, 'pending')
  assert.equal(s.approvals[0].stepId, 's1')
  s = event(s, {
    type: 'tool.approval-resolved',
    id: 'a1',
    name: 'add_note',
    approved: true,
    automatic: false,
  })
  assert.equal(s.approvals[0].status, 'approved')
  // A read-only-mode refusal arrives without a request.
  s = event(s, {
    type: 'tool.approval-resolved',
    id: 'a2',
    name: 'delete_all',
    approved: false,
    reason: 'the agent is in read-only mode',
    automatic: true,
  })
  assert.deepEqual(
    s.approvals.map((a) => [a.id, a.status, a.automatic]),
    [
      ['a1', 'approved', false],
      ['a2', 'denied', true],
    ],
  )
  assert.equal(s.approvals[1].stepId, 's1')
})

test('stopping a run denies whatever was still waiting for consent', () => {
  let s = event(createInitialAgentState(), { type: 'run.start', goal: 'x' })
  s = event(s, { type: 'tool.approval-requested', id: 'a1', name: 't', input: {}, readOnly: false })
  s = event(s, { type: 'stopped' })
  assert.equal(s.approvals[0].status, 'denied')
})

test('subagents are folded from their own nested events', () => {
  let s = event(createInitialAgentState(), { type: 'run.start', goal: 'x' })
  s = event(s, { type: 'step.start', step, index: 1, total: 1 })
  s = event(s, { type: 'subagent.start', id: 'sa1', name: 'analyst', task: 'look at e4' })
  const inner = { id: 'c1', description: 'Search' }
  s = event(s, {
    type: 'subagent.event',
    id: 'sa1',
    name: 'analyst',
    event: { type: 'step.start', step: inner, index: 1, total: 2 },
  })
  s = event(s, {
    type: 'subagent.event',
    id: 'sa1',
    name: 'analyst',
    event: { type: 'step.tool-call', step: inner, name: 'engine', input: {} },
  })
  assert.equal(s.subagents[0].stepId, 's1')
  assert.equal(s.subagents[0].steps, 1)
  assert.equal(s.subagents[0].toolCalls, 1)
  assert.equal(s.subagents[0].activity, '→ engine')
  s = event(s, {
    type: 'subagent.complete',
    id: 'sa1',
    name: 'analyst',
    text: 'e4 is best',
    usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
  })
  assert.equal(s.subagents[0].status, 'done')
  assert.equal(s.subagents[0].text, 'e4 is best')
  s = event(s, { type: 'subagent.start', id: 'sa2', name: 'analyst', task: 'd4' })
  s = event(s, { type: 'subagent.error', id: 'sa2', name: 'analyst', error: 'timed out' })
  assert.equal(s.subagents[1].status, 'error')
  assert.equal(s.subagents[1].error, 'timed out')
})

test('skills, discovered tools, compactions and budget stops are recorded per run', () => {
  let s = event(createInitialAgentState(), { type: 'run.start', goal: 'x' })
  s = event(s, { type: 'skill.activated', name: 'tone', by: 'plan' })
  s = event(s, { type: 'skill.activated', name: 'tone', by: 'tool' })
  s = event(s, { type: 'tools.discovered', query: 'q', names: ['a__b', 'a__c'] })
  s = event(s, { type: 'tools.discovered', query: 'q2', names: ['a__c', 'a__d'] })
  s = event(s, { type: 'context.compacted', scope: 'trace', beforeTokens: 900, afterTokens: 200 })
  s = event(s, { type: 'budget.exceeded', kind: 'total', tokens: 1200, cap: 1000 })
  assert.deepEqual(s.skills, ['tone'])
  assert.deepEqual(s.discoveredTools, ['a__b', 'a__c', 'a__d'])
  assert.deepEqual(s.compactions, [{ scope: 'trace', beforeTokens: 900, afterTokens: 200 }])
  assert.deepEqual(s.budget, { kind: 'total', tokens: 1200, cap: 1000 })
  // A new run starts clean.
  s = event(s, { type: 'run.start', goal: 'y' })
  assert.deepEqual(s.skills, [])
  assert.equal(s.budget, undefined)
})
