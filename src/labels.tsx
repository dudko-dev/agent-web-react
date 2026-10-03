import { createContext, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import type { ToolApprovalMode } from '@dudko.dev/agent-web'
import { defaultNoticeTexts, type NoticeTexts } from './composer.js'
import type { AgentStatus } from './types.js'

/**
 * Every string the pre-styled components render — override any of them for
 * another language or wording, per component (`labels` prop) or for a whole
 * tree (`<AgentLabelsProvider>`). Counted phrases are functions, so languages
 * with several plural forms can say them properly.
 */
export interface AgentLabels {
  // ── chat panel ─────────────────────────────────────────────────────────────
  emptyState: string
  status: Record<AgentStatus, string>
  history: string
  newChat: string
  files: string
  totalUsage: string
  showHistory: string
  showFiles: string
  close: string

  // ── transcript ─────────────────────────────────────────────────────────────
  steps: (n: number) => string
  toolCalls: (n: number) => string
  subagents: (n: number) => string
  skillsUsed: (names: string) => string
  answerThoughts: string
  stepThoughts: string
  usageTitle: string
  attachments: string
  planned: string
  replanned: (mode: string, reason: string) => string

  // ── composer ───────────────────────────────────────────────────────────────
  placeholder: string
  listening: string
  message: string
  dropHint: string
  attach: string
  attachTitle: string
  commands: string
  commandsTitle: string
  send: string
  stop: string
  dismiss: string
  remove: (name: string) => string
  dictate: string
  dictateTitle: string
  stopDictation: string
  microphone: string
  model: string
  thinking: string
  toolConsent: string
  modes: Record<ToolApprovalMode, { label: string; hint: string }>
  timerRunning: string
  timerLast: string
  agents: (n: number) => string
  agentsTitle: string
  /** Banners: a limit stopped the run / the context was compacted. */
  notices: NoticeTexts
  attachmentsOnly: string
  seeAttachments: string
  tooLarge: (name: string, mb: number) => string
  binaryText: (name: string) => string
  commandGroups: { commands: string; consent: string; skills: string }
  commandDescriptions: {
    compact: string
    new: string
    stop: string
    autopilot: string
    ask: string
    askAll: string
    readOnly: string
    think: (levels: string) => string
  }
  /** `off` = the provider's default; `none` = thinking switched off. */
  thinkingLevels: { off: string; none: string; low: string; medium: string; high: string }

  // ── files panel ────────────────────────────────────────────────────────────
  filesEmpty: string
  upload: string
  download: string
  delete: string
  preview: string
  bytes: (n: number) => string

  // ── chat history ───────────────────────────────────────────────────────────
  historyEmpty: string
  deleteChat: string
  messagesCount: (n: number) => string

  // ── consent prompt ─────────────────────────────────────────────────────────
  approvalLead: string
  approve: string
  alwaysAllow: string
  deny: string
  declinedReason: string
  readOnlyTool: string
  consentWaiting: string
  consentAllowed: string
  consentDenied: (reason?: string) => string

  // ── steps / tool calls ─────────────────────────────────────────────────────
  failed: string
  toolCostTitle: string
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const kb = (n: number): string =>
  n < 1024
    ? `${n} B`
    : n < 1024 * 1024
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1024 / 1024).toFixed(1)} MB`

export const defaultLabels: AgentLabels = {
  emptyState: 'Ask the agent to do something.',
  status: {
    idle: 'Idle',
    initializing: 'Loading model…',
    ready: 'Ready',
    running: 'Working…',
    error: 'Failed to start',
  },
  history: 'Chats',
  newChat: 'New chat',
  files: 'Files',
  totalUsage: 'Tokens this conversation used, by kind',
  showHistory: 'Show chats',
  showFiles: 'Show files',
  close: 'Close',

  steps: (n) => plural(n, 'step', 'steps'),
  toolCalls: (n) => plural(n, 'tool call', 'tool calls'),
  subagents: (n) => plural(n, 'subagent', 'subagents'),
  skillsUsed: (names) => `skills: ${names}`,
  answerThoughts: 'Thinking about the answer',
  stepThoughts: 'Thoughts',
  usageTitle: 'Tokens this answer spent, by kind',
  attachments: 'Attachments',
  planned: 'Plan',
  replanned: (mode, reason) => `Replanned (${mode}): ${reason}`,

  placeholder: 'Ask the agent to do something…  ( / for commands, Ctrl+V to paste an image )',
  listening: 'Listening…',
  message: 'Message',
  dropHint: 'Drop files or images to attach them',
  attach: 'Attach files',
  attachTitle: 'Attach files or images (or paste with Ctrl+V, or drop them here)',
  commands: 'Commands',
  commandsTitle: 'Commands and skills ( / )',
  send: 'Send',
  stop: 'Stop',
  dismiss: 'Dismiss',
  remove: (name) => `Remove ${name}`,
  dictate: 'Dictate (speech to text)',
  dictateTitle: 'Dictate — speech to text in the browser',
  stopDictation: 'Stop dictation',
  microphone: 'Microphone',
  model: 'Model',
  thinking: 'Thinking',
  toolConsent: 'Tool consent',
  modes: {
    autopilot: { label: 'Auto', hint: 'Autopilot — run every tool without asking' },
    'ask-writes': {
      label: 'Ask',
      hint: 'Run read-only tools freely; ask before anything that may change state',
    },
    'ask-all': { label: 'Ask all', hint: 'Ask before every tool call' },
    'read-only': {
      label: 'Read-only',
      hint: 'Only read-only tools; refuse changes without asking',
    },
  },
  timerRunning: 'This run so far',
  timerLast: 'The last run took',
  agents: (n) => plural(n, 'agent', 'agents'),
  agentsTitle: 'Subagents running in this run',
  notices: defaultNoticeTexts,
  attachmentsOnly: '(attachments)',
  seeAttachments: 'See the attachments.',
  tooLarge: (name, mb) => `${name} is larger than ${mb} MB.`,
  binaryText: (name) => `${name} looks binary — it can't be attached as text.`,
  commandGroups: { commands: 'Commands', consent: 'Consent', skills: 'Skills' },
  commandDescriptions: {
    compact: 'Summarise the conversation to free context',
    new: 'Start a new conversation',
    stop: 'Stop the current run',
    autopilot: 'Run every tool without asking',
    ask: 'Ask before tools that may change state',
    askAll: 'Ask before every tool call',
    readOnly: 'Only read; refuse changes',
    think: (levels) => `Set thinking: ${levels}`,
  },
  thinkingLevels: {
    off: 'Default',
    none: 'No thinking',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
  },

  filesEmpty: 'No files yet. Attachments and files the agent writes appear here.',
  upload: 'Upload',
  download: 'Download',
  delete: 'Delete',
  preview: 'Preview',
  bytes: kb,

  historyEmpty: 'No saved chats yet.',
  deleteChat: 'Delete chat',
  messagesCount: (n) => plural(n, 'message', 'messages'),

  approvalLead: 'The agent wants to run',
  approve: 'Allow once',
  alwaysAllow: 'Always allow',
  deny: 'Deny',
  declinedReason: 'the user declined',
  readOnlyTool: 'read-only',
  consentWaiting: 'waiting for your consent',
  consentAllowed: 'allowed',
  consentDenied: (reason) => `denied${reason ? ` — ${reason}` : ''}`,

  failed: 'failed',
  toolCostTitle:
    "Estimated tokens of the arguments and of the result fed back to the model (chars / 4), and the call's duration",
}

/** Overrides: any label, with the nested groups merged key by key. */
export type AgentLabelsOverride = Partial<
  Omit<
    AgentLabels,
    'status' | 'modes' | 'commandGroups' | 'commandDescriptions' | 'thinkingLevels' | 'notices'
  >
> & {
  status?: Partial<AgentLabels['status']>
  modes?: Partial<AgentLabels['modes']>
  commandGroups?: Partial<AgentLabels['commandGroups']>
  commandDescriptions?: Partial<AgentLabels['commandDescriptions']>
  thinkingLevels?: Partial<AgentLabels['thinkingLevels']>
  notices?: Partial<AgentLabels['notices']>
}

const NESTED = [
  'status',
  'modes',
  'commandGroups',
  'commandDescriptions',
  'thinkingLevels',
] as const

/** `base` with `over` applied (nested groups merged, not replaced). */
export const mergeLabels = (base: AgentLabels, over?: AgentLabelsOverride): AgentLabels => {
  if (!over) return base
  const out = { ...base, ...over } as AgentLabels
  for (const key of NESTED) {
    if (over[key]) (out as unknown as Record<string, unknown>)[key] = { ...base[key], ...over[key] }
  }
  return out
}

const LabelsContext = createContext<AgentLabels>(defaultLabels)

export interface AgentLabelsProviderProps {
  labels: AgentLabelsOverride
  children?: ReactNode
}

/** Override labels for every component below (nests: inner providers win). */
export const AgentLabelsProvider = ({ labels, children }: AgentLabelsProviderProps) => {
  const parent = useContext(LabelsContext)
  const value = useMemo(() => mergeLabels(parent, labels), [parent, labels])
  return <LabelsContext.Provider value={value}>{children}</LabelsContext.Provider>
}

/** The labels in effect: the provider's, with a component's own `labels` prop on top. */
export const useLabels = (over?: AgentLabelsOverride): AgentLabels => {
  const ctx = useContext(LabelsContext)
  return useMemo(() => mergeLabels(ctx, over), [ctx, over])
}
