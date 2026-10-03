/// <reference lib="webworker" />
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { serveSubagentWorker, type ProviderModelSpec } from '@dudko.dev/agent-web'
import { engineTools } from './analyst-tools'

/**
 * A chess analyst subagent, served from a Web Worker. The parent (the player
 * agent on the page) delegates "analyse this candidate move"; this worker runs
 * its own plan → execute → synthesize loop with a CPU-heavy search tool that
 * would otherwise stall the page, and answers with a verdict.
 *
 * The model is built here from the spec the parent posted (its key arrives with
 * the task and is never stored). Provider factories are imported statically —
 * a bundler cannot resolve the core's dynamic provider imports in a worker.
 */
const resolveModel = (spec: ProviderModelSpec) => {
  const apiKey = spec.apiKey
  switch (spec.providerType) {
    case 'google':
      return createGoogleGenerativeAI({ apiKey })(spec.model)
    case 'anthropic':
      return createAnthropic({
        apiKey,
        headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
      })(spec.model)
    case 'openai':
      return createOpenAI({ apiKey })(spec.model)
    default:
      throw new Error(`the analyst worker has no factory for "${spec.providerType}"`)
  }
}

serveSubagentWorker({ resolveModel, tools: engineTools(3) })
