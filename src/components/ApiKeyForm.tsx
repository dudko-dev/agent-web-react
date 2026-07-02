import { useEffect, useState } from 'react'
import type { UseCredentialsReturn } from '../hooks/use-credentials.js'
import { CheckIcon } from './icons.js'

export interface ApiKeyFormProps {
  /** The value returned by {@link useCredentials}. */
  credentials: UseCredentialsReturn
  /** The ref id under which the key is stored (matches your `credentialRef`). */
  credentialRef: string
  label?: string
  placeholder?: string
  /** Called after a key is saved or removed (e.g. to `reload()` the agent). */
  onChange?: (present: boolean) => void
  className?: string
}

/**
 * A BYOK key input that stores the key **encrypted at rest** via
 * {@link useCredentials}. Shows a "saved" state when a key already exists and
 * lets the user replace or remove it. The plaintext key never leaves the form.
 */
export const ApiKeyForm = ({
  credentials,
  credentialRef,
  label = 'API key',
  placeholder = 'sk-…',
  onChange,
  className,
}: ApiKeyFormProps) => {
  const [value, setValue] = useState('')
  const [present, setPresent] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    credentials.hasKey(credentialRef).then((has) => {
      if (active) setPresent(has)
    })
    return () => {
      active = false
    }
  }, [credentials, credentialRef, credentials.version])

  const save = async () => {
    const key = value.trim()
    if (!key) return
    setBusy(true)
    try {
      await credentials.setKey(credentialRef, key)
      setValue('')
      setPresent(true)
      onChange?.(true)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await credentials.removeKey(credentialRef)
      setPresent(false)
      onChange?.(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={['awr-keyform', className].filter(Boolean).join(' ')}>
      <label className="awr-keyform__label">
        {label}
        {present && (
          <span className="awr-keyform__saved">
            <CheckIcon size={12} /> stored, encrypted
          </span>
        )}
      </label>
      <div className="awr-keyform__row">
        <input
          className="awr-keyform__input"
          type="password"
          autoComplete="off"
          value={value}
          placeholder={present ? '•••••••• (replace)' : placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void save()
            }
          }}
          disabled={busy}
        />
        <button
          type="button"
          className="awr-keyform__btn"
          onClick={() => void save()}
          disabled={busy || !value.trim()}
        >
          Save
        </button>
        {present && (
          <button
            type="button"
            className="awr-keyform__btn awr-keyform__btn--ghost"
            onClick={() => void remove()}
            disabled={busy}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  )
}
