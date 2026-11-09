import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AgentEvent, IUsage } from '@dudko.dev/agent-web'
import {
  agentStateReducer,
  attachmentKindOf,
  attachmentRefusal,
  ChatHistoryStore,
  chatTitle,
  createInitialAgentState,
  defaultLabels,
  filterCommands,
  formatElapsed,
  LearnedSkills,
  mergeLabels,
  MessageList,
  newChatId,
  noticesOf,
  parseSlash,
  steerIntent,
  StepList,
  SubagentRow,
  usageLine,
  withAttachments,
  type AgentAction,
  type AgentUiState,
  type ChatMessage,
  type ComposerAttachment,
  type LessonView,
  type SlashCommand,
  type StepView,
  type SubagentView,
  type UserNoteView,
} from '../dist/index.js'

const usage = (input: number, output: number, extra: Partial<IUsage> = {}): IUsage => ({
  inputTokens: input,
  outputTokens: output,
  totalTokens: input + output,
  ...extra,
})

const at = (state: AgentUiState, e: AgentEvent, time: number, extra = {}): AgentUiState =>
  agentStateReducer(state, { type: 'event', event: e, at: time, ...extra } as AgentAction)

const step = { id: 's1', description: 'Look it up' }

// ── composer helpers ────────────────────────────────────────────────────────

test('parseSlash splits a command from its arguments; plain text is not a command', () => {
  assert.deepEqual(parseSlash('/think high'), { name: 'think', args: 'high' })
  assert.deepEqual(parseSlash('  /Compact'), { name: 'compact', args: '' })
  assert.deepEqual(parseSlash('/chess-coach what now?\nline 2'), {
    name: 'chess-coach',
    args: 'what now?\nline 2',
  })
  assert.equal(parseSlash('hello /there'), undefined)
})

test('filterCommands: name prefix first, then substring of name or description', () => {
  const cmds: SlashCommand[] = [
    { name: 'compact', description: 'Summarise the conversation' },
    { name: 'ask-all', description: 'Ask before every call' },
    { name: 'autopilot', description: 'Run tools without asking' },
  ]
  assert.deepEqual(
    filterCommands(cmds, 'a').map((c) => c.name),
    ['ask-all', 'autopilot', 'compact'],
  )
  assert.deepEqual(
    filterCommands(cmds, 'conv').map((c) => c.name),
    ['compact'],
  )
  assert.equal(filterCommands(cmds, '').length, 3)
})

test('attachmentKindOf sorts images, PDFs, text and other files', () => {
  assert.equal(attachmentKindOf('image/png', 'x.png'), 'image')
  assert.equal(attachmentKindOf('application/pdf', 'r.pdf'), 'pdf')
  assert.equal(attachmentKindOf('', 'r.PDF'), 'pdf')
  assert.equal(attachmentKindOf('application/json', 'a.json'), 'text')
  assert.equal(attachmentKindOf('', 'main.ts'), 'text')
  assert.equal(attachmentKindOf('application/zip', 'a.zip'), 'file')
})

test('withAttachments inlines text files only, with a safe fence', () => {
  const files: ComposerAttachment[] = [
    { id: '1', name: 'a.md', kind: 'text', mediaType: 'text/markdown', text: 'x ``` y', bytes: 7 },
    { id: '2', name: 'p.png', kind: 'image', mediaType: 'image/png', dataUrl: 'data:', bytes: 1 },
  ]
  const goal = withAttachments('summarise', files)
  assert.match(goal, /^summarise\n\nAttached file\(s\):\n### a\.md\n~~~\nx ``` y\n~~~$/)
  assert.ok(!goal.includes('p.png'))
  assert.equal(withAttachments('hi', []), 'hi')
})

test('attachmentRefusal names what to do for a model that cannot take the kind', () => {
  assert.match(attachmentRefusal('image', { images: false }) ?? '', /vision-capable/)
  assert.match(attachmentRefusal('pdf', { pdf: false }) ?? '', /convert it to text/)
  assert.equal(attachmentRefusal('pdf', { pdf: false }, true), undefined) // the host converts
  assert.equal(attachmentRefusal('image', { images: undefined }), undefined) // unknown: try
  assert.equal(attachmentRefusal('text', { images: false, pdf: false, files: false }), undefined)
})

test('formatElapsed', () => {
  assert.equal(formatElapsed(950), '0s')
  assert.equal(formatElapsed(61_000), '1m 1s')
  assert.equal(formatElapsed(3_725_000), '1h 2m')
})

test('noticesOf: error, limit and compaction banners, with overridable texts', () => {
  let s = createInitialAgentState()
  s = at(s, { type: 'run.start', goal: 'g' }, 1)
  s = at(s, { type: 'budget.exceeded', kind: 'output', tokens: 1200, cap: 1000 }, 2)
  s = at(
    s,
    { type: 'context.compacted', scope: 'tool-results', beforeTokens: 40_000, afterTokens: 9_000 },
    3,
  )
  const notices = noticesOf(s)
  assert.deepEqual(
    notices.map((n) => n.tone),
    ['warn', 'info'],
  )
  assert.match(notices[0].text, /Output-token limit reached · 1\.2k\/1\.0k tokens/)
  assert.match(notices[1].text, /tool-results.*40k → 9\.0k/)
  const ru = noticesOf(s, { limit: (kind) => `Лимит: ${kind}` })
  assert.equal(ru[0].text, 'Лимит: output')
  assert.equal(ru[1].text, notices[1].text) // the rest keeps the defaults
})

// ── labels ──────────────────────────────────────────────────────────────────

test('mergeLabels overrides single labels and merges nested groups', () => {
  const L = mergeLabels(defaultLabels, {
    send: 'Отправить',
    modes: { autopilot: { label: 'Авто', hint: 'без вопросов' } },
    steps: (n) => `${n} шаг(ов)`,
  })
  assert.equal(L.send, 'Отправить')
  assert.equal(L.modes.autopilot.label, 'Авто')
  assert.equal(L.modes['ask-all'].label, defaultLabels.modes['ask-all'].label)
  assert.equal(L.steps(3), '3 шаг(ов)')
  assert.equal(L.stop, defaultLabels.stop)
  assert.equal(defaultLabels.send, 'Send') // the defaults are not mutated
})

// ── chat history ────────────────────────────────────────────────────────────

const msg = (id: string, role: 'user' | 'assistant', content: string): ChatMessage => ({
  id,
  role,
  content,
})

test('ChatHistoryStore (memory): put, list newest first without messages, get, delete', async () => {
  const store = new ChatHistoryStore({ memory: true })
  await store.put({
    id: 'a',
    title: 'first',
    createdAt: 1,
    updatedAt: 10,
    messages: [msg('m1', 'user', 'hi')],
  })
  await store.put({
    id: 'b',
    title: 'second',
    createdAt: 2,
    updatedAt: 20,
    messages: [msg('m1', 'user', 'yo'), msg('m2', 'assistant', 'hey')],
  })
  const list = await store.list()
  assert.deepEqual(
    list.map((c) => [c.id, c.messageCount]),
    [
      ['b', 2],
      ['a', 1],
    ],
  )
  assert.equal('messages' in list[0], false)
  assert.equal((await store.get('a'))?.messages[0].content, 'hi')
  await store.delete('a')
  assert.equal(await store.get('a'), undefined)
  await store.clear()
  assert.deepEqual(await store.list(), [])
})

test('chatTitle uses the first user message; newChatId is unique', () => {
  assert.equal(chatTitle([]), 'New chat')
  assert.equal(
    chatTitle([msg('1', 'assistant', 'x'), msg('2', 'user', '  plan\n my   day ')]),
    'plan my day',
  )
  assert.equal(chatTitle([msg('1', 'user', 'x'.repeat(80))]).length, 60)
  assert.notEqual(newChatId(), newChatId())
})

// ── reducer: per-message activity, timing, totals, load ─────────────────────

test('each assistant message keeps its own steps, tool timing, usage and duration', () => {
  let s = createInitialAgentState()
  s = at(s, { type: 'run.start', goal: 'find x' }, 1000)
  s = at(s, { type: 'step.start', step, index: 1, total: 1 }, 1100)
  s = at(s, { type: 'step.tool-call', step, name: 'lookup', input: { q: 'x' } }, 1200)
  s = at(s, { type: 'step.tool-result', step, name: 'lookup', output: 'value', ok: true }, 1450)
  s = at(
    s,
    { type: 'usage', phase: 'execute', usage: usage(100, 20, { reasoningTokens: 5 }) },
    1500,
  )
  s = at(s, { type: 'final', text: 'x is value' }, 1900)
  s = at(s, { type: 'run.complete', result: { final: 'x is value' } } as never, 2000)

  const answer = s.messages.find((m) => m.role === 'assistant')!
  assert.equal(answer.content, 'x is value')
  assert.equal(answer.pending, false)
  assert.equal(answer.steps?.[0].toolCalls[0].name, 'lookup')
  assert.equal(answer.steps?.[0].toolCalls[0].durationMs, 250)
  assert.equal(answer.usage?.inputTokens, 100)
  assert.equal(answer.durationMs, 900) // run start → the answer
  assert.equal(s.totalUsage.totalTokens, 120)

  // The next run starts a fresh view, but the first answer keeps its activity.
  s = at(s, { type: 'run.start', goal: 'again' }, 3000)
  s = at(s, { type: 'usage', phase: 'plan', usage: usage(10, 1) }, 3100)
  assert.equal(s.steps.length, 0)
  assert.equal(s.messages[1].steps?.length, 1)
  assert.equal(s.totalUsage.totalTokens, 131)
  assert.equal(s.usage.totalTokens, 11)
})

test('run.start carries the transcript attachments onto the user turn', () => {
  const s = at(createInitialAgentState(), { type: 'run.start', goal: 'look' }, 1, {
    attachments: [{ name: 'p.png', mediaType: 'image/png', dataUrl: 'data:image/png;base64,AA' }],
  })
  assert.equal(s.messages[0].attachments?.[0].name, 'p.png')
})

test('load replaces the transcript and totals; new ids never collide with loaded ones', () => {
  let s = at(createInitialAgentState(), { type: 'run.start', goal: 'old' }, 1)
  s = agentStateReducer(s, {
    type: 'load',
    messages: [
      { ...msg('msg-41', 'user', 'saved'), pending: false },
      { ...msg('msg-42', 'assistant', ''), pending: true },
    ],
    totalUsage: usage(5, 5),
  })
  assert.deepEqual(
    s.messages.map((m) => [m.id, m.pending ?? false]),
    [
      ['msg-41', false],
      ['msg-42', false],
    ],
  )
  assert.equal(s.totalUsage.totalTokens, 10)
  assert.equal(s.goal, undefined)
  s = at(s, { type: 'run.start', goal: 'next' }, 2)
  const ids = s.messages.map((m) => m.id)
  assert.equal(new Set(ids).size, ids.length)
})

test('usageLine shows tokens by kind and the duration', () => {
  assert.equal(
    usageLine(usage(12_000, 456, { reasoningTokens: 120, cachedInputTokens: 9000 }), 4200),
    'in 12k · out 456 · think 120 · cached 9.0k · 4.2 s',
  )
  assert.equal(usageLine(undefined), '')
})

// ── steering a run that is going ─────────────────────────────────────────────

test('steerIntent: while the agent works, text goes TO it; the rest waits', () => {
  const base = { busy: true, steering: true, hasAttachments: false }
  // Idle: not this helper's business.
  assert.equal(steerIntent({ ...base, busy: false, raw: 'hello' }), 'idle')
  assert.equal(steerIntent({ ...base, busy: false, raw: '' }), 'idle')

  assert.equal(steerIntent({ ...base, raw: 'use the staging database' }), 'steer')
  assert.equal(steerIntent({ ...base, raw: '' }), 'ignore', 'nothing typed')
  // A path is a message; "/command" is not.
  assert.equal(steerIntent({ ...base, raw: '/etc/hosts is the file' }), 'steer')
  assert.equal(steerIntent({ ...base, raw: '/stop' }), 'ignore')
  assert.equal(steerIntent({ ...base, raw: '/' }), 'ignore')
  // Files cannot join a run that is going - with or without text.
  assert.equal(steerIntent({ ...base, raw: 'see this', hasAttachments: true }), 'attachments')
  assert.equal(steerIntent({ ...base, raw: '', hasAttachments: true }), 'attachments')
  // A host that switched steering off gets the old behaviour.
  assert.equal(steerIntent({ ...base, steering: false, raw: 'hello' }), 'ignore')
  assert.equal(steerIntent({ ...base, steering: false, raw: '' }), 'ignore')
})

test('labels: the steering texts have defaults, and where a note landed can be overridden one by one', () => {
  assert.equal(defaultLabels.noteAt.round, 'you said, between tool calls')
  assert.equal(defaultLabels.undelivered(1), 'Not delivered (1 message)')
  assert.equal(defaultLabels.undelivered(3), 'Not delivered (3 messages)')

  const L = mergeLabels(defaultLabels, { noteAt: { step: 'вы сказали, после шага' } } as never)
  assert.equal(L.noteAt.step, 'вы сказали, после шага')
  assert.equal(L.noteAt.round, defaultLabels.noteAt.round, 'the others are kept')
  assert.equal(L.noteAt.final, defaultLabels.noteAt.final)
})

// ── markup of the steering parts (server-rendered: no DOM needed) ────────────

const sub = (over: Partial<SubagentView> = {}): SubagentView => ({
  id: 'k1',
  name: 'analyst',
  task: 'weigh e4',
  status: 'running',
  activity: 'step 1/1: look',
  steps: 1,
  toolCalls: 0,
  text: '',
  usage: usage(0, 0),
  ...over,
})
const html = (node: Parameters<typeof renderToStaticMarkup>[0]): string =>
  renderToStaticMarkup(node)

test('SubagentRow: a running subagent gets a stop button only when the host wires one', () => {
  const stopped: string[] = []
  const withStop = html(
    createElement(SubagentRow, { sub: sub(), onStop: (id) => stopped.push(id) }),
  )
  assert.match(withStop, /aria-label="Stop this subagent"/)
  assert.doesNotMatch(html(createElement(SubagentRow, { sub: sub() })), /Stop this subagent/)
  // Only while it runs.
  for (const status of ['done', 'error', 'stopped'] as const) {
    const done = html(
      createElement(SubagentRow, { sub: sub({ status, text: 'x' }), onStop: () => {} }),
    )
    assert.doesNotMatch(done, /Stop this subagent/, status)
  }
  assert.match(
    html(createElement(SubagentRow, { sub: sub({ status: 'stopped' }) })),
    /awr-subagent--stopped[\s\S]*stopped/,
  )
  assert.match(html(createElement(SubagentRow, { sub: sub({ profile: 'deep' }) })), />deep</)
})

test('StepList: a note sits under the step it reached; one without a step goes at the end', () => {
  const st = (id: string, index: number) =>
    ({
      id,
      index,
      total: 2,
      step: { id, description: `Step ${id}` },
      text: '',
      reasoning: '',
      toolCalls: [],
      status: 'done',
      blocked: false,
    }) as StepView
  const notes: UserNoteView[] = [
    { id: 'n1', text: 'during A', at: 'round', stepId: 'a' },
    { id: 'n2', text: 'before the answer', at: 'final' },
  ]
  const out = html(createElement(StepList, { steps: [st('a', 1), st('b', 2)], notes }))
  const at = (s: string) => out.indexOf(s)
  assert.ok(at('Step a') < at('during A') && at('during A') < at('Step b'), 'under step a')
  assert.ok(at('Step b') < at('before the answer'), 'the unanchored one is last')
  assert.match(out, /you said, between tool calls/)
  assert.match(out, /you said, before the answer/)
  // Hosts can hide them.
  const hidden = html(createElement(StepList, { steps: [st('a', 1)], notes, showNotes: false }))
  assert.doesNotMatch(hidden, /during A|before the answer/)
})

// ── the notebook and what was fetched ────────────────────────────────────────

const lesson = (over: Partial<LessonView> = {}): LessonView => ({
  name: 'image-format-jpg',
  description: 'When convert rejects the format "jpeg"',
  revision: 1,
  chars: 80,
  sources: [],
  ...over,
})

test('LearnedSkills: each lesson with when it applies, its revision and where it came from', () => {
  const out = html(
    createElement(LearnedSkills, {
      lessons: [
        lesson({ revision: 3, sources: ['the docs', 'https://docs.example.com/formats'] }),
        lesson({ name: 'second' }),
      ],
      onForget: () => {},
    }),
  )
  assert.match(out, /Notebook/)
  assert.match(out, /image-format-jpg/)
  assert.match(out, /When convert rejects the format &quot;jpeg&quot;/)
  assert.match(out, /revision 3/)
  assert.doesNotMatch(out, /revision 1/, 'a first revision says nothing')
  assert.match(out, /from the docs, https:\/\/docs\.example\.com\/formats/)
  assert.equal((out.match(/awr-lesson__forget/g) ?? []).length, 2, 'a forget button per lesson')
})

test('LearnedSkills: read-only without a forget handler; sources, title and the empty text can go or change', () => {
  const none = html(createElement(LearnedSkills, { lessons: [], onForget: false }))
  assert.match(none, /The agent has not written any lessons down yet\./)
  const readOnly = html(
    createElement(LearnedSkills, {
      lessons: [lesson({ sources: ['x'] })],
      onForget: false,
      showSources: false,
      hideTitle: true,
    }),
  )
  assert.doesNotMatch(readOnly, /awr-lesson__forget|awr-lesson__from|Notebook/)
  const relabelled = html(
    createElement(LearnedSkills, {
      lessons: [lesson()],
      onForget: () => {},
      labels: { notebookTitle: 'Memory', notebookForget: 'Drop' },
    }),
  )
  assert.match(relabelled, /Memory/)
  assert.match(relabelled, /aria-label="Drop: image-format-jpg"/)
})

const assistant = (over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'm1',
  role: 'assistant',
  content: 'Done.',
  pending: false,
  steps: [
    {
      id: 's1',
      index: 1,
      total: 1,
      step: { id: 's1', description: 'Look it up' },
      text: '',
      reasoning: '',
      toolCalls: [],
      status: 'done',
      blocked: false,
    },
  ],
  ...over,
})

test('MessageList: the turn says what the agent learned and what it fetched - and either can be hidden', () => {
  const m = assistant({
    learned: ['image-format-jpg'],
    fetches: [
      { url: 'https://docs.example.com/formats', allowed: true, status: 200 },
      { url: 'https://169.254.169.254/x', allowed: false, reason: 'denied-address' },
    ],
  })
  const out = html(createElement(MessageList, { messages: [m], activityOpen: true }))
  assert.match(out, /1 step · 0 tool calls · learned: image-format-jpg · 2 web requests/)
  assert.match(out, /awr-fetch[^-][\s\S]*docs\.example\.com\/formats[\s\S]*200/)
  assert.match(out, /awr-fetch--refused[\s\S]*169\.254\.169\.254[\s\S]*refused: denied-address/)
  assert.match(out, /<p class="awr-learned">[\s\S]*learned: image-format-jpg/)

  const hidden = html(
    createElement(MessageList, { messages: [m], activityOpen: true, showLearned: false }),
  )
  assert.doesNotMatch(hidden, /learned:|web request|awr-fetch/)
})
