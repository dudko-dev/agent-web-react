import type { IUsage } from '@dudko.dev/agent-web'
import type { BudgetView, CompactionView } from '../types.js'
import { formatTokens } from './format.js'

export interface ContextMeterProps {
  usage: IUsage
  /** A run budget to draw the bar against (e.g. limits.maxTotalTokens). */
  budgetTokens?: number
  /** The limit that stopped the run, if any. */
  budget?: BudgetView
  compactions?: CompactionView[]
  /** Show a "Compact" button (e.g. `agent.compact`). */
  onCompact?: () => void
  compacting?: boolean
  className?: string
}

/**
 * Where the run's tokens went — input, output, thinking, prompt-cache hits —
 * with an optional budget bar, the last compaction and a "Compact" button.
 */
export const ContextMeter = ({
  usage,
  budgetTokens,
  budget,
  compactions = [],
  onCompact,
  compacting,
  className,
}: ContextMeterProps) => {
  const cached = usage.cachedInputTokens ?? 0
  const reasoning = usage.reasoningTokens ?? 0
  const hitRate = usage.inputTokens > 0 ? Math.round((cached / usage.inputTokens) * 100) : 0
  const fill = budgetTokens ? Math.min(1, usage.totalTokens / budgetTokens) : undefined
  const last = compactions.at(-1)
  return (
    <div className={['awr-context', className].filter(Boolean).join(' ')}>
      <div className="awr-context__row">
        <span title="input tokens">in {formatTokens(usage.inputTokens)}</span>
        <span title="output tokens">out {formatTokens(usage.outputTokens)}</span>
        <span title="thinking tokens">think {formatTokens(reasoning)}</span>
        <span title="input tokens served from the provider's prompt cache">
          cached {formatTokens(cached)}
          {hitRate > 0 ? ` (${hitRate}%)` : ''}
        </span>
        {onCompact && (
          <button
            type="button"
            className="awr-btn awr-btn--ghost awr-context__compact"
            onClick={onCompact}
            disabled={compacting}
          >
            {compacting ? 'Compacting…' : 'Compact'}
          </button>
        )}
      </div>
      {fill !== undefined && (
        <div
          className={`awr-context__track${fill >= 1 ? ' is-full' : ''}`}
          title={`${usage.totalTokens} / ${budgetTokens} tokens`}
        >
          <div className="awr-context__fill" style={{ width: `${fill * 100}%` }} />
        </div>
      )}
      {budget && (
        <div className="awr-context__note awr-context__note--warn">
          {budget.kind === 'tool-calls' ? 'Tool-call' : `${budget.kind} token`} limit reached (
          {budget.tokens}/{budget.cap}) — the agent stopped early.
        </div>
      )}
      {last && (
        <div className="awr-context__note">
          Compacted {last.scope}: {formatTokens(last.beforeTokens)} →{' '}
          {formatTokens(last.afterTokens)} tokens
        </div>
      )}
    </div>
  )
}
