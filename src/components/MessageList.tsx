import type { ReactNode } from 'react'
import type { ChatMessage } from '../types.js'
import { SpinnerIcon } from './icons.js'

export interface MessageListProps {
  messages: ChatMessage[]
  /** Rendered when there are no messages yet. */
  empty?: ReactNode
  className?: string
}

/** The chat transcript: user and assistant turns, with a streaming indicator. */
export const MessageList = ({ messages, empty, className }: MessageListProps) => {
  if (messages.length === 0) {
    return empty ? <div className="awr-messages__empty">{empty}</div> : null
  }
  return (
    <div className={['awr-messages', className].filter(Boolean).join(' ')}>
      {messages.map((m) => (
        <div key={m.id} className={`awr-msg awr-msg--${m.role}`}>
          <div className="awr-msg__bubble">
            {m.content}
            {m.pending && !m.content && <SpinnerIcon size={14} className="awr-msg__pending" />}
          </div>
        </div>
      ))}
    </div>
  )
}
