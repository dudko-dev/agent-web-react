import { createWebLLMEngine, type LocalModelEngine } from '@dudko.dev/agent-web-react'
import type { ModelOption } from './models'
import { createLocalModel } from './providers'

/**
 * The on-device runtimes the demo can run, as engines for `useLocalModel`:
 * WebLLM (WebGPU), the browser's built-in model, and transformers.js (ONNX on
 * WebGPU). Each runtime's package is imported when a model of it is loaded, so
 * nobody downloads a runtime they never pick.
 */

/** WebLLM, with the statically-imported factory a bundler needs (providers.ts). */
const webLLM = createWebLLMEngine({ create: createLocalModel })

const hasGpu = () => typeof navigator !== 'undefined' && 'gpu' in navigator

/**
 * Chrome's built-in model (Gemini Nano, the Prompt API) via `@browser-ai/core`.
 * The page downloads nothing: Chrome fetches the model once for every site.
 */
const builtIn: LocalModelEngine = {
  create: async () => {
    const { browserAI } = await import('@browser-ai/core')
    return browserAI('text', { expectedInputs: [{ type: 'text' }, { type: 'image' }] })
  },
  warmUp: async (model, { onProgress }) => {
    const m = model as unknown as {
      availability: () => Promise<string>
      createSessionWithProgress: (cb: (p: number) => void) => Promise<unknown>
    }
    const availability = await m.availability()
    if (availability === 'unavailable') {
      throw new Error(
        'Chrome says its built-in model is unavailable here: it needs Chrome 148+ on desktop with ~22 GB free disk and a GPU with 4+ GB (or 16 GB RAM).',
      )
    }
    await m.createSessionWithProgress((p) =>
      onProgress({
        progress: p,
        text:
          availability === 'available'
            ? 'Starting the built-in model'
            : 'Chrome is downloading its model',
      }),
    )
  },
  supported: () => typeof globalThis !== 'undefined' && 'LanguageModel' in globalThis,
  unsupportedMessage:
    "This browser has no built-in model — it's Chrome's Prompt API (Chrome 148+ on desktop).",
  contextWindowOf: (model) =>
    (model as unknown as { getContextWindow?: () => number | undefined }).getContextWindow?.(),
}

/** Picks q4f16 weights where the GPU has f16 shaders, plain q4 elsewhere. */
const pickDtype = async (): Promise<'q4f16' | 'q4'> => {
  try {
    const adapter = await (
      navigator as unknown as {
        gpu: { requestAdapter: () => Promise<{ features: Set<string> } | null> }
      }
    ).gpu.requestAdapter()
    return adapter?.features.has('shader-f16') ? 'q4f16' : 'q4'
  } catch {
    return 'q4'
  }
}

/** transformers.js (`@browser-ai/transformers-js`): ONNX models on WebGPU. */
const transformersFor = (vision: boolean): LocalModelEngine => ({
  create: async (id) => {
    const [{ transformersJS }, dtype] = await Promise.all([
      import('@browser-ai/transformers-js'),
      pickDtype(),
    ])
    return transformersJS(id, { device: 'webgpu', dtype, isVisionModel: vision })
  },
  warmUp: async (model, { onProgress }) => {
    await (
      model as unknown as {
        createSessionWithProgress: (cb: (p: number) => void) => Promise<unknown>
      }
    ).createSessionWithProgress((p) =>
      onProgress({ progress: p, text: `Downloading the weights — ${Math.round(p * 100)}%` }),
    )
  },
  // The provider keeps the loaded model private; dispose() frees its GPU buffers.
  unload: async (model) => {
    const loaded = (
      model as unknown as { modelInstance?: [unknown, { dispose?: () => Promise<void> }] }
    ).modelInstance
    await loaded?.[1]?.dispose?.()
  },
  supported: hasGpu,
  unsupportedMessage: 'WebGPU is not available in this browser.',
})
const transformersVision = transformersFor(true)

/** The engine that runs a local model option (cloud options never load). */
export const engineFor = (option: ModelOption): LocalModelEngine => {
  switch (option.runtime) {
    case 'built-in':
      return builtIn
    case 'transformers-js':
      return transformersVision
    default:
      return webLLM
  }
}
