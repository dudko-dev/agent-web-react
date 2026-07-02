import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { SendIcon, SpinnerIcon, StopIcon } from './icons.js'

export interface ComposerProps {
  /** Called with the trimmed text when the user submits. */
  onSubmit: (text: string) => void
  /** A run is in flight — show a stop button instead of send. */
  busy?: boolean
  /** Called when the stop button is pressed (only shown while `busy`). */
  onStop?: () => void
  /** Disable input (e.g. while the agent is still initializing). */
  disabled?: boolean
  placeholder?: string
  className?: string
}

/** A textarea + send/stop button. Enter submits; Shift+Enter inserts a newline. */
export const Composer = ({
  onSubmit,
  busy = false,
  onStop,
  disabled = false,
  placeholder = 'Ask the agent to do something…',
  className,
}: ComposerProps) => {
  const [text, setText] = useState('')

  const submit = () => {
    const value = text.trim()
    if (!value || busy || disabled) return
    setText('')
    onSubmit(value)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <form
      className={['awr-composer', className].filter(Boolean).join(' ')}
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <textarea
        className="awr-composer__input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
      />
      {busy ? (
        <button
          type="button"
          className="awr-composer__btn awr-composer__btn--stop"
          onClick={onStop}
          aria-label="Stop"
        >
          <StopIcon size={18} />
        </button>
      ) : (
        <button
          type="submit"
          className="awr-composer__btn"
          disabled={disabled || !text.trim()}
          aria-label="Send"
        >
          {disabled ? <SpinnerIcon size={18} /> : <SendIcon size={18} />}
        </button>
      )}
    </form>
  )
}
