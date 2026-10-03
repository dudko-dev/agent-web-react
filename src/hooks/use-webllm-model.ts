import { useCallback, useRef, useState } from 'react'
import {
  createWebLLMModel,
  isWebGPUAvailable,
  preloadWebLLMModel,
  unloadWebLLMModel,
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
  /**
   * The built model, once **this** `modelId` is loaded — pass to
   * `createAgent({ model })`. Undefined right after the id changes, until the
   * new one is loaded.
   */
  model: WebLLMModel | undefined
  /**
   * Download and initialize the current `modelId`. Resolves with the model
   * already loaded for it, if any. Loading another id first frees the previous
   * model's GPU memory (one engine per hook); call again after an error to retry.
   */
  load: () => Promise<WebLLMModel | undefined>
  /** Free the loaded model's GPU memory (and drop a load in flight). */
  unload: () => Promise<void>
  /** The id of the model held in memory, whichever id is current. */
  loadedModelId: string | undefined
  /** True while the current `modelId` is downloading / initializing. */
  loading: boolean
  /** Load progress of the current `modelId`, 0..1. */
  progress: number
  /** Human-readable progress text from WebLLM. */
  text: string
  /** Why the current `modelId` failed to load. */
  error: string | undefined
  /** Whether WebGPU is available (required for local models). */
  supported: boolean
  /** True once the current `modelId` is ready. */
  ready: boolean
}

interface Loaded {
  id: string
  model: WebLLMModel
}

/**
 * Load a local WebGPU model with WebLLM and track its download progress.
 * Nothing downloads until you call `load()` (models are large), so you can
 * gate it behind a user action. `load()` eagerly initializes the engine (via
 * the core's `preloadWebLLMModel`), so `ready` means "ready to chat" and
 * progress fills during the load rather than silently on the first message.
 *
 * Everything it reports is about the **current** `modelId`: switch the id and
 * `model` / `ready` / `progress` / `error` describe the new one (not loaded
 * yet), while the previous model stays in memory — switching back is instant.
 * Loading the new id frees the previous one first, so two models never hold
 * GPU memory at once; `unload()` frees it on demand.
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
  const [loaded, setLoaded] = useState<Loaded | undefined>(undefined)
  const [pending, setPending] = useState<{ id: string; progress: number; text: string }>()
  const [failure, setFailure] = useState<{ id: string; message: string }>()
  const optionsRef = useRef(options)
  optionsRef.current = options
  // The source of truth for async code (state lags a render behind).
  const loadedRef = useRef<Loaded | undefined>(undefined)
  const inflightRef = useRef<{ id: string; promise: Promise<WebLLMModel | undefined> } | undefined>(
    undefined,
  )
  // Bumped by every load()/unload(): an older load that finishes late is stale.
  const seqRef = useRef(0)

  const setHeld = (next: Loaded | undefined) => {
    loadedRef.current = next
    setLoaded(next)
  }

  const load = useCallback((): Promise<WebLLMModel | undefined> => {
    const id = modelId
    if (loadedRef.current?.id === id) return Promise.resolve(loadedRef.current.model)
    if (inflightRef.current?.id === id) return inflightRef.current.promise
    if (!isWebGPUAvailable()) {
      setFailure({ id, message: 'WebGPU is not available in this browser.' })
      return Promise.resolve(undefined)
    }
    const seq = ++seqRef.current
    const current = () => seq === seqRef.current
    const promise = (async (): Promise<WebLLMModel | undefined> => {
      setPending({ id, progress: 0, text: '' })
      setFailure(undefined)
      let built: WebLLMModel | undefined
      try {
        // One engine per hook: free the previous model before the next download.
        const previous = loadedRef.current
        if (previous) {
          setHeld(undefined)
          await unloadWebLLMModel(previous.model)
        }
        const { create = createWebLLMModel, ...modelOptions } = optionsRef.current ?? {}
        built = await create(id, {
          ...modelOptions,
          // Drive preload here (below) so download progress is reported the same
          // way whether `create` is the core's `createWebLLMModel` or an injected
          // factory (e.g. a statically-imported `webLLM`, needed under bundlers).
          preload: false,
          initProgressCallback: (report) => {
            if (current()) setPending({ id, progress: report.progress, text: report.text })
            modelOptions.initProgressCallback?.(report)
          },
        })
        // Download the weights + init the engine now via the core's helper (a
        // 1-token warm-up). WebLLM builds are otherwise lazy — the ~GB download
        // would only start on the first `run()`, long after we told the UI the
        // model is "ready". Fast + idempotent once the weights are cached.
        await preloadWebLLMModel(built)
        if (!current()) {
          // Superseded by another load() or an unload(): don't leak its engine.
          await unloadWebLLMModel(built)
          return undefined
        }
        setHeld({ id, model: built })
        return built
      } catch (err) {
        if (built) await unloadWebLLMModel(built)
        if (current()) setFailure({ id, message: errMessage(err) })
        return undefined
      } finally {
        if (current()) {
          inflightRef.current = undefined
          setPending(undefined)
        }
      }
    })()
    inflightRef.current = { id, promise }
    return promise
  }, [modelId])

  const unload = useCallback(async (): Promise<void> => {
    seqRef.current++ // a load in flight becomes stale and frees itself
    inflightRef.current = undefined
    setPending(undefined)
    const previous = loadedRef.current
    setHeld(undefined)
    if (previous) await unloadWebLLMModel(previous.model)
  }, [])

  const model = loaded?.id === modelId ? loaded.model : undefined
  const progressing = pending?.id === modelId ? pending : undefined
  return {
    model,
    load,
    unload,
    loadedModelId: loaded?.id,
    loading: progressing !== undefined,
    progress: progressing?.progress ?? 0,
    text: progressing?.text ?? '',
    error: failure?.id === modelId ? failure.message : undefined,
    supported: isWebGPUAvailable(),
    ready: model !== undefined,
  }
}
