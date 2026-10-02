import type { ReactNode } from 'react'
import { useLabels, type AgentLabelsOverride } from '../labels.js'
import type { ApprovalView } from '../types.js'
import { previewValue } from './format.js'
import { ShieldIcon } from './icons.js'

export interface ToolApprovalPromptProps {
  /** Pending requests (e.g. `agent.pendingApprovals`). */
  approvals: ApprovalView[]
  onApprove: (id: string, options?: { remember?: boolean }) => void
  onDeny: (id: string, reason?: string) => void
  /** Offer "Always allow" (remembers the tool for the agent's life). Default true. */
  allowRemember?: boolean
  /** Render a request yourself (gets the built-in card as `fallback`). */
  renderApproval?: (approval: ApprovalView, fallback: ReactNode) => ReactNode
  labels?: AgentLabelsOverride
  className?: string
}

/**
 * Consent cards for tool calls the agent wants to make — "Allow once",
 * "Always allow" and "Deny". Wire it to {@link useAgent}'s `pendingApprovals`,
 * `approve` and `deny`; `<AgentChat>` renders it for you.
 */
export const ToolApprovalPrompt = ({
  approvals,
  onApprove,
  onDeny,
  allowRemember = true,
  renderApproval,
  labels,
  className,
}: ToolApprovalPromptProps) => {
  const L = useLabels(labels)
  if (approvals.length === 0) return null
  return (
    <div className={['awr-approvals', className].filter(Boolean).join(' ')} role="alert">
      {approvals.map((a) => {
        const card = (
          <div key={a.id} className="awr-approval">
            <div className="awr-approval__head">
              <ShieldIcon size={14} className="awr-approval__icon" />
              <span>
                {L.approvalLead} <code className="awr-tool__name">{a.name}</code>
                {a.readOnly ? ` (${L.readOnlyTool})` : ''}
              </span>
            </div>
            {previewValue(a.input, 300) && (
              <pre className="awr-approval__input">{previewValue(a.input, 300)}</pre>
            )}
            <div className="awr-approval__actions">
              <button
                type="button"
                className="awr-btn awr-btn--primary"
                onClick={() => onApprove(a.id)}
              >
                {L.approve}
              </button>
              {allowRemember && (
                <button
                  type="button"
                  className="awr-btn"
                  onClick={() => onApprove(a.id, { remember: true })}
                >
                  {L.alwaysAllow}
                </button>
              )}
              <button
                type="button"
                className="awr-btn awr-btn--danger"
                onClick={() => onDeny(a.id, L.declinedReason)}
              >
                {L.deny}
              </button>
            </div>
          </div>
        )
        return renderApproval ? <div key={a.id}>{renderApproval(a, card)}</div> : card
      })}
    </div>
  )
}
