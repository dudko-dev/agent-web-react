import type { AgentUiState } from './types.js'

/**
 * Pure helpers behind `<AgentComposer>`: slash commands, attachments, notices
 * and the elapsed-time label. No React, no DOM — unit-tested on their own.
 */

/** A command offered when the input starts with "/". */
export interface SlashCommand {
  /** Typed after the slash, e.g. "compact" for "/compact". */
  name: string
  description: string
  /**
   * 'action' runs at once on Enter (e.g. /compact); 'prefix' stays in the
   * input and rewrites the goal on submit (e.g. /chess-coach <goal>).
   */
  kind?: 'action' | 'prefix'
  /** For 'action' commands: what to do (receives the text after the name). */
  run?: (args: string) => void | Promise<void>
  /** For 'prefix' commands: the goal to send, built from the text after the name. */
  transform?: (args: string) => string
  /** Grouping label in the palette ("Commands", "Skills", …). */
  group?: string
}

/** "/name rest of text" → { name, args }; undefined unless the text starts with "/". */
export const parseSlash = (text: string): { name: string; args: string } | undefined => {
  const m = /^\/([\w-]*)(?:\s+([\s\S]*))?$/.exec(text.trimStart())
  return m ? { name: m[1].toLowerCase(), args: (m[2] ?? '').trim() } : undefined
}

/** Commands matching what was typed after "/" — name prefix first, then substring. */
export const filterCommands = (commands: SlashCommand[], query: string): SlashCommand[] => {
  const q = query.toLowerCase()
  if (!q) return commands
  const starts = commands.filter((c) => c.name.toLowerCase().startsWith(q))
  const contains = commands.filter(
    (c) =>
      !starts.includes(c) &&
      (c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)),
  )
  return [...starts, ...contains]
}

/**
 * Something attached to the next message:
 * - `text` — its content is inlined into the goal (works with every model);
 * - `image` / `pdf` / `file` — sent to the model as a file part (needs a model
 *   that takes that kind — see the core's `agent.capabilities`).
 */
export interface ComposerAttachment {
  id: string
  name: string
  kind: 'text' | 'image' | 'pdf' | 'file'
  mediaType: string
  /** Text content (kind 'text'). */
  text?: string
  /** Data URL (kinds image / pdf / file). */
  dataUrl?: string
  bytes: number
  /** Where it was saved in the virtual file system, if it was. */
  path?: string
  /** "converted from report.pdf" and the like. */
  note?: string
}

/** The kind of an attachment from its media type and name. */
export const attachmentKindOf = (mediaType: string, name: string): ComposerAttachment['kind'] => {
  if (mediaType.startsWith('image/')) return 'image'
  if (mediaType === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf'
  if (
    mediaType.startsWith('text/') ||
    /json|xml|yaml|javascript|typescript|csv|markdown|x-sh|sql|toml/.test(mediaType) ||
    /\.(txt|md|markdown|json|csv|tsv|ya?ml|xml|html?|css|m?[jt]sx?|py|sh|log|sql|toml|ini|env)$/i.test(
      name,
    )
  ) {
    return 'text'
  }
  return 'file'
}

/**
 * The goal the agent receives: the typed text followed by each attached TEXT
 * file in a fenced block. Binary attachments travel as file parts instead.
 */
export const withAttachments = (text: string, files: ComposerAttachment[]): string => {
  const texts = files.filter((f) => f.kind === 'text' && f.text !== undefined)
  if (texts.length === 0) return text
  const blocks = texts.map((f) => {
    const body = f.text as string
    const fence = body.includes('```') ? '~~~' : '```'
    const where = f.path ? ` (also saved as ${f.path})` : ''
    return `### ${f.name}${where}\n${fence}\n${body}\n${fence}`
  })
  return `${text}\n\nAttached file(s):\n${blocks.join('\n\n')}`
}

/** The transcript label for a message with attachments. */
export const attachmentLabel = (text: string, files: ComposerAttachment[]): string =>
  files.length ? `${text}\n📎 ${files.map((f) => f.name).join(', ')}` : text

/**
 * Can the current model take this attachment? Returns the reason it can't
 * (an actionable sentence), or undefined. `caps` is the core agent's
 * `capabilities` (true / false / undefined per kind; undefined = will try).
 */
export const attachmentRefusal = (
  kind: ComposerAttachment['kind'],
  caps: { images?: boolean; pdf?: boolean; files?: boolean } | undefined,
  canConvertPdf = false,
): string | undefined => {
  if (kind === 'text' || !caps) return undefined
  if (kind === 'image' && caps.images === false) {
    return "This model can't see images — switch to a vision-capable model (Gemini, Claude, GPT-4o/5) to attach one."
  }
  if (kind === 'pdf' && caps.pdf === false && !canConvertPdf) {
    return "This model can't read PDF files — convert it to text first, or switch to Gemini, Claude or GPT-4o/5."
  }
  if (kind === 'file' && caps.files === false) {
    return "This model can't take file attachments — paste the text instead."
  }
  return undefined
}

/** 950 → "0s", 61_000 → "1m 1s", 3_725_000 → "1h 2m". */
export const formatElapsed = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

/** A banner above the input. */
export interface ComposerNotice {
  /** Stable per occurrence, so a dismissal sticks until something new happens. */
  id: string
  tone: 'info' | 'warn' | 'error'
  text: string
}

const kTokens = (n: number): string =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : `${n}`

/** The banner texts (override for another language). */
export interface NoticeTexts {
  /** A limit stopped the run; `kind` is 'input' | 'output' | 'reasoning' | 'total' | 'tool-calls'. */
  limit: (kind: string, used: number, cap: number) => string
  /** The context was compacted. */
  compacted: (scope: string, before: number, after: number) => string
}

export const defaultNoticeTexts: NoticeTexts = {
  limit: (kind, used, cap) => {
    const calls = kind === 'tool-calls'
    const what = calls ? 'Tool-call' : `${kind[0].toUpperCase()}${kind.slice(1)}-token`
    const amount = calls ? `${used}/${cap} calls` : `${kTokens(used)}/${kTokens(cap)} tokens`
    return `${what} limit reached · ${amount} — the agent stopped early and answered with what it had`
  },
  compacted: (scope, before, after) =>
    `Context compacted (${scope}) · ${kTokens(before)} → ${kTokens(after)} tokens`,
}

/**
 * The notices worth a banner for the current run: a limit that stopped it, the
 * latest compaction, a failure to start. Pure — derived from the UI state.
 */
export const noticesOf = (
  state: AgentUiState,
  texts: Partial<NoticeTexts> = {},
): ComposerNotice[] => {
  const t = { ...defaultNoticeTexts, ...texts }
  const out: ComposerNotice[] = []
  if (state.status === 'error' && state.error) {
    out.push({ id: `error:${state.error}`, tone: 'error', text: state.error })
  }
  if (state.budget) {
    const b = state.budget
    out.push({
      id: `budget:${state.goal ?? ''}:${b.kind}:${b.cap}`,
      tone: 'warn',
      text: t.limit(b.kind, b.tokens, b.cap),
    })
  }
  const last = state.compactions.at(-1)
  if (last) {
    out.push({
      id: `compact:${state.compactions.length}:${last.beforeTokens}:${last.afterTokens}`,
      tone: 'info',
      text: t.compacted(last.scope, last.beforeTokens, last.afterTokens),
    })
  }
  return out
}
