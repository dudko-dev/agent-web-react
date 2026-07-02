import type { IUsage } from '@dudko.dev/agent-web'

export interface UsageBadgeProps {
  usage: IUsage
  className?: string
}

const fmt = (n: number): string =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n)

/** A compact token-usage readout (in → out, and total on hover). */
export const UsageBadge = ({ usage, className }: UsageBadgeProps) => {
  if (usage.totalTokens === 0) return null
  return (
    <span
      className={['awr-usage', className].filter(Boolean).join(' ')}
      title={`${usage.inputTokens} in + ${usage.outputTokens} out = ${usage.totalTokens} tokens`}
    >
      {fmt(usage.inputTokens)}↑ {fmt(usage.outputTokens)}↓
    </span>
  )
}
