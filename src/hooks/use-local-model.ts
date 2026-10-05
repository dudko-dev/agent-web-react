import { useCallback, useRef, useState } from 'react'
import type { createWebLLMModel } from '@dudko.dev/agent-web'
import { errMessage } from '../util.js'

/** An AI SDK `LanguageModel` (the type, via the core — no `ai` import here). */
type LanguageModel = Awaited<ReturnType<typeof createWebLLMModel>>

/** Download / initialisation progress of a local model. */
export interface LocalModelProgress {
  /** 0..1. */
  progress: number
  /** Human-readable status from the runtime. */
  text: string
}

/** What `create` and `warmUp` are given. */
export interface LocalModelLoadContext {
  /** Report progress; the hook shows it for the load in flight only. */
  onProgress: (report: LocalModelProgress) => void
  /** The window to load the model with, when the host asked for one. */
  contextWindowTokens?: number
}

/**
 * How to run one kind of on-device model — WebLLM, the browser's built-in
 * model (`@browser-ai/core`), transformers.js (`@browser-ai/transformers-js`),
 * or your own. Only `create` is required.
 */
export interface LocalModelEngine<M extends LanguageModel = LanguageModel> {
  /** Build the model (cheap: the download starts in `warmUp`). */
  create: (modelId: string, ctx: LocalModelLoadContext) => Promise<M>
  /**
   * Download the weights and initialise now, so `ready` means "ready to chat"
   * and the progress shows during the load (default: nothing — the runtime
   * then loads on the first message).
   */
  warmUp?: (model: M, ctx: LocalModelLoadContext) => Promise<void>
  /** Free the model's memory (default: nothing). */
  unload?: (model: M) => Promise<void>
  /** Whether this browser can run it at all (default true). */
  supported?: () => boolean
  /** The error a load reports when `supported()` is false. */
  unsupportedMessage?: string
  /** The model's context window once loaded, when the runtime says. */
  contextWindowOf?: (model: M) => number | undefined
}

export interface UseLocalModelOptions {
  /**
   * The window to load the model with (WebLLM loads with 4096 unless told
   * otherwise). A different window is a different load.
   */
  contextWindowTokens?: number
}

export interface UseLocalModelReturn<M extends LanguageModel = LanguageModel> {
  /**
   * The built model, once **this** `modelId` is loaded — pass to
   * `createAgent({ model })`. Undefined right after the id changes, until the
   * new one is loaded.
   */
  model: M | undefined
  /**
   * Download and initialize the current `modelId`. Resolves with the model
   * already loaded for it, if any. Loading another id first frees the previous
   * model's memory (one model per hook); call again after an error to retry.
   */
  load: () => Promise<M | undefined>
  /** Free the loaded model's memory (and drop a load in flight). */
  unload: () => Promise<void>
  /** The id of the model held in memory, whichever id is current. */
  loadedModelId: string | undefined
  /** True while the current `modelId` is downloading / initializing. */
  loading: boolean
  /** Load progress of the current `modelId`, 0..1. */
  progress: number
  /** Human-readable progress text from the runtime. */
  text: string
  /** Why the current `modelId` failed to load. */
  error: string | undefined
  /** Whether this browser can run the engine. */
  supported: boolean
  /** True once the current `modelId` is ready. */
  ready: boolean
  /** The loaded model's context window, in tokens, when the runtime says. */
  contextWindow: number | undefined
}

interface Loaded<M> {
  id: string
  /** The id and the window it was loaded with: another window is another load. */
  key: string
  model: M
  /** Frees it with the engine that built it (the engine may change since). */
  free: () => Promise<void>
}

const keyOf = (id: string, tokens: number | undefined) => (tokens ? `${id}@${tokens}` : id)

/**
 * Load an on-device model and track its download — for any local runtime,
 * described by an {@link LocalModelEngine}. Nothing downloads until you call
 * `load()` (models are large), so you can gate it behind a user action.
 *
 * Everything it reports is about the **current** `modelId`: switch the id and
 * `model` / `ready` / `progress` / `error` describe the new one (not loaded
 * yet), while the previous model stays in memory — switching back is instant.
 * Loading the new id frees the previous one first, so two models never hold
 * memory at once; `unload()` frees it on demand. A load superseded by another
 * frees its model; a second `load()` of the same id shares the download.
 *
 * ```tsx
 * import { browserAI, doesBrowserSupportBrowserAI } from '@browser-ai/core'
 * const nano: LocalModelEngine = {
 *   create: async () => browserAI('text', { expectedInputs: [{ type: 'image' }] }),
 *   warmUp: async (m, { onProgress }) => {
 *     await m.createSessionWithProgress((p) => onProgress({ progress: p, text: 'Downloading' }))
 *   },
 *   supported: doesBrowserSupportBrowserAI,
 *   contextWindowOf: (m) => m.getContextWindow(),
 * }
 * const local = useLocalModel('gemini-nano', nano)
 * ```
 *
 * {@link useWebLLMModel} is this hook with the WebLLM engine.
 */
export const useLocalModel = <M extends LanguageModel = LanguageModel>(
  modelId: string,
  engine: LocalModelEngine<M>,
  options?: UseLocalModelOptions,
): UseLocalModelReturn<M> => {
  const [loaded, setLoaded] = useState<Loaded<M> | undefined>(undefined)
  const [pending, setPending] = useState<{ key: string; progress: number; text: string }>()
  const [failure, setFailure] = useState<{ key: string; message: string }>()
  // The engine is read at load time: a new object every render is fine.
  const engineRef = useRef(engine)
  engineRef.current = engine
  // The source of truth for async code (state lags a render behind).
  const loadedRef = useRef<Loaded<M> | undefined>(undefined)
  const inflightRef = useRef<{ key: string; promise: Promise<M | undefined> } | undefined>(
    undefined,
  )
  const windowTokens = options?.contextWindowTokens
  const key = keyOf(modelId, windowTokens)
  // Bumped by every load()/unload(): an older load that finishes late is stale.
  const seqRef = useRef(0)

  const setHeld = (next: Loaded<M> | undefined) => {
    loadedRef.current = next
    setLoaded(next)
  }
  const freeWith = (eng: LocalModelEngine<M>, model: M) => async () => {
    try {
      await eng.unload?.(model)
    } catch {
      /* best-effort */
    }
  }

  const load = useCallback((): Promise<M | undefined> => {
    const id = modelId
    if (loadedRef.current?.key === key) return Promise.resolve(loadedRef.current.model)
    if (inflightRef.current?.key === key) return inflightRef.current.promise
    const eng = engineRef.current
    if (eng.supported && !eng.supported()) {
      setFailure({
        key,
        message: eng.unsupportedMessage ?? 'This browser cannot run this model.',
      })
      return Promise.resolve(undefined)
    }
    const seq = ++seqRef.current
    const current = () => seq === seqRef.current
    const ctx: LocalModelLoadContext = {
      onProgress: (report) => {
        if (current()) setPending({ key, progress: report.progress, text: report.text })
      },
      ...(windowTokens ? { contextWindowTokens: windowTokens } : {}),
    }
    const promise = (async (): Promise<M | undefined> => {
      setPending({ key, progress: 0, text: '' })
      setFailure(undefined)
      let built: M | undefined
      try {
        // One model per hook: free the previous one before the next download.
        const previous = loadedRef.current
        if (previous) {
          setHeld(undefined)
          await previous.free()
        }
        built = await eng.create(id, ctx)
        await eng.warmUp?.(built, ctx)
        if (!current()) {
          // Superseded by another load() or an unload(): don't leak its memory.
          await freeWith(eng, built)()
          return undefined
        }
        setHeld({ id, key, model: built, free: freeWith(eng, built) })
        return built
      } catch (err) {
        if (built) await freeWith(eng, built)()
        if (current()) setFailure({ key, message: errMessage(err) })
        return undefined
      } finally {
        if (current()) {
          inflightRef.current = undefined
          setPending(undefined)
        }
      }
    })()
    inflightRef.current = { key, promise }
    return promise
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId, key])

  const unload = useCallback(async (): Promise<void> => {
    seqRef.current++ // a load in flight becomes stale and frees itself
    inflightRef.current = undefined
    setPending(undefined)
    const previous = loadedRef.current
    setHeld(undefined)
    if (previous) await previous.free()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const model = loaded?.key === key ? loaded.model : undefined
  const progressing = pending?.key === key ? pending : undefined
  return {
    model,
    load,
    unload,
    loadedModelId: loaded?.id,
    loading: progressing !== undefined,
    progress: progressing?.progress ?? 0,
    text: progressing?.text ?? '',
    error: failure?.key === key ? failure.message : undefined,
    supported: engine.supported ? engine.supported() : true,
    ready: model !== undefined,
    contextWindow: model ? engine.contextWindowOf?.(model) : undefined,
  }
}
