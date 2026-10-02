import type { ToolApprovalMode } from '@dudko.dev/agent-web'

export interface ApprovalModeSwitchProps {
  mode: ToolApprovalMode
  onChange: (mode: ToolApprovalMode) => void
  /** Which modes to offer, in order (default: all four). */
  modes?: ToolApprovalMode[]
  /** Override the button labels. */
  labels?: Partial<Record<ToolApprovalMode, string>>
  disabled?: boolean
  className?: string
}

const DEFAULT_LABELS: Record<ToolApprovalMode, string> = {
  autopilot: 'Autopilot',
  'ask-writes': 'Ask before changes',
  'ask-all': 'Ask always',
  'read-only': 'Read-only',
}

const HINTS: Record<ToolApprovalMode, string> = {
  autopilot: 'Run every tool without asking',
  'ask-writes': 'Run read-only tools freely; ask before anything that may change state',
  'ask-all': 'Ask before every tool call',
  'read-only': 'Run read-only tools; refuse everything else without asking',
}

/**
 * A segmented control for the tool-consent policy — the "autopilot" switch.
 * Pair it with {@link useAgent}'s `approvalMode` / `setApprovalMode`.
 */
export const ApprovalModeSwitch = ({
  mode,
  onChange,
  modes = ['autopilot', 'ask-writes', 'ask-all', 'read-only'],
  labels,
  disabled,
  className,
}: ApprovalModeSwitchProps) => (
  <div
    className={['awr-modeswitch', className].filter(Boolean).join(' ')}
    role="radiogroup"
    aria-label="Tool consent"
  >
    {modes.map((m) => (
      <button
        key={m}
        type="button"
        role="radio"
        aria-checked={mode === m}
        title={HINTS[m]}
        className={`awr-modeswitch__opt${mode === m ? ' is-active' : ''}`}
        onClick={() => onChange(m)}
        disabled={disabled}
      >
        {labels?.[m] ?? DEFAULT_LABELS[m]}
      </button>
    ))}
  </div>
)
