import type { ReactNode } from 'react'
import type { IUsage } from '@dudko.dev/agent-web'
import { useLabels, type AgentLabels, type AgentLabelsOverride } from '../labels.js'
import type { ChatAttachment, ChatMessage } from '../types.js'
import { formatDuration, formatTokens } from './format.js'
import { BrainIcon, FileIcon, SpinnerIcon } from './icons.js'
import { StepList, type RenderToolCall } from './StepList.js'

export interface MessageListProps {
  messages: ChatMessage[]
  /** Rendered when there are no messages yet. */
  empty?: ReactNode
  /** Each answer's steps, thoughts, subagents and consent decisions (default true). */
  showActivity?: boolean
  /** Each tool call inside the activity (default true). */
  showToolCalls?: boolean
  /** Tokens per answer and per tool call (default true). */
  showUsage?: boolean
  /** Thoughts (step + answer) when the model thinks (default true). */
  showThoughts?: boolean
  /** Open the activity of finished answers too (default: only while it runs). */
  activityOpen?: boolean
  /** Extra content under the latest assistant turn while it streams (plan thought, …). */
  liveExtra?: ReactNode
  /**
   * A message's text — e.g. through your markdown renderer. Default: plain
   * text, line breaks kept.
   */
  renderContent?: (message: ChatMessage) => ReactNode
  /** A whole message; `fallback` is the built-in one, to wrap or ignore. */
  renderMessage?: (message: ChatMessage, fallback: ReactNode) => ReactNode
  /** An attachment shown with a message (thumbnail / chip by default). */
  renderAttachment?: (attachment: ChatAttachment, message: ChatMessage) => ReactNode
  /** Tool calls inside the activity. */
  renderToolCall?: RenderToolCall
  labels?: AgentLabelsOverride
  className?: string
}

/** "in 12k · out 456 · think 120 · cached 9k · 4.2 s" for one answer. */
export const usageLine = (usage: IUsage | undefined, durationMs?: number): string => {
  const parts: string[] = []
  if (usage && usage.totalTokens > 0) {
    parts.push(`in ${formatTokens(usage.inputTokens)}`, `out ${formatTokens(usage.outputTokens)}`)
    if (usage.reasoningTokens) parts.push(`think ${formatTokens(usage.reasoningTokens)}`)
    if (usage.cachedInputTokens) parts.push(`cached ${formatTokens(usage.cachedInputTokens)}`)
  }
  if (durationMs !== undefined) parts.push(formatDuration(durationMs))
  return parts.join(' · ')
}

/** The built-in attachment: an image thumbnail (opens full size) or a file chip. */
export const AttachmentView = ({ attachment: a }: { attachment: ChatAttachment }) =>
  a.dataUrl && a.mediaType.startsWith('image/') ? (
    <a href={a.dataUrl} target="_blank" rel="noreferrer" title={a.path ?? a.name}>
      <img className="awr-thumb awr-thumb--msg" src={a.dataUrl} alt={a.name} />
    </a>
  ) : (
    <span className="awr-chip awr-file" title={a.path ?? a.mediaType}>
      <FileIcon size={13} /> {a.name}
    </span>
  )

const toolCallCount = (m: ChatMessage): number =>
  (m.steps ?? []).reduce((n, s) => n + s.toolCalls.length, 0)

const activitySummary = (m: ChatMessage, showToolCalls: boolean, L: AgentLabels): string => {
  const steps = m.steps ?? []
  const parts = [L.steps(steps.length)]
  if (showToolCalls) parts.push(L.toolCalls(toolCallCount(m)))
  if (m.subagents?.length) parts.push(L.subagents(m.subagents.length))
  if (m.skills?.length) parts.push(L.skillsUsed(m.skills.join(', ')))
  return parts.join(' · ')
}

/**
 * The chat transcript. User turns show their text and attachments (image
 * thumbnails, file chips); every assistant turn keeps its own activity — the
 * steps with each tool call (≈tokens, duration, returned images), thoughts,
 * subagents, consent decisions — and the tokens it spent by kind. Every part
 * can be hidden, relabelled or rendered by the host.
 */
export const MessageList = ({
  messages,
  empty,
  showActivity = true,
  showToolCalls = true,
  showUsage = true,
  showThoughts = true,
  activityOpen = false,
  liveExtra,
  renderContent,
  renderMessage,
  renderAttachment,
  renderToolCall,
  labels,
  className,
}: MessageListProps) => {
  const L = useLabels(labels)
  if (messages.length === 0) {
    return empty ? <div className="awr-messages__empty">{empty}</div> : null
  }
  return (
    <div className={['awr-messages', className].filter(Boolean).join(' ')}>
      {messages.map((m) => {
        const steps = m.steps ?? []
        const hasActivity =
          showActivity &&
          (steps.length > 0 || (m.subagents?.length ?? 0) > 0 || (m.pending && !!liveExtra))
        const usage = showUsage ? usageLine(m.usage, m.durationMs) : ''
        const node = (
          <div
            key={m.id}
            className={`awr-msg awr-msg--${m.role}${m.error ? ' awr-msg--error' : ''}${m.pending ? ' is-pending' : ''}`}
          >
            <div className="awr-msg__col">
              {m.role === 'assistant' && hasActivity && (
                <details className="awr-activity" open={m.pending || activityOpen}>
                  <summary className="awr-activity__summary">
                    {activitySummary(m, showToolCalls, L)}
                  </summary>
                  {m.pending && liveExtra}
                  <StepList
                    steps={steps}
                    subagents={m.subagents}
                    approvals={m.approvals}
                    showToolCalls={showToolCalls}
                    showUsage={showUsage}
                    showThoughts={showThoughts}
                    renderToolCall={renderToolCall}
                    labels={labels}
                  />
                  {showThoughts && m.reasoning?.trim() && (
                    <details className="awr-thought">
                      <summary>
                        <BrainIcon size={13} /> {L.answerThoughts}
                      </summary>
                      <p className="awr-thought__text">{m.reasoning.trim()}</p>
                    </details>
                  )}
                </details>
              )}
              {(m.content || m.pending || !m.attachments?.length) && (
                <div className="awr-msg__bubble">
                  {m.content ? (renderContent ? renderContent(m) : m.content) : null}
                  {m.pending && !m.content && (
                    <SpinnerIcon size={14} className="awr-msg__pending" />
                  )}
                </div>
              )}
              {m.attachments?.length ? (
                <div className="awr-msg__attachments" aria-label={L.attachments}>
                  {m.attachments.map((a, i) => (
                    <span key={i} className="awr-msg__attachment">
                      {renderAttachment ? (
                        renderAttachment(a, m)
                      ) : (
                        <AttachmentView attachment={a} />
                      )}
                    </span>
                  ))}
                </div>
              ) : null}
              {m.role === 'assistant' && usage && !m.pending && (
                <div className="awr-msg__usage" title={L.usageTitle}>
                  {usage}
                </div>
              )}
            </div>
          </div>
        )
        return renderMessage ? <div key={m.id}>{renderMessage(m, node)}</div> : node
      })}
    </div>
  )
}
