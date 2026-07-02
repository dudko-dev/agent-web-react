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
}

/** Provider picker + BYOK key entry (cloud) or WebGPU model loader (local). */
export const Settings = ({
  models,
  selected,
  onSelect,
  credentials,
  webllm,
  onKeyChange,
}: SettingsProps) => {
  const local = isLocal(selected)
  return (
    <div className="settings">
      <label className="settings__field">
        <span className="settings__label">Model</span>
        <select
          className="settings__select"
          value={selected.id}
          onChange={(e) => onSelect(e.target.value)}
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
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
            <p className="settings__ok">Model loaded — chat away, fully offline.</p>
          ) : (
            <button
              className="settings__btn"
              onClick={() => void webllm.load()}
              disabled={!webllm.supported}
            >
              Download &amp; load model
            </button>
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
    </div>
  )
}
