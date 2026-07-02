import type { StepView, ToolCallView } from '../types.js'
import { previewValue } from './format.js'
import { AlertIcon, CheckIcon, SpinnerIcon, ToolIcon } from './icons.js'

const ToolCallRow = ({ call }: { call: ToolCallView }) => {
  const state = call.status === 'calling' ? 'calling' : call.ok === false ? 'failed' : 'ok'
  return (
    <li className={`awr-tool awr-tool--${state}`}>
      <ToolIcon size={13} className="awr-tool__icon" />
      <code className="awr-tool__name">{call.name}</code>
      {previewValue(call.input) && (
        <span className="awr-tool__args">{previewValue(call.input)}</span>
      )}
      {call.status === 'calling' && <SpinnerIcon size={12} className="awr-tool__spin" />}
      {call.status === 'done' && call.ok === false && (
        <span className="awr-tool__badge">failed</span>
      )}
    </li>
  )
}

const StepItem = ({ step }: { step: StepView }) => (
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
    {step.text.trim() && <p className="awr-step__text">{step.text.trim()}</p>}
    {step.toolCalls.length > 0 && (
      <ul className="awr-step__tools">
        {step.toolCalls.map((call, i) => (
          <ToolCallRow key={i} call={call} />
        ))}
      </ul>
    )}
    {step.blocked && step.summary && <p className="awr-step__blocked">{step.summary}</p>}
  </li>
)

export interface StepListProps {
  steps: StepView[]
  className?: string
}

/** The live execution: each step, its streamed text, and its tool calls. */
export const StepList = ({ steps, className }: StepListProps) => {
  if (steps.length === 0) return null
  return (
    <ol className={['awr-steps', className].filter(Boolean).join(' ')}>
      {steps.map((step) => (
        <StepItem key={step.id} step={step} />
      ))}
    </ol>
  )
}
