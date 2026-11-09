import type { ReactNode } from 'react'
import { useOptionalAgentContext } from '../context.js'
import type { UseAgentReturn } from '../hooks/use-agent.js'
import { useLabels, type AgentLabelsOverride } from '../labels.js'
import type { LessonView } from '../types.js'
import { BookIcon, XIcon } from './icons.js'

export interface LearnedSkillsProps {
  /**
   * An explicit controller from {@link useAgent}. If omitted, the component reads the shared
   * controller from an enclosing `<AgentProvider>`. Or pass `lessons` yourself.
   */
  controller?: UseAgentReturn
  /** The lessons to show (default: the controller's `learned`). */
  lessons?: LessonView[]
  /**
   * Delete a lesson (default: the controller's `forgetSkill`). `false` hides the button -
   * a read-only view of what the agent wrote.
   */
  onForget?: ((name: string) => void | Promise<unknown>) | false
  /** Show what each lesson came from - the sources it named, the pages it read (default true). */
  showSources?: boolean
  /** Shown when there are no lessons (default: a short sentence from the labels). */
  empty?: ReactNode
  /** Hide the title row (default false). */
  hideTitle?: boolean
  labels?: AgentLabelsOverride
  className?: string
}

/**
 * The agent's notebook: the lessons it wrote down itself (`config.learning`), each with when it
 * applies, how many times it was rewritten and where it came from - and a button to forget one.
 * Updates live as the agent learns.
 */
export const LearnedSkills = ({
  controller,
  lessons,
  onForget,
  showSources = true,
  empty,
  hideTitle = false,
  labels,
  className,
}: LearnedSkillsProps) => {
  const L = useLabels(labels)
  const ctx = useOptionalAgentContext()
  const c = controller ?? ctx
  const list = lessons ?? c?.learned ?? []
  const forget = onForget === false ? undefined : (onForget ?? c?.forgetSkill)
  return (
    <section className={['awr-notebook', className].filter(Boolean).join(' ')}>
      {!hideTitle && (
        <h3 className="awr-notebook__title">
          <BookIcon size={14} /> {L.notebookTitle}
          {list.length > 0 && <span className="awr-notebook__count">{list.length}</span>}
        </h3>
      )}
      {list.length === 0 ? (
        <p className="awr-notebook__empty">{empty ?? L.notebookEmpty}</p>
      ) : (
        <ul className="awr-notebook__list">
          {list.map((l) => (
            <li key={l.name} className="awr-lesson">
              <div className="awr-lesson__head">
                <code className="awr-lesson__name">{l.name}</code>
                {l.revision > 1 && (
                  <span className="awr-lesson__rev">{L.notebookRevision(l.revision)}</span>
                )}
                {forget && (
                  <button
                    type="button"
                    className="awr-lesson__forget"
                    title={`${L.notebookForget}: ${l.name}`}
                    aria-label={`${L.notebookForget}: ${l.name}`}
                    onClick={() => void forget(l.name)}
                  >
                    <XIcon size={12} />
                  </button>
                )}
              </div>
              <p className="awr-lesson__when">{l.description}</p>
              {showSources && l.sources.length > 0 && (
                <p className="awr-lesson__from">
                  {L.notebookFrom} {l.sources.join(', ')}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
