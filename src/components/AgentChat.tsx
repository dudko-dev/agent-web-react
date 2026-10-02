import { useEffect, useRef, useState } from 'react'
import type { ComponentType, CSSProperties, ReactNode } from 'react'
import type { VirtualFileSystem } from '@dudko.dev/agent-web'
import { ChatHistoryStore } from '../chat-history.js'
import { useOptionalAgentContext } from '../context.js'
import type { UseAgentReturn } from '../hooks/use-agent.js'
import { useChatHistory, type UseChatHistoryReturn } from '../hooks/use-chat-history.js'
import { AgentLabelsProvider, useLabels, type AgentLabelsOverride } from '../labels.js'
import { AgentComposer, type AgentComposerProps } from './AgentComposer.js'
import { ChatHistoryList, type ChatHistoryListProps } from './ChatHistoryList.js'
import { ContextMeter } from './ContextMeter.js'
import { FilesPanel, type FilesPanelProps } from './FilesPanel.js'
import { AlertIcon, FileIcon, HistoryIcon } from './icons.js'
import { MessageList, type MessageListProps } from './MessageList.js'
import { ModelLoadBar } from './ModelLoadBar.js'
import type { RenderToolCall } from './StepList.js'
import { ToolApprovalPrompt, type ToolApprovalPromptProps } from './ToolApprovalPrompt.js'
import { UsageBadge } from './UsageBadge.js'

/** Places to put your own content in the panel. */
export interface AgentChatSlots {
  /** Replaces the whole header; `false` hides it. */
  header?: ReactNode | false
  /** In the header, before the title. */
  headerStart?: ReactNode
  /** In the header, after the usage badge. */
  headerEnd?: ReactNode
  /** In the body, above / below the transcript. */
  beforeMessages?: ReactNode
  afterMessages?: ReactNode
  /** Above the composer. */
  footerStart?: ReactNode
  /** Under the chat list in the history sidebar. */
  sidebar?: ReactNode
}

/** Swap any built-in part for your own component (same props). */
export interface AgentChatComponents {
  Composer?: ComponentType<AgentComposerProps>
  MessageList?: ComponentType<MessageListProps>
  HistoryList?: ComponentType<ChatHistoryListProps>
  FilesPanel?: ComponentType<FilesPanelProps>
  ApprovalPrompt?: ComponentType<ToolApprovalPromptProps>
}

/** Extra class names per part (added to the built-in `awr-` ones). */
export interface AgentChatClassNames {
  root?: string
  main?: string
  header?: string
  body?: string
  footer?: string
  sidebar?: string
  files?: string
}

export interface AgentChatProps {
  /**
   * An explicit controller from {@link useAgent}. If omitted, the component
   * reads the shared controller from an enclosing `<AgentProvider>`.
   */
  controller?: UseAgentReturn
  title?: ReactNode
  /** Content shown before the first message. */
  emptyState?: ReactNode
  /** @deprecated use `composer={{ placeholder }}` */
  placeholder?: string

  // ── what is shown ──────────────────────────────────────────────────────────
  /** Each answer's steps, thoughts, subagents, consent decisions (default true). */
  showActivity?: boolean
  /** Each tool call inside the activity (default true). */
  showToolCalls?: boolean
  /** Tokens per answer and per tool call (default true). */
  showUsage?: boolean
  /** Thoughts, when the model thinks (default true). */
  showThoughts?: boolean
  /** Conversation total in the header (default true). */
  showTotalUsage?: boolean
  /** Status dot in the header (default true). */
  showStatus?: boolean
  /** Consent-mode chip in the composer — "⚡ Auto" (default true). */
  showApprovalMode?: boolean
  /**
   * Context meter (tokens by kind, budget bar, Compact) above the composer
   * (default false). A number draws the bar against that budget.
   */
  showContext?: boolean | number
  /** Keep finished answers' activity expanded (default false). */
  activityOpen?: boolean

  // ── features ───────────────────────────────────────────────────────────────
  /**
   * Saved conversations in IndexedDB with a sidebar to switch between them:
   * `true` (default store), your own `ChatHistoryStore`, or the result of your
   * own `useChatHistory()` (e.g. to render the list elsewhere).
   */
  history?: boolean | ChatHistoryStore | UseChatHistoryReturn
  /**
   * Sidebar open at first (default: on a wide panel yes; on a narrow one —
   * under `narrowWidth` — it starts closed and opens over the chat).
   */
  defaultHistoryOpen?: boolean
  /**
   * The workspace: attachments are saved here, and a Files panel shows it
   * (add `createFileTools(files)` to the agent's tools so it can use it too).
   */
  files?: VirtualFileSystem
  /** Files panel open at first (default false). */
  defaultFilesOpen?: boolean
  /** Below this width (px) side panels overlay the chat instead of sitting beside it (default 760). */
  narrowWidth?: number
  /** Composer options (model / thinking chips, commands, convertFile, speech…), or `false` to hide it. */
  composer?: Partial<Omit<AgentComposerProps, 'controller'>> | false

  // ── how it is rendered ─────────────────────────────────────────────────────
  /** A message's text — plug in your markdown renderer here. */
  renderContent?: MessageListProps['renderContent']
  renderMessage?: MessageListProps['renderMessage']
  renderAttachment?: MessageListProps['renderAttachment']
  renderToolCall?: RenderToolCall
  renderApproval?: ToolApprovalPromptProps['renderApproval']
  slots?: AgentChatSlots
  components?: AgentChatComponents
  /** Override any text (i18n); applies to every part inside. */
  labels?: AgentLabelsOverride
  /** Force a colour scheme (default 'auto' = follow the OS). */
  theme?: 'auto' | 'light' | 'dark'
  classNames?: AgentChatClassNames
  className?: string
  /** Inline styles on the root — handy for sizing (e.g. `{ height: 520 }`). */
  style?: CSSProperties
}

const isHistoryHook = (h: AgentChatProps['history']): h is UseChatHistoryReturn =>
  typeof h === 'object' && h !== null && 'select' in h && 'chats' in h

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ')

/**
 * A drop-in chat panel: transcript with every answer's activity (steps, tool
 * calls with their cost, thoughts, subagents, consent decisions) and tokens by
 * kind, live consent prompts, model-load progress, and the full composer
 * (attachments by "+", Ctrl+V and drag & drop; slash commands; timer; agents;
 * model + thinking; consent mode; dictation). Optional: saved chats in
 * IndexedDB (`history`) and a workspace panel (`files`).
 *
 * Everything is switchable (`show*`), relabelable (`labels`), replaceable
 * (`render*`, `slots`, `components`) and themable (`theme`, `--awr-*`
 * variables, `classNames`). Give it a `controller` from {@link useAgent}, or
 * wrap it in an {@link AgentProvider}.
 *
 * ```tsx
 * <AgentChat controller={agent} history files={vfs} composer={{ model: { label: 'Gemini' } }} />
 * ```
 */
export const AgentChat = (props: AgentChatProps) => (
  <AgentLabelsProvider labels={props.labels ?? NO_LABELS}>
    <AgentChatInner {...props} />
  </AgentLabelsProvider>
)

const NO_LABELS: AgentLabelsOverride = {}

const AgentChatInner = ({
  controller,
  title,
  emptyState,
  placeholder,
  showActivity = true,
  showToolCalls = true,
  showUsage = true,
  showThoughts = true,
  showTotalUsage = true,
  showStatus = true,
  showApprovalMode = true,
  showContext = false,
  activityOpen = false,
  history,
  defaultHistoryOpen,
  files,
  defaultFilesOpen = false,
  narrowWidth = 760,
  composer,
  renderContent,
  renderMessage,
  renderAttachment,
  renderToolCall,
  renderApproval,
  slots = {},
  components = {},
  theme = 'auto',
  classNames = {},
  className,
  style,
}: AgentChatProps) => {
  const ctx = useOptionalAgentContext()
  const agent = controller ?? ctx
  if (!agent) {
    throw new Error(
      '<AgentChat> needs a `controller` prop from useAgent(), or an enclosing <AgentProvider>.',
    )
  }
  const L = useLabels()

  // History: an external hook result, or our own over the given / default store.
  const external = isHistoryHook(history) ? history : undefined
  const [ownStore] = useState(() =>
    history instanceof ChatHistoryStore ? history : new ChatHistoryStore(),
  )
  const own = useChatHistory(agent, {
    store: ownStore,
    enabled: Boolean(history) && !external,
  })
  const chats = history ? (external ?? own) : undefined

  // Narrow panel → the side panels overlay the chat (and start closed).
  const rootRef = useRef<HTMLDivElement>(null)
  const [narrow, setNarrow] = useState<boolean | undefined>(undefined)
  useEffect(() => {
    const el = rootRef.current
    if (!el || typeof ResizeObserver === 'undefined') return setNarrow(false)
    const measure = () => setNarrow(el.getBoundingClientRect().width < narrowWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [narrowWidth])
  const [historyChoice, setHistoryOpen] = useState<boolean | undefined>(defaultHistoryOpen)
  const historyOpen = historyChoice ?? narrow === false
  const [filesOpen, setFilesOpen] = useState(defaultFilesOpen)
  // On a narrow panel one overlay at a time.
  const toggleHistory = () => {
    setHistoryOpen(!historyOpen)
    if (narrow && !historyOpen) setFilesOpen(false)
  }
  const toggleFiles = () => {
    setFilesOpen((o) => !o)
    if (narrow && !filesOpen) setHistoryOpen(false)
  }

  // Follow the transcript while the user is at the bottom; leave them be when
  // they scrolled up to read.
  const bodyRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)
  useEffect(() => {
    const el = bodyRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [agent.messages, agent.steps, agent.finalText, agent.modelLoad, agent.pendingApprovals])

  const [compacting, setCompacting] = useState(false)
  const compact = () => {
    setCompacting(true)
    void agent.compact().finally(() => setCompacting(false))
  }

  const Composer = components.Composer ?? AgentComposer
  const Messages = components.MessageList ?? MessageList
  const HistoryList = components.HistoryList ?? ChatHistoryList
  const Files = components.FilesPanel ?? FilesPanel
  const Approvals = components.ApprovalPrompt ?? ToolApprovalPrompt

  const loading = agent.modelLoad && agent.modelLoad.progress < 1
  const showReplan = agent.replan && agent.replan.mode !== 'continue'
  const liveExtra =
    agent.planThought.trim() || showReplan ? (
      <>
        {agent.planThought.trim() && (
          <details className="awr-activity__plan">
            <summary>{L.planned}</summary>
            <p className="awr-activity__thought">{agent.planThought}</p>
          </details>
        )}
        {showReplan && (
          <div className="awr-activity__replan">
            {L.replanned(agent.replan!.mode, agent.replan!.reason)}
          </div>
        )}
      </>
    ) : undefined

  const header =
    slots.header === false ? null : slots.header !== undefined ? (
      slots.header
    ) : (
      <div className={cx('awr-chat__header', classNames.header)}>
        {chats && (
          <button
            type="button"
            className={cx('awr-iconbtn', historyOpen && 'is-on')}
            aria-label={L.showHistory}
            title={L.showHistory}
            aria-pressed={historyOpen}
            onClick={toggleHistory}
          >
            <HistoryIcon size={16} />
          </button>
        )}
        {slots.headerStart}
        <div className="awr-chat__title">{title}</div>
        {showStatus && (
          <span className={`awr-status awr-status--${agent.status}`} title={L.status[agent.status]}>
            <span className="awr-status__dot" />
            <span className="awr-status__text">{L.status[agent.status]}</span>
          </span>
        )}
        {showTotalUsage && (
          <span title={L.totalUsage}>
            <UsageBadge usage={agent.totalUsage} />
          </span>
        )}
        {files && (
          <button
            type="button"
            className={cx('awr-iconbtn', filesOpen && 'is-on')}
            aria-label={L.showFiles}
            title={L.showFiles}
            aria-pressed={filesOpen}
            onClick={toggleFiles}
          >
            <FileIcon size={16} />
          </button>
        )}
        {slots.headerEnd}
      </div>
    )

  return (
    <div
      ref={rootRef}
      className={cx('awr-chat', narrow && 'awr-chat--narrow', className, classNames.root)}
      style={style}
      data-awr-theme={theme === 'auto' ? undefined : theme}
    >
      {chats && historyOpen && (
        <aside className={cx('awr-chat__sidebar', classNames.sidebar)}>
          <HistoryList
            history={{
              ...chats,
              // Picking a chat on a narrow panel closes the overlay.
              select: async (id) => {
                await chats.select(id)
                if (narrow) setHistoryOpen(false)
              },
              newChat: () => {
                chats.newChat()
                if (narrow) setHistoryOpen(false)
              },
            }}
            disabled={agent.isRunning}
          />
          {slots.sidebar}
          <button
            type="button"
            className="awr-iconbtn awr-chat__closeside"
            aria-label={L.close}
            onClick={() => setHistoryOpen(false)}
          >
            ×
          </button>
        </aside>
      )}

      <div className={cx('awr-chat__main', classNames.main)}>
        {header}

        <div
          className={cx('awr-chat__body', classNames.body)}
          ref={bodyRef}
          onScroll={(e) => {
            const el = e.currentTarget
            stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
          }}
        >
          {slots.beforeMessages}
          <Messages
            messages={agent.messages}
            empty={emptyState ?? L.emptyState}
            showActivity={showActivity}
            showToolCalls={showToolCalls}
            showUsage={showUsage}
            showThoughts={showThoughts}
            activityOpen={activityOpen}
            liveExtra={liveExtra}
            renderContent={renderContent}
            renderMessage={renderMessage}
            renderAttachment={renderAttachment}
            renderToolCall={renderToolCall}
          />
          <Approvals
            approvals={agent.pendingApprovals}
            onApprove={agent.approve}
            onDeny={agent.deny}
            renderApproval={renderApproval}
          />
          {agent.modelLoad && loading && <ModelLoadBar load={agent.modelLoad} />}
          {slots.afterMessages}
        </div>

        <div className={cx('awr-chat__footer', classNames.footer)}>
          {slots.footerStart}
          {showContext !== false && (
            <ContextMeter
              usage={agent.usage}
              budgetTokens={typeof showContext === 'number' ? showContext : undefined}
              budget={agent.budget}
              compactions={agent.compactions}
              onCompact={agent.isRunning ? undefined : compact}
              compacting={compacting}
            />
          )}
          {composer === false ? (
            agent.error &&
            agent.status === 'error' && (
              <div className="awr-chat__error">
                <AlertIcon size={14} /> {agent.error}
              </div>
            )
          ) : (
            <Composer
              controller={agent}
              showApprovalMode={showApprovalMode}
              files={files}
              dropZone={rootRef}
              {...(placeholder ? { placeholder } : {})}
              {...composer}
            />
          )}
        </div>
      </div>

      {files && filesOpen && (
        <aside className={cx('awr-chat__files', classNames.files)}>
          <Files files={files} />
          <button
            type="button"
            className="awr-iconbtn awr-chat__closeside"
            aria-label={L.close}
            onClick={() => setFilesOpen(false)}
          >
            ×
          </button>
        </aside>
      )}
    </div>
  )
}
