import { useEffect, useState } from 'react'
import {
  ApiKeyForm,
  ModelLoadBar,
  type UseCredentialsReturn,
  type UseWebLLMModelReturn,
} from '@dudko.dev/agent-web-react'
import { isLocal, type ModelOption } from '../models'

export interface SettingsProps {
  models: ModelOption[]
  selected: ModelOption
  onSelect: (id: string) => void
  credentials: UseCredentialsReturn
  webllm: UseWebLLMModelReturn
  /** Rebuild the agent after a key changes so it picks up the new credential. */
  onKeyChange: () => void
  /** A usable model is in hand (key stored / local model loaded): start collapsed. */
  ready: boolean
}

/**
 * Provider picker + BYOK key entry (cloud) or WebGPU model loader (local).
 * Open while there is nothing to talk to; once a key is stored (or a local
 * model loaded) it folds into one line, so the chat gets the height.
 */
export const Settings = ({
  models,
  selected,
  onSelect,
  credentials,
  webllm,
  onKeyChange,
  ready,
}: SettingsProps) => {
  const local = isLocal(selected)
  const [userOpen, setUserOpen] = useState<boolean | undefined>(undefined)
  // A switched model starts over: open while it still needs a key or a load.
  useEffect(() => setUserOpen(undefined), [selected.id])
  const open = userOpen ?? !ready
  // The local model in GPU memory, when it isn't the selected one.
  const held =
    webllm.loadedModelId && webllm.loadedModelId !== selected.model
      ? (models.find((m) => m.model === webllm.loadedModelId)?.label ?? webllm.loadedModelId)
      : undefined
  const status = ready ? (local ? 'loaded' : 'key stored ✓') : local ? 'not loaded' : 'add a key'
  return (
    <details
      className="settings"
      open={open}
      onToggle={(e) => {
        const now = e.currentTarget.open
        if (now !== open) setUserOpen(now)
      }}
    >
      <summary className="settings__summary">
        <span className="settings__summary-title">Model</span>
        <span className="settings__summary-value">{selected.label}</span>
        <span className={`settings__summary-status${ready ? ' is-ok' : ''}`}>{status}</span>
      </summary>
      <label className="settings__field">
        <span className="settings__label">Model</span>
        <select
          className="settings__select"
          value={selected.id}
          onChange={(e) => onSelect(e.target.value)}
        >
          {[...new Set(models.map((m) => m.group))].map((group) => (
            <optgroup key={group} label={group}>
              {models
                .filter((m) => m.group === group)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>

      <p className="settings__note">{selected.note}</p>

      {local ? (
        <div className="settings__local">
          {!webllm.supported && (
            <p className="settings__warn">
              WebGPU isn’t available in this browser. Try Chrome or Edge on desktop.
            </p>
          )}
          {webllm.error && <p className="settings__warn">{webllm.error}</p>}
          {webllm.loading ? (
            <ModelLoadBar load={{ progress: webllm.progress, text: webllm.text }} />
          ) : webllm.ready ? (
            <div className="settings__row">
              <p className="settings__ok">Model loaded — chat away, fully offline.</p>
              <button type="button" className="mcp__btn-ghost" onClick={() => void webllm.unload()}>
                Unload
              </button>
            </div>
          ) : (
            <>
              {held && (
                <p className="settings__note">
                  {held} is in GPU memory — loading this one frees it first.
                </p>
              )}
              <button
                className="settings__btn"
                onClick={() => void webllm.load()}
                disabled={!webllm.supported}
              >
                Download &amp; load model
              </button>
            </>
          )}
        </div>
      ) : (
        <ApiKeyForm
          credentials={credentials}
          credentialRef={selected.credentialRef!}
          label={selected.keyLabel}
          placeholder={selected.keyPlaceholder}
          onChange={onKeyChange}
        />
      )}

      {!local && selected.keyUrl && (
        <a className="settings__link" href={selected.keyUrl} target="_blank" rel="noreferrer">
          Get a {selected.keyLabel} →
        </a>
      )}
    </details>
  )
}
