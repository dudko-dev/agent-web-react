import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { webLLM } from '@browser-ai/web-llm'
import type { LanguageModel } from 'ai'
import type { WebLLMModelFactory } from '@dudko.dev/agent-web-react'
import type { ModelOption } from './models'

/**
 * Build a cloud provider's `LanguageModel` **in the app**, then hand it to the
 * agent as a direct model.
 *
 * The core (`@dudko.dev/agent-web`) can also resolve a `{ providerType, model,
 * credentialRef }` spec by dynamically importing the provider package — but
 * that `import(pkg)` is `@vite-ignore`d and uses a bare specifier, which a
 * browser bundle can't resolve at runtime. The core then reports
 * `Provider package "@ai-sdk/…" is not installed`. Importing the factories
 * statically here lets Vite bundle them, and passing the built model directly
 * sidesteps the dynamic import entirely.
 */
export const buildCloudModel = (model: ModelOption, apiKey: string): LanguageModel => {
  switch (model.providerType) {
    case 'google':
      return createGoogleGenerativeAI({ apiKey })(model.model)
    case 'anthropic':
      return createAnthropic({
        apiKey,
        // Anthropic's SDK refuses direct browser calls without this opt-in header.
        headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
      })(model.model)
    case 'openai':
      return createOpenAI({ apiKey })(model.model)
    default:
      throw new Error(`unsupported cloud provider: ${model.providerType}`)
  }
}

/**
 * Build a local WebLLM model, statically importing `webLLM` so the bundler
 * includes it. Passed to `useWebLLMModel({ create })` — same root cause as the
 * cloud case: the core's `await import('@browser-ai/web-llm')` gets stubbed to
 * an empty module by Vite, which surfaces at runtime as `webLLM is not a
 * function`.
 */
export const createLocalModel: WebLLMModelFactory = (modelId, options) =>
  Promise.resolve(webLLM(modelId, options as never) as never)
