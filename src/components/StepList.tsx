import { Fragment } from 'react'
import type { ReactNode } from 'react'
import { useLabels, type AgentLabels, type AgentLabelsOverride } from '../labels.js'
import type { ApprovalView, StepView, SubagentView, ToolCallView } from '../types.js'
import { formatDuration, formatTokens, imagesInOutput, previewValue } from './format.js'
import {
  AlertIcon,
  BotIcon,
  BrainIcon,
  CheckIcon,
  ShieldIcon,
  SpinnerIcon,
  ToolIcon,
} from './icons.js'

/** Render a tool call yourself; `fallback` is the built-in `<li>` row — return it, or your own `<li>`. */
export type RenderToolCall = (call: ToolCallView, fallback: ReactNode) => ReactNode

export interface ToolCallRowProps {
  call: ToolCallView
  showUsage?: boolean
  labels?: AgentLabelsOverride
}

/** One tool call: name, arguments, status — and optionally its cost and any images it returned. */
export const ToolCallRow = ({ call, showUsage = true, labels }: ToolCallRowProps) => {
  const L = useLabels(labels)
  const state = call.status === 'calling' ? 'calling' : call.ok === false ? 'failed' : 'ok'
  const images = call.ok === false ? [] : imagesInOutput(call.output).slice(0, 4)
  const cost = [
    call.inputTokens ? `≈${formatTokens(call.inputTokens)} in` : '',
    call.outputTokens ? `≈${formatTokens(call.outputTokens)} out` : '',
    call.durationMs !== undefined ? formatDuration(call.durationMs) : '',
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <li className={`awr-tool awr-tool--${state}`}>
      <div className="awr-tool__row">
        <ToolIcon size={13} className="awr-tool__icon" />
        <code className="awr-tool__name">{call.name}</code>
        {previewValue(call.input) && (
          <span className="awr-tool__args">{previewValue(call.input)}</span>
        )}
        {call.status === 'calling' && <SpinnerIcon size={12} className="awr-tool__spin" />}
        {call.status === 'done' && call.ok === false && (
          <span className="awr-tool__badge">{L.failed}</span>
        )}
        {showUsage && cost && (
          <span className="awr-tool__cost" title={L.toolCostTitle}>
            {cost}
          </span>
        )}
      </div>
      {images.length > 0 && (
        <div className="awr-tool__images">
          {images.map((src, i) => (
            <a key={i} href={src} target="_blank" rel="noreferrer">
              <img className="awr-thumb" src={src} alt={`${call.name} result ${i + 1}`} />
            </a>
          ))}
        </div>
      )}
    </li>
  )
}

/** A subagent delegation: name, task, live activity, and its answer when done. */
export const SubagentRow = ({
  sub,
  labels,
}: {
  sub: SubagentView
  labels?: AgentLabelsOverride
}) => {
  const L = useLabels(labels)
  return (
    <li className={`awr-subagent awr-subagent--${sub.status}`}>
      <div className="awr-subagent__head">
        <BotIcon size={13} className="awr-subagent__icon" />
        <span className="awr-subagent__name">{sub.name}</span>
        <span className="awr-subagent__task" title={sub.task}>
          {previewValue(sub.task, 90)}
        </span>
        {sub.status === 'running' && <SpinnerIcon size={12} className="awr-tool__spin" />}
      </div>
      <div className="awr-subagent__activity">
        {sub.status === 'error'
          ? sub.error
          : sub.status === 'done'
            ? previewValue(sub.text, 160)
            : `${sub.activity}${sub.toolCalls ? ` · ${L.toolCalls(sub.toolCalls)}` : ''}`}
      </div>
    </li>
  )
}

const decisionLabel = (a: ApprovalView, L: AgentLabels): string =>
  a.status === 'pending'
    ? L.consentWaiting
    : a.status === 'approved'
      ? L.consentAllowed
      : L.consentDenied(a.reason)

interface StepItemProps {
  step: StepView
  subagents: SubagentView[]
  approvals: ApprovalView[]
  showToolCalls: boolean
  showUsage: boolean
  showThoughts: boolean
  renderToolCall?: RenderToolCall
  L: AgentLabels
}

const StepItem = ({
  step,
  subagents,
  approvals,
  showToolCalls,
  showUsage,
  showThoughts,
  renderToolCall,
  L,
}: StepItemProps) => (
  <li className={`awr-step awr-step--${step.blocked ? 'blocked' : step.status}`}>
    <div className="awr-step__head">
      <span className="awr-step__marker">
        {step.status === 'running' ? (
          <SpinnerIcon size={14} />
        ) : step.blocked ? (
          <AlertIcon size={14} />
        ) : (
          <CheckIcon size={14} />
        )}
      </span>
      <span className="awr-step__index">
        {step.index}/{step.total}
      </span>
      <span className="awr-step__desc">{step.step.description}</span>
    </div>
    {showThoughts && step.reasoning.trim() && (
      <details className="awr-thought" open={step.status === 'running' && !step.text}>
        <summary>
          <BrainIcon size={13} /> {L.stepThoughts}
        </summary>
        <p className="awr-thought__text">{step.reasoning.trim()}</p>
      </details>
    )}
    {step.text.trim() && <p className="awr-step__text">{step.text.trim()}</p>}
    {showToolCalls && step.toolCalls.length > 0 && (
      <ul className="awr-step__tools">
        {step.toolCalls.map((call, i) => {
          const row = <ToolCallRow key={i} call={call} showUsage={showUsage} />
          return renderToolCall ? <Fragment key={i}>{renderToolCall(call, row)}</Fragment> : row
        })}
      </ul>
    )}
    {approvals.length > 0 && (
      <ul className="awr-step__tools">
        {approvals.map((a) => (
          <li key={a.id} className={`awr-tool awr-tool__row awr-tool--approval-${a.status}`}>
            <ShieldIcon size={13} className="awr-tool__icon" />
            <code className="awr-tool__name">{a.name}</code>
            <span className="awr-tool__args">{decisionLabel(a, L)}</span>
          </li>
        ))}
      </ul>
    )}
    {subagents.length > 0 && (
      <ul className="awr-subagents">
        {subagents.map((sub) => (
          <SubagentRow key={sub.id} sub={sub} />
        ))}
      </ul>
    )}
    {step.blocked && step.summary && <p className="awr-step__blocked">{step.summary}</p>}
  </li>
)

export interface StepListProps {
  steps: StepView[]
  /** Subagent delegations (`agent.subagents`) — shown under the step that made them. */
  subagents?: SubagentView[]
  /** Consent decisions (`agent.approvals`) — shown under their step. */
  approvals?: ApprovalView[]
  /** Show each tool call (default true). */
  showToolCalls?: boolean
  /** Show each tool call's ≈tokens and duration (default true). */
  showUsage?: boolean
  /** Show each step's thoughts when the model thinks (default true). */
  showThoughts?: boolean
  /** Render tool calls yourself (gets the built-in row as `fallback`). */
  renderToolCall?: RenderToolCall
  labels?: AgentLabelsOverride
  className?: string
}

/**
 * The live execution: each step, its thoughts, streamed text, tool calls,
 * consent decisions and subagent delegations.
 */
export const StepList = ({
  steps,
  subagents = [],
  approvals = [],
  showToolCalls = true,
  showUsage = true,
  showThoughts = true,
  renderToolCall,
  labels,
  className,
}: StepListProps) => {
  const L = useLabels(labels)
  if (steps.length === 0) return null
  return (
    <ol className={['awr-steps', className].filter(Boolean).join(' ')}>
      {steps.map((step) => (
        <StepItem
          key={step.id}
          step={step}
          subagents={subagents.filter((s) => s.stepId === step.id)}
          approvals={approvals.filter((a) => a.stepId === step.id && a.status !== 'pending')}
          showToolCalls={showToolCalls}
          showUsage={showUsage}
          showThoughts={showThoughts}
          renderToolCall={renderToolCall}
          L={L}
        />
      ))}
    </ol>
  )
}
