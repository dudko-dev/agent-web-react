import { useEffect, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useOptionalAgentContext } from '../context.js'
import type { UseAgentReturn } from '../hooks/use-agent.js'
import { AlertIcon } from './icons.js'
import { Composer } from './Composer.js'
import { MessageList } from './MessageList.js'
import { ModelLoadBar } from './ModelLoadBar.js'
import { StepList } from './StepList.js'
import { UsageBadge } from './UsageBadge.js'

export interface AgentChatProps {
  /**
   * An explicit controller from {@link useAgent}. If omitted, the component
   * reads the shared controller from an enclosing `<AgentProvider>`.
   */
  controller?: UseAgentReturn
  title?: ReactNode
  placeholder?: string
  /** Render the internal plan/step activity while the agent works (default true). */
  showActivity?: boolean
  /** Render the token-usage badge in the footer (default true). */
  showUsage?: boolean
  /** Content shown before the first message. */
  emptyState?: ReactNode
  className?: string
  /** Inline styles on the root — handy for sizing (e.g. `{ height: 520 }`). */
  style?: CSSProperties
}

const statusLabel = (status: UseAgentReturn['status']): string => {
  switch (status) {
    case 'initializing':
      return 'Loading model…'
    case 'running':
      return 'Working…'
    case 'error':
      return 'Failed to start'
    default:
      return 'Ready'
  }
}

/**
 * A drop-in chat panel: transcript, live plan/step activity with tool calls, a
 * streamed final answer, model-load progress, token usage, and a composer with
 * a stop button. Give it a `controller` from {@link useAgent}, or wrap it in an
 * {@link AgentProvider} and it will find one.
 *
 * ```tsx
 * <AgentProvider config={{ model, tools, credentials }}>
 *   <AgentChat title="Assistant" />
 * </AgentProvider>
 * ```
 */
export const AgentChat = ({
  controller,
  title,
  placeholder,
  showActivity = true,
  showUsage = true,
  emptyState = 'Ask the agent to do something.',
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

  const bodyRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = bodyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [agent.messages, agent.steps, agent.finalText, agent.modelLoad])

  const showReplan = agent.replan && agent.replan.mode !== 'continue'
  const loading = agent.modelLoad && agent.modelLoad.progress < 1 && agent.isRunning === false

  return (
    <div className={['awr-chat', className].filter(Boolean).join(' ')} style={style}>
      {title && <div className="awr-chat__title">{title}</div>}

      <div className="awr-chat__body" ref={bodyRef}>
        <MessageList messages={agent.messages} empty={emptyState} />

        {showActivity && (agent.steps.length > 0 || agent.planThought) && (
          <div className="awr-activity">
            {agent.planThought.trim() && (
              <details className="awr-activity__plan">
                <summary>Plan</summary>
                <p className="awr-activity__thought">{agent.planThought}</p>
              </details>
            )}
            <StepList steps={agent.steps} />
            {showReplan && (
              <div className="awr-activity__replan">
                Replanned ({agent.replan!.mode}): {agent.replan!.reason}
              </div>
            )}
          </div>
        )}

        {agent.modelLoad && (loading || agent.isRunning) && agent.modelLoad.progress < 1 && (
          <ModelLoadBar load={agent.modelLoad} />
        )}
      </div>

      {agent.error && agent.status === 'error' && (
        <div className="awr-chat__error">
          <AlertIcon size={14} /> {agent.error}
        </div>
      )}

      <div className="awr-chat__footer">
        <div className="awr-chat__meta">
          <span className={`awr-status awr-status--${agent.status}`}>
            <span className="awr-status__dot" />
            {statusLabel(agent.status)}
          </span>
          {showUsage && <UsageBadge usage={agent.usage} />}
        </div>
        <Composer
          onSubmit={(text) => void agent.run(text)}
          busy={agent.isRunning}
          onStop={agent.stop}
          disabled={!agent.isReady && !agent.isRunning}
          placeholder={placeholder}
        />
      </div>
    </div>
  )
}
