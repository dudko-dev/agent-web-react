import { Fragment } from 'react'
import type { ReactNode } from 'react'
import type { ChatSummary } from '../chat-history.js'
import type { UseChatHistoryReturn } from '../hooks/use-chat-history.js'
import { useLabels, type AgentLabelsOverride } from '../labels.js'
import { PlusIcon, XIcon } from './icons.js'

export interface ChatHistoryListProps {
  /** From `useChatHistory(agent)`. */
  history: UseChatHistoryReturn
  title?: ReactNode
  /** Disable switching (e.g. while a run is in flight). */
  disabled?: boolean
  /** Render an entry yourself; `fallback` is the built-in `<li>` — return it, or your own `<li>`. */
  renderChat?: (chat: ChatSummary, active: boolean, fallback: ReactNode) => ReactNode
  /** Format an entry's time (default: locale date + time). */
  formatTime?: (ms: number) => string
  labels?: AgentLabelsOverride
  className?: string
}

const defaultTime = (ms: number): string => {
  const d = new Date(ms)
  const today = new Date().toDateString() === d.toDateString()
  return today
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString()
}

/** The saved conversations: a "New chat" button, then one row per chat (newest first). */
export const ChatHistoryList = ({
  history,
  title,
  disabled,
  renderChat,
  formatTime = defaultTime,
  labels,
  className,
}: ChatHistoryListProps) => {
  const L = useLabels(labels)
  return (
    <div className={['awr-history', className].filter(Boolean).join(' ')}>
      <div className="awr-panel__head">
        <span className="awr-panel__title">{title ?? L.history}</span>
        <button
          type="button"
          className="awr-btn awr-btn--ghost awr-history__new"
          onClick={history.newChat}
          disabled={disabled}
        >
          <PlusIcon size={14} /> {L.newChat}
        </button>
      </div>
      {!history.loading && history.chats.length === 0 && (
        <div className="awr-panel__empty">{L.historyEmpty}</div>
      )}
      <ul className="awr-history__list">
        {history.chats.map((c) => {
          const active = c.id === history.currentId
          const row = (
            <li key={c.id} className={`awr-history__item${active ? ' is-active' : ''}`}>
              <button
                type="button"
                className="awr-history__open"
                onClick={() => void history.select(c.id)}
                disabled={disabled || active}
                aria-current={active ? 'true' : undefined}
              >
                <span className="awr-history__title">{c.title}</span>
                <span className="awr-history__meta">
                  {formatTime(c.updatedAt)} · {L.messagesCount(c.messageCount)}
                </span>
              </button>
              <button
                type="button"
                className="awr-iconbtn"
                aria-label={`${L.deleteChat}: ${c.title}`}
                title={L.deleteChat}
                onClick={() => void history.remove(c.id)}
                disabled={disabled}
              >
                <XIcon size={14} />
              </button>
            </li>
          )
          return renderChat ? <Fragment key={c.id}>{renderChat(c, active, row)}</Fragment> : row
        })}
      </ul>
    </div>
  )
}
