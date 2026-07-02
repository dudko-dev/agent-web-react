import { useCallback, useMemo, useState } from 'react'
import { VaultCredentialStore, type CredentialStore } from '@dudko.dev/agent-web'

export interface UseCredentialsReturn {
  /** The underlying store — pass this straight to `createAgent({ credentials })`. */
  store: CredentialStore
  /** Store (encrypted at rest) an API key under a ref id. */
  setKey: (ref: string, key: string) => Promise<void>
  /** Remove a stored key. */
  removeKey: (ref: string) => Promise<void>
  /** Resolve whether a key is currently present for a ref. */
  hasKey: (ref: string) => Promise<boolean>
  /**
   * Bumped whenever a key is written or removed — depend on it in an effect to
   * re-query `hasKey` and reflect the change in your UI.
   */
  version: number
}

/**
 * Manage BYOK API keys in the agent's encrypted vault (WebCrypto AES-GCM key in
 * IndexedDB). Defaults to a fresh {@link VaultCredentialStore}; pass your own
 * {@link CredentialStore} (e.g. a short-lived-token fetcher) to override.
 *
 * ```tsx
 * const creds = useCredentials()
 * // await creds.setKey('openai', userInput)
 * // <AgentProvider config={{ model, credentials: creds.store }}>…
 * ```
 */
export const useCredentials = (store?: CredentialStore): UseCredentialsReturn => {
  const resolved = useMemo<CredentialStore>(() => store ?? new VaultCredentialStore(), [store])
  const [version, setVersion] = useState(0)

  const setKey = useCallback(
    async (ref: string, key: string) => {
      await resolved.setApiKey(ref, key)
      setVersion((v) => v + 1)
    },
    [resolved],
  )

  const removeKey = useCallback(
    async (ref: string) => {
      await resolved.deleteApiKey(ref)
      setVersion((v) => v + 1)
    },
    [resolved],
  )

  const hasKey = useCallback(
    async (ref: string) => (await resolved.getApiKey(ref)) !== undefined,
    [resolved],
  )

  return { store: resolved, setKey, removeKey, hasKey, version }
}
