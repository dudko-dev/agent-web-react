import { useEffect, useState } from 'react'
import {
  ApiKeyForm,
  ModelLoadBar,
  type UseCredentialsReturn,
  type UseLocalModelReturn,
} from '@dudko.dev/agent-web-react'
import { isLocal, type ModelOption } from '../models'

export interface SettingsProps {
  models: ModelOption[]
  selected: ModelOption
  onSelect: (id: string) => void
  credentials: UseCredentialsReturn
  /** The on-device model loader (WebLLM, built-in, transformers.js). */
  local: UseLocalModelReturn
  /** OpenRouter's "any model": the id typed by the user. */
  customModelId: string
  onCustomModelId: (id: string) => void
  /** Rebuild the agent after a key changes so it picks up the new credential. */
  onKeyChange: () => void
  /** A usable model is in hand (key stored / local model loaded): start collapsed. */
  ready: boolean
}

/**
 * Provider picker + BYOK key entry (cloud) or on-device model loader (local).
 * Open while there is nothing to talk to; once a key is stored (or a local
 * model loaded) it folds into one line, so the chat gets the height.
 */
export const Settings = ({
  models,
  selected,
  onSelect,
  credentials,
  local: loader,
  customModelId,
  onCustomModelId,
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
    loader.loadedModelId && loader.loadedModelId !== selected.model
      ? (models.find((m) => m.model === loader.loadedModelId)?.label ?? loader.loadedModelId)
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
          {!loader.supported && (
            <p className="settings__warn">
              {selected.runtime === 'built-in'
                ? 'This browser has no built-in model — it’s Chrome’s Prompt API (Chrome 148+ on desktop).'
                : 'WebGPU isn’t available in this browser. Try Chrome or Edge on desktop.'}
            </p>
          )}
          {loader.error && <p className="settings__warn">{loader.error}</p>}
          {loader.loading ? (
            <ModelLoadBar load={{ progress: loader.progress, text: loader.text }} />
          ) : loader.ready ? (
            <div className="settings__row">
              <p className="settings__ok">
                Model loaded — chat away, fully offline
                {loader.contextWindow
                  ? ` (${Math.round(loader.contextWindow / 1024)}k window)`
                  : ''}
                .
              </p>
              <button type="button" className="mcp__btn-ghost" onClick={() => void loader.unload()}>
                Unload
              </button>
            </div>
          ) : (
            <>
              {held && (
                <p className="settings__note">
                  {held} is in memory — loading this one frees it first.
                </p>
              )}
              <button
                className="settings__btn"
                onClick={() => void loader.load()}
                disabled={!loader.supported}
              >
                {selected.runtime === 'built-in'
                  ? 'Start the built-in model'
                  : 'Download & load model'}
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          {selected.customModel && (
            <label className="settings__field">
              <span className="settings__label">Model id</span>
              <input
                className="settings__select"
                value={customModelId}
                placeholder={selected.model}
                spellCheck={false}
                onChange={(e) => onCustomModelId(e.target.value)}
              />
            </label>
          )}
          <ApiKeyForm
            credentials={credentials}
            credentialRef={selected.credentialRef!}
            label={selected.keyLabel}
            placeholder={selected.keyPlaceholder}
            onChange={onKeyChange}
          />
        </>
      )}

      {!local && selected.keyUrl && (
        <a className="settings__link" href={selected.keyUrl} target="_blank" rel="noreferrer">
          Get a {selected.keyLabel} →
        </a>
      )}
    </details>
  )
}
