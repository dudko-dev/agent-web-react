import { webLLM } from '@browser-ai/web-llm'
import { prebuiltAppConfig } from '@mlc-ai/web-llm'
import { withWebLLMContextWindow } from '@dudko.dev/agent-web'
import type { WebLLMModelFactory } from '@dudko.dev/agent-web-react'

/**
 * Build a local WebLLM model, statically importing `webLLM` so the bundler
 * includes it (the WebLLM engine in local-engines.ts uses it). The core's own
 * `await import('@browser-ai/web-llm')` is a bare, `@vite-ignore`d specifier
 * that a bundle can't resolve — it surfaces at runtime as `webLLM is not a
 * function`.
 */
export const createLocalModel: WebLLMModelFactory = (modelId, options) => {
  // WebLLM loads its models with a 4096-token window; load with the model's
  // own (see models.ts). It goes in engineConfig.appConfig — @browser-ai/web-llm
  // ignores its top-level `appConfig` setting.
  const { contextWindowTokens, ...rest } = options ?? {}
  const settings = contextWindowTokens
    ? {
        ...rest,
        engineConfig: {
          ...(rest.engineConfig as object | undefined),
          appConfig: withWebLLMContextWindow(prebuiltAppConfig, modelId, contextWindowTokens),
        },
      }
    : rest
  return Promise.resolve(webLLM(modelId, settings as never) as never)
}
