import { useCallback, useRef, useState } from 'react'
import { createWebLLMModel, isWebGPUAvailable, type WebLLMModelOptions } from '@dudko.dev/agent-web'
import { errMessage } from '../util.js'

/** The AI SDK `LanguageModel` a WebLLM build produces (resolved via agent-web). */
type WebLLMModel = Awaited<ReturnType<typeof createWebLLMModel>>

export interface UseWebLLMModelReturn {
  /** The built model once loaded — pass to `createAgent({ model })`. */
  model: WebLLMModel | undefined
  /** Start the download / engine init. Idempotent-ish: safe to call again to retry. */
  load: () => Promise<WebLLMModel | undefined>
  /** True while weights are downloading / the engine is initializing. */
  loading: boolean
  /** Load progress, 0..1. */
  progress: number
  /** Human-readable progress text from WebLLM. */
  text: string
  /** Error message if the load failed. */
  error: string | undefined
  /** Whether WebGPU is available (required for local models). */
  supported: boolean
  /** True once the model is ready. */
  ready: boolean
}

/**
 * Load a local WebGPU model with WebLLM and track its download progress.
 * Nothing downloads until you call `load()` (models are large), so you can
 * gate it behind a user action.
 *
 * ```tsx
 * const local = useWebLLMModel('Llama-3.2-3B-Instruct-q4f16_1-MLC')
 * // <button disabled={!local.supported || local.loading} onClick={local.load}>Load</button>
 * // {local.loading && <ModelLoadBar load={{ progress: local.progress, text: local.text }} />}
 * // local.ready && <AgentProvider config={{ model: local.model! }}>…
 * ```
 */
export const useWebLLMModel = (
  modelId: string,
  options?: WebLLMModelOptions,
): UseWebLLMModelReturn => {
  const [model, setModel] = useState<WebLLMModel | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)
  const optionsRef = useRef(options)
  optionsRef.current = options

  const load = useCallback(async (): Promise<WebLLMModel | undefined> => {
    if (!isWebGPUAvailable()) {
      setError('WebGPU is not available in this browser.')
      return undefined
    }
    setLoading(true)
    setError(undefined)
    try {
      const built = await createWebLLMModel(modelId, {
        ...optionsRef.current,
        initProgressCallback: (report) => {
          setProgress(report.progress)
          setText(report.text)
          optionsRef.current?.initProgressCallback?.(report)
        },
      })
      setModel(built)
      return built
    } catch (err) {
      setError(errMessage(err))
      return undefined
    } finally {
      setLoading(false)
    }
  }, [modelId])

  return {
    model,
    load,
    loading,
    progress,
    text,
    error,
    supported: isWebGPUAvailable(),
    ready: model !== undefined,
  }
}
