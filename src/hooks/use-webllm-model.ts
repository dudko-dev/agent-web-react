import {
  createWebLLMModel,
  isWebGPUAvailable,
  preloadWebLLMModel,
  unloadWebLLMModel,
  webLLMContextWindow,
  type WebLLMModelOptions,
} from '@dudko.dev/agent-web'
import {
  useLocalModel,
  type LocalModelEngine,
  type UseLocalModelReturn,
} from './use-local-model.js'

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

/** What {@link useWebLLMModel} returns — {@link UseLocalModelReturn} for a WebLLM model. */
export type UseWebLLMModelReturn = UseLocalModelReturn<WebLLMModel>

/**
 * Load a local WebGPU model with WebLLM and track its download progress —
 * {@link useLocalModel} with the WebLLM engine. Nothing downloads until you
 * call `load()` (models are large), so you can gate it behind a user action.
 * `load()` eagerly initializes the engine (via the core's
 * `preloadWebLLMModel`), so `ready` means "ready to chat" and progress fills
 * during the load rather than silently on the first message.
 *
 * Everything it reports is about the **current** `modelId`: switch the id and
 * `model` / `ready` / `progress` / `error` describe the new one (not loaded
 * yet), while the previous model stays in memory — switching back is instant.
 * Loading the new id frees the previous one first, so two models never hold
 * GPU memory at once; `unload()` frees it on demand.
 *
 * WebLLM loads its models with a 4096-token window; pass `contextWindowTokens`
 * to load with more (Qwen3, Llama 3.x take far more — it costs KV-cache VRAM,
 * not a new download). A different window is a different load.
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
): UseWebLLMModelReturn =>
  useLocalModel(modelId, createWebLLMEngine(options), {
    contextWindowTokens: options?.contextWindowTokens,
  })

/**
 * The WebLLM {@link LocalModelEngine}: what {@link useWebLLMModel} runs, for
 * hosts that switch between local runtimes with one {@link useLocalModel}
 * (pass the window to that hook's `contextWindowTokens`).
 */
export const createWebLLMEngine = (
  options?: UseWebLLMModelOptions,
): LocalModelEngine<WebLLMModel> => {
  // The window comes per load (useLocalModel's option), not from here.
  const {
    create = createWebLLMModel,
    contextWindowTokens: _perLoad,
    ...modelOptions
  } = options ?? {}
  return {
    create: (id, ctx) =>
      create(id, {
        ...modelOptions,
        ...(ctx.contextWindowTokens ? { contextWindowTokens: ctx.contextWindowTokens } : {}),
        // Drive preload in warmUp (below) so download progress is reported the
        // same way whether `create` is the core's `createWebLLMModel` or an
        // injected factory (e.g. a statically-imported `webLLM`, needed under
        // bundlers).
        preload: false,
        initProgressCallback: (report) => {
          ctx.onProgress({ progress: report.progress, text: report.text })
          modelOptions.initProgressCallback?.(report)
        },
      }),
    // Download the weights + init the engine now via the core's helper (a
    // 1-token warm-up). WebLLM builds are otherwise lazy — the ~GB download
    // would only start on the first `run()`, long after we told the UI the
    // model is "ready". Fast + idempotent once the weights are cached.
    warmUp: (model) => preloadWebLLMModel(model),
    unload: unloadWebLLMModel,
    supported: isWebGPUAvailable,
    unsupportedMessage: 'WebGPU is not available in this browser.',
    contextWindowOf: webLLMContextWindow,
  }
}
