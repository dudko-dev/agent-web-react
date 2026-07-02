import type { IPlan } from '@dudko.dev/agent-web'

export interface PlanViewProps {
  plan: IPlan
  /** Also render the planner's reasoning ("thought"). Default true. */
  showThought?: boolean
  className?: string
}

/** The plan the agent produced: its reasoning and the ordered step list. */
export const PlanView = ({ plan, showThought = true, className }: PlanViewProps) => {
  if (!plan.steps.length && !plan.thought) return null
  return (
    <div className={['awr-plan', className].filter(Boolean).join(' ')}>
      {showThought && plan.thought.trim() && <p className="awr-plan__thought">{plan.thought}</p>}
      {plan.steps.length > 0 && (
        <ol className="awr-plan__steps">
          {plan.steps.map((step) => (
            <li key={step.id} className="awr-plan__step">
              {step.description}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
