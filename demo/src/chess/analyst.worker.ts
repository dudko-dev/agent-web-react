/// <reference lib="webworker" />
import { serveSubagentWorker, type ProviderModelSpec } from '@dudko.dev/agent-web'
import { buildCloudModel, type CloudProvider } from '../cloud'
import { engineTools } from './analyst-tools'

/**
 * A chess analyst subagent, served from a Web Worker. The parent (the player
 * agent on the page) delegates "analyse this candidate move"; this worker runs
 * its own plan → execute → synthesize loop with a CPU-heavy search tool that
 * would otherwise stall the page, and answers with a verdict.
 *
 * The model is built here from the spec the parent posted (its key arrives with
 * the task and is never stored), with the same builder as the page — the spec's
 * `providerType` carries the demo's cloud provider name.
 */
const resolveModel = (spec: ProviderModelSpec) =>
  buildCloudModel(spec.providerType as CloudProvider, spec.model, spec.apiKey ?? '')

serveSubagentWorker({ resolveModel, tools: engineTools(3) })
