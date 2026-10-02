import { useEffect, useMemo, useRef, useState } from 'react'
import type { ClipboardEvent, KeyboardEvent, ReactNode, RefObject } from 'react'
import type { RunFile, ToolApprovalMode, VirtualFileSystem } from '@dudko.dev/agent-web'
import {
  attachmentKindOf,
  attachmentRefusal,
  filterCommands,
  formatElapsed,
  noticesOf,
  parseSlash,
  withAttachments,
  type ComposerAttachment,
  type SlashCommand,
} from '../composer.js'
import type { UseAgentReturn } from '../hooks/use-agent.js'
import { useSpeechToText } from '../hooks/use-speech-to-text.js'
import { downscaleImage } from '../image-resize.js'
import { useLabels, type AgentLabels, type AgentLabelsOverride } from '../labels.js'
import type { ChatAttachment } from '../types.js'
import {
  BoltIcon,
  BotIcon,
  ClockIcon,
  EyeIcon,
  FileIcon,
  MicIcon,
  PlusIcon,
  SendIcon,
  ShieldIcon,
  SlashIcon,
  SpinnerIcon,
  StopIcon,
  XIcon,
} from './icons.js'

export interface ComposerModelChip {
  /** What the chip says, e.g. "Gemini 3.5 Flash". */
  label: string
  /** Models to switch to from the chip's menu (omit for a read-only label). */
  options?: { id: string; label: string; group?: string }[]
  value?: string
  onSelect?: (id: string) => void
}

export interface ComposerThinkingChip {
  /** Current level, e.g. 'off' | 'low' | 'medium' | 'high'. */
  value: string
  /** Offered levels (default: default / low / medium / high). */
  options?: { id: string; label: string }[]
  onChange: (value: string) => void
}

/** A file turned into text by the host (e.g. a PDF converted to Markdown). */
export interface ConvertedFile {
  text: string
  /** Name of the text attachment (default: the file's name + ".md"). */
  name?: string
}

export interface AgentComposerProps {
  /** The agent from `useAgent()` (or `useAgentContext()`). */
  controller: UseAgentReturn
  placeholder?: string
  /** Model chip (and switcher). */
  model?: ComposerModelChip
  /** Thinking level, shown next to the model and switchable from its menu. */
  thinking?: ComposerThinkingChip
  /** Override any text the composer renders (see `AgentLabels`). */
  labels?: AgentLabelsOverride
  /** Extra slash commands (merged after the built-ins and the agent's skills). */
  commands?: SlashCommand[]
  /** Built-in commands: /compact /new /stop /autopilot /ask /ask-all /read-only /think (default true). */
  builtinCommands?: boolean
  /** Offer the agent's skills as "/skill-name …" commands (default true). */
  skillCommands?: boolean
  /**
   * "+" button, paste (Ctrl+V) and drag & drop of files and images (default
   * true). Text files are inlined into the message; images, PDFs and other
   * files go to the model as attachments — when the model can take them.
   */
  attachments?:
    | boolean
    | {
        /** The file picker's `accept`. */
        accept?: string
        /** Refuse larger files (default 20 MB). */
        maxBytes?: number
        /**
         * Downscale images to this longest edge before sending (default 1568 —
         * what providers bill for; larger only costs upload). false = as is.
         */
        imageMaxDimension?: number | false
        /** …and to this many pixels (default 1 150 000). */
        imageMaxPixels?: number
      }
  /**
   * Turn a file into text — e.g. PDF → Markdown with `@dudko.dev/pdf-to-md-core`.
   * Used for PDFs the model can't read (or every PDF with `convert: 'always'`)
   * and for files of a kind the model refuses. Return undefined to skip.
   */
  convertFile?: (file: File) => Promise<ConvertedFile | undefined>
  /** When to use `convertFile` for PDFs (default 'when-needed'). */
  convert?: 'when-needed' | 'always'
  /** Save attachments into this virtual file system (under `/attachments/`). */
  files?: VirtualFileSystem
  /**
   * Where dropping files attaches them: the composer itself ('self', default),
   * the whole window ('window'), or any element (a ref — `<AgentChat>` passes
   * its own panel).
   */
  dropZone?: 'self' | 'window' | RefObject<HTMLElement | null>
  /** Speech-to-text mic — the browser's Web Speech API (default: on when supported). */
  speech?: boolean | { lang?: string }
  /** Run timer chip (default true). */
  showTimer?: boolean
  /** Running-subagents chip (default true). */
  showAgents?: boolean
  /** Consent-mode chip — "⚡ Auto" for autopilot (default true). */
  showApprovalMode?: boolean
  /** Banners for limits, compaction and errors above the input (default true). */
  showNotices?: boolean
  /** Extra content in the toolbar, after the "/" button. */
  toolbarExtra?: ReactNode
  /** Extra content at the end of the toolbar, before the consent chip. */
  toolbarEnd?: ReactNode
  /** Render an attachment chip yourself (`remove` drops it). */
  renderAttachment?: (attachment: ComposerAttachment, remove: () => void) => ReactNode
  disabled?: boolean
  className?: string
}

const thinkingDefaults = (l: AgentLabels) => [
  { id: 'off', label: l.thinkingLevels.off },
  { id: 'low', label: l.thinkingLevels.low },
  { id: 'medium', label: l.thinkingLevels.medium },
  { id: 'high', label: l.thinkingLevels.high },
]

const MODES: ToolApprovalMode[] = ['autopilot', 'ask-writes', 'ask-all', 'read-only']

const ModeIcon = ({ mode }: { mode: ToolApprovalMode }) =>
  mode === 'autopilot' ? (
    <BoltIcon size={14} />
  ) : mode === 'read-only' ? (
    <EyeIcon size={14} />
  ) : (
    <ShieldIcon size={14} />
  )

type Menu = 'commands' | 'model' | 'mode' | undefined

let attachSeq = 0

const readDataUrl = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error ?? new Error('could not read the file'))
    r.readAsDataURL(file)
  })

const safeName = (name: string): string => name.replace(/[^\w.-]+/g, '_').slice(0, 80) || 'file'

/**
 * A full chat composer for the agent — the input plus everything around it:
 *
 * - banners for a limit that stopped the run, a compaction, a start failure,
 *   or an attachment the model can't take;
 * - the "+" button, Ctrl+V and drag & drop: images (thumbnails), PDFs and text
 *   files — checked against the model's capabilities, optionally converted
 *   (PDF → Markdown) and saved to a virtual file system;
 * - slash commands: `/compact`, `/new`, `/stop`, the consent modes, `/think`,
 *   and the agent's skills as `/skill-name …`;
 * - a run timer, the number of running subagents, the model + thinking chip,
 *   the consent-mode chip ("⚡ Auto" = autopilot), a speech-to-text mic, and
 *   send / stop.
 *
 * Every piece can be switched off; `<AgentChat>` uses it as its footer.
 */
export const AgentComposer = ({
  controller: agent,
  placeholder,
  model,
  thinking,
  labels: labelsOverride,
  commands = [],
  builtinCommands = true,
  skillCommands = true,
  attachments = true,
  convertFile,
  convert = 'when-needed',
  files: vfs,
  dropZone = 'self',
  speech = true,
  showTimer = true,
  showAgents = true,
  showApprovalMode = true,
  showNotices = true,
  toolbarExtra,
  toolbarEnd,
  renderAttachment,
  disabled = false,
  className,
}: AgentComposerProps) => {
  const L = useLabels(labelsOverride)
  const MODE_CHIP = L.modes
  const DEFAULT_THINKING = thinkingDefaults(L)
  const [text, setText] = useState('')
  const [pending, setPending] = useState<ComposerAttachment[]>([])
  const [menu, setMenu] = useState<Menu>(undefined)
  const [active, setActive] = useState(0)
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set())
  const [attachError, setAttachError] = useState<string | undefined>()
  const [dragging, setDragging] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const busy = agent.isRunning
  const ready = agent.isReady && !disabled
  const caps = agent.agent?.capabilities

  // ── speech-to-text ──────────────────────────────────────────────────────────
  const stt = useSpeechToText({
    lang: typeof speech === 'object' ? speech.lang : undefined,
    onFinal: (heard) => setText((t) => (t.trim() ? `${t.trimEnd()} ${heard}` : heard)),
  })
  const showMic = speech !== false && stt.supported

  // ── run timer ───────────────────────────────────────────────────────────────
  const [startedAt, setStartedAt] = useState<number | undefined>()
  const [now, setNow] = useState(() => Date.now())
  const [lastElapsed, setLastElapsed] = useState<number | undefined>()
  useEffect(() => {
    if (!busy) {
      if (startedAt !== undefined) setLastElapsed(Date.now() - startedAt)
      setStartedAt(undefined)
      return
    }
    const t0 = Date.now()
    setStartedAt(t0)
    setNow(t0)
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy])
  const elapsed = startedAt !== undefined ? now - startedAt : lastElapsed

  // ── commands ────────────────────────────────────────────────────────────────
  const allCommands = useMemo<SlashCommand[]>(() => {
    const out: SlashCommand[] = []
    if (builtinCommands) {
      out.push(
        {
          name: 'compact',
          description: L.commandDescriptions.compact,
          group: L.commandGroups.commands,
          run: () => void agent.compact(),
        },
        {
          name: 'new',
          description: L.commandDescriptions.new,
          group: L.commandGroups.commands,
          run: agent.reset,
        },
        {
          name: 'stop',
          description: L.commandDescriptions.stop,
          group: L.commandGroups.commands,
          run: agent.stop,
        },
        {
          name: 'autopilot',
          description: L.commandDescriptions.autopilot,
          group: L.commandGroups.consent,
          run: () => agent.setApprovalMode('autopilot'),
        },
        {
          name: 'ask',
          description: L.commandDescriptions.ask,
          group: L.commandGroups.consent,
          run: () => agent.setApprovalMode('ask-writes'),
        },
        {
          name: 'ask-all',
          description: L.commandDescriptions.askAll,
          group: L.commandGroups.consent,
          run: () => agent.setApprovalMode('ask-all'),
        },
        {
          name: 'read-only',
          description: L.commandDescriptions.readOnly,
          group: L.commandGroups.consent,
          run: () => agent.setApprovalMode('read-only'),
        },
      )
      if (thinking) {
        const levels = (thinking.options ?? DEFAULT_THINKING).map((o) => o.id)
        out.push({
          name: 'think',
          description: L.commandDescriptions.think(levels.join(' | ')),
          group: L.commandGroups.commands,
          run: (args) => {
            const level = args.trim().toLowerCase()
            if (levels.includes(level)) thinking.onChange(level)
          },
        })
      }
    }
    if (skillCommands) {
      for (const s of agent.agent?.skills ?? []) {
        out.push({
          name: s.name,
          description: s.description,
          group: L.commandGroups.skills,
          kind: 'prefix',
          transform: (args) => `Use the "${s.name}" skill. ${args}`.trim(),
        })
      }
    }
    return [...out, ...commands]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent, builtinCommands, skillCommands, commands, thinking, L])

  const slash = parseSlash(text)
  const matches =
    slash && !/\s/.test(text.trimStart()) ? filterCommands(allCommands, slash.name) : []
  const palette = menu === 'commands' && !slash ? allCommands : matches
  const paletteOpen = palette.length > 0 && (menu === 'commands' || matches.length > 0)

  useEffect(() => setActive(0), [text, menu])

  // Close popovers on an outside click.
  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenu(undefined)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menu])

  const pick = (cmd: SlashCommand) => {
    setMenu(undefined)
    if (cmd.kind === 'prefix') {
      setText(`/${cmd.name} `)
      inputRef.current?.focus()
      return
    }
    const args = parseSlash(text)?.args ?? ''
    setText('')
    void cmd.run?.(args)
  }

  // ── attachments ─────────────────────────────────────────────────────────────
  const attachCfg = typeof attachments === 'object' ? attachments : {}
  const maxBytes = attachCfg.maxBytes ?? 20 * 1024 * 1024
  const imageMax = attachCfg.imageMaxDimension ?? 1568

  const addFiles = async (list: File[]) => {
    const added: ComposerAttachment[] = []
    let problem: string | undefined
    for (const f of list) {
      const mediaType = f.type || 'application/octet-stream'
      const name = f.name || `pasted-${Date.now()}.${mediaType.split('/')[1] ?? 'bin'}`
      const kind = attachmentKindOf(mediaType, name)
      if (f.size > maxBytes) {
        problem = L.tooLarge(name, Math.round(maxBytes / 1024 / 1024))
        continue
      }
      try {
        const id = `att-${(attachSeq += 1)}`
        if (kind === 'text') {
          const content = await f.text()
          if (content.includes('\u0000')) {
            problem = L.binaryText(name)
            continue
          }
          added.push({ id, name, kind, mediaType, text: content, bytes: f.size })
          continue
        }
        // A kind the model can't take: convert it to text when the host can,
        // otherwise refuse with a sentence the user can act on.
        const refusal = attachmentRefusal(kind, caps)
        const wantConvert = convertFile && (refusal || (kind === 'pdf' && convert === 'always'))
        if (wantConvert && convertFile) {
          const converted = await convertFile(f)
          if (converted) {
            added.push({
              id,
              name: converted.name ?? `${name}.md`,
              kind: 'text',
              mediaType: 'text/markdown',
              text: converted.text,
              bytes: converted.text.length,
              note: `converted from ${name}`,
            })
            continue
          }
        }
        if (refusal) {
          problem = refusal
          continue
        }
        // Images go at the size providers bill for, not the camera's.
        const blob =
          kind === 'image' && imageMax !== false
            ? await downscaleImage(f, {
                maxDimension: imageMax,
                maxPixels: attachCfg.imageMaxPixels,
              })
            : f
        added.push({
          id,
          name,
          kind,
          mediaType: blob.type || mediaType,
          dataUrl: await readDataUrl(blob),
          bytes: blob.size,
          ...(blob !== f ? { note: `downscaled from ${L.bytes(f.size)}` } : {}),
        })
      } catch (err) {
        problem = `${name}: ${err instanceof Error ? err.message : String(err)}`
      }
    }
    setAttachError(problem)
    if (added.length) setPending((cur) => [...cur, ...added])
    if (fileRef.current) fileRef.current.value = ''
  }

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (attachments === false) return
    const pasted = Array.from(e.clipboardData?.files ?? [])
    if (pasted.length === 0) return // plain text: let the textarea take it
    e.preventDefault()
    void addFiles(pasted)
  }

  // Drag & drop onto the drop zone (the composer, a panel, or the window).
  const addFilesRef = useRef(addFiles)
  addFilesRef.current = addFiles
  useEffect(() => {
    if (attachments === false) return
    const target: EventTarget | null | undefined =
      dropZone === 'window'
        ? globalThis.window
        : dropZone === 'self'
          ? rootRef.current
          : dropZone.current
    if (!target) return
    let depth = 0
    const hasFiles = (e: Event) =>
      Array.from((e as globalThis.DragEvent).dataTransfer?.types ?? []).includes('Files')
    const onEnter = (e: Event) => {
      if (!hasFiles(e)) return
      depth += 1
      setDragging(true)
    }
    const onOver = (e: Event) => {
      if (hasFiles(e)) e.preventDefault() // allow the drop
    }
    const onLeave = () => {
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const onDropFiles = (e: Event) => {
      const dropped = (e as globalThis.DragEvent).dataTransfer?.files
      depth = 0
      setDragging(false)
      if (!dropped?.length) return
      e.preventDefault()
      void addFilesRef.current(Array.from(dropped))
    }
    target.addEventListener('dragenter', onEnter)
    target.addEventListener('dragover', onOver)
    target.addEventListener('dragleave', onLeave)
    target.addEventListener('drop', onDropFiles)
    return () => {
      target.removeEventListener('dragenter', onEnter)
      target.removeEventListener('dragover', onOver)
      target.removeEventListener('dragleave', onLeave)
      target.removeEventListener('drop', onDropFiles)
    }
  }, [attachments, dropZone])

  // ── submit ──────────────────────────────────────────────────────────────────
  const submit = () => {
    const raw = text.trim()
    if (busy || !ready) return
    const parsed = parseSlash(raw)
    if (parsed) {
      const cmd = allCommands.find((c) => c.name === parsed.name)
      if (cmd?.kind !== 'prefix') {
        if (cmd) {
          setText('')
          void cmd.run?.(parsed.args)
        }
        return
      }
      if (!parsed.args && pending.length === 0) return
      void send(cmd.transform ? cmd.transform(parsed.args) : parsed.args, raw)
      return
    }
    if (!raw && pending.length === 0) return
    void send(raw, raw)
  }

  const send = async (goal: string, shown: string) => {
    if (stt.listening) stt.stop()
    const items = pending
    setText('')
    setPending([])
    // Keep a copy in the workspace, so the agent's fs_* tools can reach it later.
    if (vfs) {
      for (const a of items) {
        const path = `/attachments/${safeName(a.name)}`
        try {
          if (a.dataUrl) await vfs.writeDataUrl(path, a.dataUrl)
          else if (a.text !== undefined) await vfs.write(path, a.text, { mimeType: a.mediaType })
          a.path = path
        } catch {
          /* the message still goes out without the copy */
        }
      }
    }
    const toModel = (a: ComposerAttachment): RunFile => ({
      data: a.dataUrl as string,
      mediaType: a.mediaType,
      name: a.name,
    })
    const shownAttachments: ChatAttachment[] = items.map((a) => ({
      name: a.name,
      mediaType: a.mediaType,
      size: a.bytes,
      ...(a.kind === 'image' && a.dataUrl ? { dataUrl: a.dataUrl } : {}),
      ...(a.path ? { path: a.path } : {}),
    }))
    const full = withAttachments(goal || L.seeAttachments, items)
    // The transcript shows the attachments as chips/thumbnails, not in the text.
    const label = shown || (items.length ? L.attachmentsOnly : '')
    void agent.run(full, {
      ...(full !== label ? { label } : {}),
      images: items.filter((a) => a.kind === 'image' && a.dataUrl).map(toModel),
      files: items.filter((a) => (a.kind === 'pdf' || a.kind === 'file') && a.dataUrl).map(toModel),
      attachments: shownAttachments,
    })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (paletteOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive((i) => (i + 1) % palette.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((i) => (i - 1 + palette.length) % palette.length)
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && matches.length > 0)) {
        e.preventDefault()
        pick(palette[active] ?? palette[0])
        return
      }
      if (e.key === 'Escape') {
        setMenu(undefined)
        setText('')
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  // ── notices ────────────────────────────────────────────────────────────────
  const notices = showNotices
    ? [
        ...noticesOf(agent, L.notices),
        ...(attachError
          ? [{ id: `attach:${attachError}`, tone: 'warn' as const, text: attachError }]
          : []),
        ...(stt.error
          ? [
              {
                id: `stt:${stt.error}`,
                tone: 'warn' as const,
                text: `${L.microphone}: ${stt.error}`,
              },
            ]
          : []),
      ].filter((n) => !dismissed.has(n.id))
    : []

  const runningAgents = agent.subagents.filter((s) => s.status === 'running')
  const thinkingOptions = thinking?.options ?? DEFAULT_THINKING
  const thinkingLabel = thinking
    ? (thinkingOptions.find((o) => o.id === thinking.value)?.label ?? thinking.value)
    : undefined
  const canSend = ready && (text.trim().length > 0 || pending.length > 0)

  return (
    <div
      className={['awr-composer2', dragging ? 'is-dragging' : '', className]
        .filter(Boolean)
        .join(' ')}
      ref={rootRef}
    >
      {dragging && (
        <div className="awr-dropnote" aria-hidden="true">
          {L.dropHint}
        </div>
      )}
      {notices.length > 0 && (
        <div className="awr-notices">
          {notices.map((n) => (
            <div key={n.id} className={`awr-notice awr-notice--${n.tone}`} role="status">
              <span>{n.text}</span>
              <button
                type="button"
                className="awr-iconbtn"
                aria-label={L.dismiss}
                onClick={() => {
                  setDismissed((d) => new Set(d).add(n.id))
                  if (n.id.startsWith('attach:')) setAttachError(undefined)
                }}
              >
                <XIcon size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {paletteOpen && (
        <ul className="awr-menu awr-menu--commands" role="listbox" aria-label={L.commands}>
          {palette.map((c, i) => (
            <li key={`${c.group}:${c.name}`}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                className={`awr-menu__item${i === active ? ' is-active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(c)}
              >
                <code>/{c.name}</code>
                <span className="awr-menu__desc">{c.description}</span>
                {c.group && <span className="awr-menu__group">{c.group}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {pending.length > 0 && (
        <div className="awr-files">
          {pending.map((a) => {
            const remove = () => setPending((cur) => cur.filter((x) => x.id !== a.id))
            if (renderAttachment) return <span key={a.id}>{renderAttachment(a, remove)}</span>
            return (
              <span key={a.id} className="awr-chip awr-file" title={a.note ?? a.mediaType}>
                {a.kind === 'image' && a.dataUrl ? (
                  <img className="awr-file__thumb" src={a.dataUrl} alt={a.name} />
                ) : (
                  <FileIcon size={14} />
                )}
                <span className="awr-file__name">{a.name}</span>
                <button
                  type="button"
                  className="awr-iconbtn"
                  aria-label={L.remove(a.name)}
                  onClick={remove}
                >
                  <XIcon size={12} />
                </button>
              </span>
            )
          })}
        </div>
      )}

      <div className="awr-composer2__inputrow">
        <textarea
          ref={inputRef}
          className="awr-composer2__input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder={stt.listening ? L.listening : (placeholder ?? L.placeholder)}
          disabled={disabled}
          rows={2}
          aria-label={L.message}
        />
        {showMic && (
          <button
            type="button"
            className={`awr-iconbtn awr-mic${stt.listening ? ' is-on' : ''}`}
            aria-label={stt.listening ? L.stopDictation : L.dictate}
            title={stt.listening ? L.stopDictation : L.dictateTitle}
            onClick={stt.toggle}
            disabled={disabled}
          >
            <MicIcon size={18} />
          </button>
        )}
      </div>
      {stt.listening && stt.interim && <div className="awr-composer2__interim">{stt.interim}</div>}

      <div className="awr-toolbar">
        {attachments !== false && (
          <>
            <button
              type="button"
              className="awr-iconbtn"
              aria-label={L.attach}
              title={L.attachTitle}
              onClick={() => fileRef.current?.click()}
              disabled={disabled}
            >
              <PlusIcon size={18} />
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              accept={attachCfg.accept}
              onChange={(e) => void addFiles(Array.from(e.target.files ?? []))}
            />
          </>
        )}
        <button
          type="button"
          className={`awr-iconbtn${menu === 'commands' ? ' is-on' : ''}`}
          aria-label={L.commands}
          title={L.commandsTitle}
          onClick={() => setMenu(menu === 'commands' ? undefined : 'commands')}
        >
          <SlashIcon size={18} />
        </button>
        {toolbarExtra}
        {showTimer && elapsed !== undefined && (
          <span className="awr-tchip" title={busy ? L.timerRunning : L.timerLast}>
            <ClockIcon size={14} /> {formatElapsed(elapsed)}
          </span>
        )}
        {showAgents && (
          <span
            className={`awr-tchip awr-agents${runningAgents.length ? ' is-busy' : ''}`}
            title={
              agent.subagents.length
                ? agent.subagents.map((s) => `${s.name} (${s.status}): ${s.task}`).join('\n')
                : L.agentsTitle
            }
          >
            <span className="awr-agents__dot" aria-hidden="true" />
            <BotIcon size={14} /> {L.agents(runningAgents.length)}
          </span>
        )}
        {(model || thinking) && (
          <span className="awr-popwrap">
            <button
              type="button"
              className="awr-tchip awr-tchip--btn"
              onClick={() => setMenu(menu === 'model' ? undefined : 'model')}
              aria-haspopup="menu"
              aria-expanded={menu === 'model'}
            >
              {model?.label ?? L.model}
              {thinkingLabel && <span className="awr-tchip__sub">{thinkingLabel}</span>}
            </button>
            {menu === 'model' && (
              <div className="awr-menu awr-menu--pop" role="menu">
                {thinking && (
                  <>
                    <div className="awr-menu__head">{L.thinking}</div>
                    {thinkingOptions.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={thinking.value === o.id}
                        className={`awr-menu__item${thinking.value === o.id ? ' is-active' : ''}`}
                        onClick={() => {
                          thinking.onChange(o.id)
                          setMenu(undefined)
                        }}
                      >
                        {o.label}
                      </button>
                    ))}
                  </>
                )}
                {model?.options?.length ? (
                  <>
                    <div className="awr-menu__head">{L.model}</div>
                    {model.options.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={model.value === o.id}
                        className={`awr-menu__item${model.value === o.id ? ' is-active' : ''}`}
                        onClick={() => {
                          model.onSelect?.(o.id)
                          setMenu(undefined)
                        }}
                      >
                        {o.label}
                        {o.group && <span className="awr-menu__group">{o.group}</span>}
                      </button>
                    ))}
                  </>
                ) : null}
              </div>
            )}
          </span>
        )}

        <span className="awr-toolbar__spacer" />
        {toolbarEnd}

        {showApprovalMode && (
          <span className="awr-popwrap">
            <button
              type="button"
              className={`awr-tchip awr-tchip--btn awr-mode awr-mode--${agent.approvalMode}`}
              title={MODE_CHIP[agent.approvalMode].hint}
              onClick={() => setMenu(menu === 'mode' ? undefined : 'mode')}
              aria-haspopup="menu"
              aria-expanded={menu === 'mode'}
              aria-label={`${L.toolConsent}: ${MODE_CHIP[agent.approvalMode].label}`}
            >
              <ModeIcon mode={agent.approvalMode} /> {MODE_CHIP[agent.approvalMode].label}
            </button>
            {menu === 'mode' && (
              <div className="awr-menu awr-menu--pop awr-menu--right" role="menu">
                <div className="awr-menu__head">{L.toolConsent}</div>
                {MODES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="menuitemradio"
                    aria-checked={agent.approvalMode === m}
                    className={`awr-menu__item${agent.approvalMode === m ? ' is-active' : ''}`}
                    onClick={() => {
                      agent.setApprovalMode(m)
                      setMenu(undefined)
                    }}
                  >
                    <ModeIcon mode={m} /> {MODE_CHIP[m].label}
                    <span className="awr-menu__desc">{MODE_CHIP[m].hint}</span>
                  </button>
                ))}
              </div>
            )}
          </span>
        )}

        {busy ? (
          <button
            type="button"
            className="awr-sendbtn awr-sendbtn--stop"
            onClick={agent.stop}
            aria-label={L.stop}
          >
            <StopIcon size={16} />
          </button>
        ) : (
          <button
            type="button"
            className="awr-sendbtn"
            onClick={submit}
            disabled={!canSend}
            aria-label={L.send}
          >
            {agent.status === 'initializing' ? <SpinnerIcon size={16} /> : <SendIcon size={16} />}
          </button>
        )}
      </div>
    </div>
  )
}
