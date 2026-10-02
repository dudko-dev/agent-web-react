import type { IUsage } from '@dudko.dev/agent-web'
import { formatTokens } from './format.js'

export interface UsageBadgeProps {
  usage: IUsage
  /** Only in ↑ out ↓ (the rest stays in the tooltip) — for tight headers. */
  compact?: boolean
  className?: string
}

/**
 * A compact token-usage readout: in ↑ out ↓, plus thinking (🧠) and cache-hit
 * tokens when the provider reported any. The full breakdown is on hover.
 */
export const UsageBadge = ({ usage, compact = false, className }: UsageBadgeProps) => {
  if (usage.totalTokens === 0) return null
  const reasoning = usage.reasoningTokens ?? 0
  const cached = usage.cachedInputTokens ?? 0
  const title = [
    `${usage.inputTokens} in + ${usage.outputTokens} out = ${usage.totalTokens} tokens`,
    reasoning ? `${reasoning} thinking` : '',
    cached ? `${cached} input tokens from the prompt cache` : '',
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <span className={['awr-usage', className].filter(Boolean).join(' ')} title={title}>
      {formatTokens(usage.inputTokens)}↑ {formatTokens(usage.outputTokens)}↓
      {!compact && reasoning > 0 && ` · ${formatTokens(reasoning)} think`}
      {!compact && cached > 0 && ` · ${formatTokens(cached)} cached`}
    </span>
  )
}
