import type { LanguageModel } from 'ai'

/** The cloud providers the demo calls straight from the browser (BYOK). */
export type CloudProvider =
  'google' | 'anthropic' | 'openai' | 'moonshotai' | 'groq' | 'cerebras' | 'mistral' | 'openrouter'

/**
 * Build a cloud provider's `LanguageModel` **in the app** — on the page and in
 * the analyst worker alike — and hand it to the agent as a direct model.
 *
 * The core (`@dudko.dev/agent-web`) can also resolve a `{ providerType, model,
 * credentialRef }` spec by dynamically importing the provider package — but
 * that `import(pkg)` is `@vite-ignore`d and uses a bare specifier, which a
 * browser bundle can't resolve at runtime. A literal `import('@ai-sdk/…')`
 * here is one Vite can see: each provider becomes its own chunk, fetched the
 * first time a model of it is used.
 *
 * Every one of these answers a browser directly (CORS, checked October 2026);
 * Anthropic only with its opt-in header.
 */
export const buildCloudModel = async (
  provider: CloudProvider,
  model: string,
  apiKey: string,
): Promise<LanguageModel> => {
  switch (provider) {
    case 'google': {
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google')
      return createGoogleGenerativeAI({ apiKey })(model)
    }
    case 'anthropic': {
      const { createAnthropic } = await import('@ai-sdk/anthropic')
      return createAnthropic({
        apiKey,
        // Anthropic's API refuses direct browser calls without this opt-in header.
        headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
      })(model)
    }
    case 'openai': {
      const { createOpenAI } = await import('@ai-sdk/openai')
      return createOpenAI({ apiKey })(model)
    }
    case 'moonshotai': {
      const { createMoonshotAI } = await import('@ai-sdk/moonshotai')
      return createMoonshotAI({ apiKey })(model)
    }
    case 'groq': {
      const { createGroq } = await import('@ai-sdk/groq')
      return createGroq({ apiKey })(model)
    }
    case 'cerebras': {
      const { createCerebras } = await import('@ai-sdk/cerebras')
      return createCerebras({ apiKey })(model)
    }
    case 'mistral': {
      const { createMistral } = await import('@ai-sdk/mistral')
      return createMistral({ apiKey })(model)
    }
    case 'openrouter': {
      const { createOpenRouter } = await import('@openrouter/ai-sdk-provider')
      return createOpenRouter({ apiKey }).chat(model) as LanguageModel
    }
    default:
      throw new Error(`unsupported cloud provider: ${provider as string}`)
  }
}
