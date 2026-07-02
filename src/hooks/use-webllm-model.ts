import { useCallback, useRef, useState } from 'react'
import {
  createWebLLMModel,
  isWebGPUAvailable,
  preloadWebLLMModel,
  type WebLLMModelOptions,
} from '@dudko.dev/agent-web'
import { errMessage } from '../util.js'

/** The AI SDK `LanguageModel` a WebLLM build produces (resolved via agent-web). */
type WebLLMModel = Awaited<ReturnType<typeof createWebLLMModel>>

/**
 * Builds a WebLLM-backed `LanguageModel`. Defaults to the core's
 * {@link createWebLLMModel}; override it via {@link UseWebLLMModelOptions.create}.
 */
export type WebLLMModelFactory = (
  modelId: string,
  options?: WebLLMModelOptions,
) => Promise<WebLLMModel>

export interface UseWebLLMModelOptions extends WebLLMModelOptions {
  /**
   * Override how the model is built. **Bundled browser apps (Vite, Next, …)
   * usually need this**: the core builds WebLLM via `await import('@browser-ai/
   * web-llm')`, and a bundler frequently stubs that dynamic import to an empty
   * module — the failure surfaces as `webLLM is not a function`. Pass a factory
   * that imports `webLLM` statically so the bundler includes it:
   *
   * ```ts
   * import { webLLM } from '@browser-ai/web-llm'
   * const create = (id, opts) => Promise.resolve(webLLM(id, opts))
   * const local = useWebLLMModel('Qwen2.5-1.5B-Instruct-q4f16_1-MLC', { create })
   * ```
   *
   * Defaults to `createWebLLMModel` from `@dudko.dev/agent-web`.
   */
  create?: WebLLMModelFactory
}

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
 * gate it behind a user action. `load()` eagerly initializes the engine (via
 * the core's `preloadWebLLMModel`), so `ready` means "ready to chat" and
 * progress fills during the load rather than silently on the first message.
 *
 * ```tsx
 * import { webLLM } from '@browser-ai/web-llm' // your app's optional peer
 * const create = (id: string, opts?: WebLLMModelOptions) => Promise.resolve(webLLM(id, opts))
 * const local = useWebLLMModel('Qwen2.5-1.5B-Instruct-q4f16_1-MLC', { create })
 * // <button disabled={!local.supported || local.loading} onClick={local.load}>Load</button>
 * // {local.loading && <ModelLoadBar load={{ progress: local.progress, text: local.text }} />}
 * // local.ready && <AgentProvider config={{ model: local.model! }}>…
 * ```
 */
export const useWebLLMModel = (
  modelId: string,
  options?: UseWebLLMModelOptions,
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
    setProgress(0)
    setText('')
    try {
      const { create = createWebLLMModel, ...modelOptions } = optionsRef.current ?? {}
      const built = await create(modelId, {
        ...modelOptions,
        // Drive preload here (below) so download progress is reported the same
        // way whether `create` is the core's `createWebLLMModel` or an injected
        // factory (e.g. a statically-imported `webLLM`, needed under bundlers).
        preload: false,
        initProgressCallback: (report) => {
          setProgress(report.progress)
          setText(report.text)
          modelOptions.initProgressCallback?.(report)
        },
      })
      // Download the weights + init the engine now via the core's helper (a
      // 1-token warm-up). WebLLM builds are otherwise lazy — the ~GB download
      // would only start on the first `run()`, long after we told the UI the
      // model is "ready". Fast + idempotent once the weights are cached.
      await preloadWebLLMModel(built)
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
