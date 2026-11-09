import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AgentEvent } from '@dudko.dev/agent-web'
import {
  agentStateReducer,
  createInitialAgentState,
  lessonsOf,
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

// ── steering a run that is going ─────────────────────────────────────────────

const stepA = { id: 'a', description: 'Fetch it' }
const stepB = { id: 'b', description: 'Report it' }
const startedRun = (): AgentUiState => {
  let s = createInitialAgentState()
  s = event(s, { type: 'run.start', goal: 'go' })
  s = event(s, { type: 'plan.created', plan: { thought: '', steps: [stepA, stepB] } })
  return event(s, { type: 'step.start', step: stepA, index: 1, total: 2 })
}
const completeStep = (s: AgentUiState, st: typeof stepA): AgentUiState =>
  event(s, {
    type: 'step.complete',
    step: st,
    result: { step: st, summary: 'ok', blocked: false, toolCalls: [] },
  })

test('a message sent mid-run waits in the queue until the agent has shown it to the model', () => {
  let s = startedRun()
  s = event(s, { type: 'message.queued', id: 'msg-1', text: 'use the staging database' })
  assert.deepEqual(s.queued, [{ id: 'msg-1', text: 'use the staging database' }])
  assert.deepEqual(s.notes, [], 'not a note yet: the model has not seen it')
  // A repeated announcement is not a second message.
  s = event(s, { type: 'message.queued', id: 'msg-1', text: 'use the staging database' })
  assert.equal(s.queued.length, 1)

  s = event(s, {
    type: 'message.delivered',
    id: 'msg-1',
    text: 'use the staging database',
    at: 'round',
  })
  assert.deepEqual(s.queued, [])
  assert.deepEqual(s.notes, [
    { id: 'msg-1', text: 'use the staging database', at: 'round', stepId: 'a' },
  ])
})

test('a note is anchored where it landed: the running step, the step just ended, or the end', () => {
  let s = startedRun()
  s = event(s, { type: 'message.queued', id: 'm1', text: 'between tool calls' })
  s = event(s, { type: 'message.delivered', id: 'm1', text: 'between tool calls', at: 'round' })
  s = completeStep(s, stepA)
  s = event(s, { type: 'message.queued', id: 'm2', text: 'at the boundary' })
  s = event(s, { type: 'message.delivered', id: 'm2', text: 'at the boundary', at: 'step' })
  s = event(s, { type: 'message.queued', id: 'm3', text: 'before the answer' })
  s = event(s, { type: 'message.delivered', id: 'm3', text: 'before the answer', at: 'final' })
  assert.deepEqual(
    s.notes.map((n) => [n.id, n.at, n.stepId]),
    [
      ['m1', 'round', 'a'],
      ['m2', 'step', 'a'],
      ['m3', 'final', undefined],
    ],
  )
  assert.ok(!('stepId' in s.notes[2]), 'a final note is not tied to any step')
})

test('notes are kept on the assistant turn, so a later run does not take them away', () => {
  let s = startedRun()
  s = event(s, { type: 'message.queued', id: 'm1', text: 'mind the budget' })
  s = event(s, { type: 'message.delivered', id: 'm1', text: 'mind the budget', at: 'round' })
  const assistant = s.messages[s.messages.length - 1]
  assert.deepEqual(
    assistant.notes?.map((n) => n.text),
    ['mind the budget'],
  )

  s = event(s, { type: 'final', text: 'done' })
  s = event(s, { type: 'run.start', goal: 'next' })
  assert.deepEqual(s.notes, [], 'the live view starts clean')
  assert.deepEqual(s.queued, [])
  assert.deepEqual(
    s.messages[1].notes?.map((n) => n.text),
    ['mind the budget'],
    'the old turn keeps it',
  )
  assert.equal(s.messages[3].notes, undefined, 'and the new one has none')
})

test('a replan caused by a message says so, and a revise keeps that', () => {
  let s = startedRun()
  s = event(s, {
    type: 'replan.decision',
    mode: 'revise',
    reason: 'the user changed course',
    byUser: true,
  })
  assert.deepEqual(s.replan, { mode: 'revise', reason: 'the user changed course', byUser: true })
  s = event(s, {
    type: 'plan.revised',
    plan: { thought: '', steps: [stepB] },
    reason: 'the user changed course',
  })
  assert.equal(
    s.replan?.byUser,
    true,
    'plan.revised follows the decision and must not lose the flag',
  )

  // An ordinary failure-driven replan carries no such flag.
  let t = startedRun()
  t = event(t, { type: 'replan.decision', mode: 'continue', reason: 'fits' })
  assert.deepEqual(t.replan, { mode: 'continue', reason: 'fits' })
})

test('a subagent the user stopped is "stopped", not "error"; its profile is shown', () => {
  let s = startedRun()
  s = event(s, {
    type: 'subagent.start',
    id: 'k1',
    name: 'researcher',
    task: 'dig',
    profile: 'deep',
  })
  s = event(s, { type: 'subagent.start', id: 'k2', name: 'researcher', task: 'skim' })
  assert.equal(s.subagents[0].profile, 'deep')
  assert.ok(!('profile' in s.subagents[1]), 'no profile chosen, none shown')

  s = event(s, {
    type: 'subagent.error',
    id: 'k1',
    name: 'researcher',
    error: 'stopped by the user',
    stopped: true,
  })
  s = event(s, { type: 'subagent.error', id: 'k2', name: 'researcher', error: 'boom' })
  assert.deepEqual(
    s.subagents.map((x) => [x.id, x.status, x.activity]),
    [
      ['k1', 'stopped', 'stopped'],
      ['k2', 'error', 'failed'],
    ],
  )
  // Mirrored onto the turn like any other subagent state.
  assert.equal(s.messages[s.messages.length - 1].subagents?.[0].status, 'stopped')
})

test('undelivered: the hook reports what the run never showed the agent; it also empties the queue', () => {
  let s = startedRun()
  s = event(s, { type: 'message.queued', id: 'm1', text: 'too late' })
  assert.equal(s.queued.length, 1)
  s = agentStateReducer(s, { type: 'undelivered', texts: ['too late'] })
  assert.deepEqual(s.undelivered, ['too late'])
  assert.deepEqual(s.queued, [], 'handed over, no longer "waiting"')
  s = agentStateReducer(s, { type: 'undelivered', texts: [] })
  assert.deepEqual(s.undelivered, [])
  // A new run starts without them.
  s = agentStateReducer(s, { type: 'undelivered', texts: ['again'] })
  s = event(s, { type: 'run.start', goal: 'next' })
  assert.deepEqual(s.undelivered, [])
})

test('reset and load clear the steering state too', () => {
  let s = startedRun()
  s = event(s, { type: 'message.queued', id: 'm1', text: 'x' })
  s = agentStateReducer(s, { type: 'undelivered', texts: ['y'] })
  const reset = agentStateReducer(s, { type: 'reset' })
  assert.deepEqual([reset.queued, reset.notes, reset.undelivered], [[], [], []])
  const loaded = agentStateReducer(s, { type: 'load', messages: [] })
  assert.deepEqual([loaded.queued, loaded.notes, loaded.undelivered], [[], [], []])
})

// ── the agent's notebook and the web ─────────────────────────────────────────

const learnedEvent = (
  name: string,
  over: { update?: boolean; sources?: string[] } = {},
): AgentEvent => ({
  type: 'skill.learned',
  name,
  description: `when ${name} applies`,
  update: over.update ?? false,
  chars: 120,
  sources: over.sources ?? [],
})

test('skill.learned adds a lesson to the notebook and to the turn that wrote it', () => {
  let s = startedRun()
  s = event(s, learnedEvent('image-format-jpg', { sources: ['https://docs.example.com/formats'] }))
  assert.deepEqual(s.learned, [
    {
      name: 'image-format-jpg',
      description: 'when image-format-jpg applies',
      revision: 1,
      chars: 120,
      sources: ['https://docs.example.com/formats'],
    },
  ])
  assert.deepEqual(s.learnedNow, ['image-format-jpg'])
  const turn = s.messages.at(-1)
  assert.deepEqual(turn?.learned, ['image-format-jpg'], 'the assistant turn keeps it')
})

test('a rewrite of a lesson bumps its revision instead of adding a second entry', () => {
  let s = startedRun()
  s = event(s, learnedEvent('a'))
  s = event(s, learnedEvent('b'))
  s = event(s, learnedEvent('a', { update: true }))
  s = event(s, learnedEvent('a', { update: true }))
  assert.deepEqual(
    s.learned.map((l) => [l.name, l.revision]),
    [
      ['a', 3],
      ['b', 1],
    ],
  )
  assert.deepEqual(s.learnedNow, ['a', 'b'], 'each name once per run')
})

test('skill.forgotten removes the lesson from the notebook, and only that one', () => {
  let s = startedRun()
  s = event(s, learnedEvent('a'))
  s = event(s, learnedEvent('b'))
  s = event(s, { type: 'skill.forgotten', name: 'a' })
  assert.deepEqual(
    s.learned.map((l) => l.name),
    ['b'],
  )
  assert.equal(event(s, { type: 'skill.forgotten', name: 'nope' }).learned.length, 1)
})

test('the notebook belongs to the agent: it outlives the next run, a reset and a chat switch', () => {
  let s = startedRun()
  s = event(s, learnedEvent('a'))
  // Next run: the per-run list starts empty, the notebook stays.
  s = event(s, { type: 'run.start', goal: 'again' })
  assert.deepEqual(s.learnedNow, [])
  assert.equal(s.learned.length, 1)
  assert.equal(s.messages.at(-1)?.learned, undefined, 'a later turn did not learn it')
  // New conversation / another saved chat: the lessons are the agent's, not the conversation's.
  assert.equal(agentStateReducer(s, { type: 'reset' }).learned.length, 1)
  assert.equal(agentStateReducer(s, { type: 'load', messages: [] }).learned.length, 1)
})

test('notebook: the hook replaces it with what the freshly built agent holds', () => {
  let s = startedRun()
  s = event(s, learnedEvent('old'))
  s = agentStateReducer(s, {
    type: 'notebook',
    lessons: [{ name: 'stored', description: 'd', revision: 4, chars: 9, sources: [] }],
  })
  assert.deepEqual(
    s.learned.map((l) => [l.name, l.revision]),
    [['stored', 4]],
  )
  // ...and a rewrite of a stored lesson continues its count.
  s = event(s, learnedEvent('stored', { update: true }))
  assert.equal(s.learned[0].revision, 5)
})

test("lessonsOf: the agent's own skills only, with where each came from", () => {
  const lessons = lessonsOf([
    { name: 'host', description: 'h', content: 'configured by the host' },
    {
      name: 'mine',
      description: 'm',
      content: 'twelve chars',
      origin: {
        kind: 'learned',
        at: 1,
        revision: 3,
        sources: ['the docs'],
        fetched: ['https://docs.example.com/x'],
      },
    },
  ])
  assert.deepEqual(lessons, [
    {
      name: 'mine',
      description: 'm',
      revision: 3,
      chars: 12,
      sources: ['the docs', 'https://docs.example.com/x'],
    },
  ])
})

test('egress.request: what the model fetched, and what was refused, goes on the turn', () => {
  let s = startedRun()
  s = event(s, {
    type: 'egress.request',
    url: 'https://docs.example.com/guide',
    allowed: true,
    status: 200,
  })
  s = event(s, {
    type: 'egress.request',
    url: 'https://169.254.169.254/latest',
    allowed: false,
    reason: 'denied-address: not a public address',
  })
  assert.deepEqual(s.fetches, [
    { url: 'https://docs.example.com/guide', allowed: true, status: 200 },
    {
      url: 'https://169.254.169.254/latest',
      allowed: false,
      reason: 'denied-address: not a public address',
    },
  ])
  assert.equal(s.messages.at(-1)?.fetches?.length, 2)
  // A new run starts a new list; the old turn keeps its own.
  const next = event(s, { type: 'run.start', goal: 'again' })
  assert.deepEqual(next.fetches, [])
  assert.equal(next.messages.find((m) => m.fetches)?.fetches?.length, 2)
})
