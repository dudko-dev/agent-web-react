import type { ProviderType } from '@dudko.dev/agent-web'

export interface ModelOption {
  id: string
  label: string
  /** 'web-llm' is handled specially (local, no key); the rest are cloud specs. */
  providerType: ProviderType
  model: string
  /** For cloud providers: the vault ref the key is stored under. */
  credentialRef?: string
  keyLabel?: string
  keyPlaceholder?: string
  keyUrl?: string
  /** A short note about direct-browser BYOK reliability / CORS. */
  note: string
}

/**
 * The models the demo can drive. Google (Gemini) and local WebLLM are the most
 * reliable from a browser origin; OpenAI/Anthropic may hit CORS unless you put
 * a proxy in front (see the agent-web providers docs).
 *
 * Cloud models use Google's / OpenAI's rolling `*-latest` aliases where they
 * exist so this list doesn't drift out of date — the demo builds each provider
 * model directly (see `providers.ts`).
 */
export const MODELS: ModelOption[] = [
  {
    id: 'google',
    label: 'Google · Gemini Flash (latest)',
    providerType: 'google',
    model: 'gemini-flash-latest',
    credentialRef: 'google',
    keyLabel: 'Google AI Studio key',
    keyPlaceholder: 'AIza…',
    keyUrl: 'https://aistudio.google.com/apikey',
    note: 'Reliable direct BYOK from the browser — recommended for this demo. Tracks the current Gemini Flash via the rolling “latest” alias.',
  },
  {
    id: 'google-lite',
    label: 'Google · Gemini Flash-Lite (latest)',
    providerType: 'google',
    model: 'gemini-flash-lite-latest',
    credentialRef: 'google',
    keyLabel: 'Google AI Studio key',
    keyPlaceholder: 'AIza…',
    keyUrl: 'https://aistudio.google.com/apikey',
    note: 'Cheapest, fastest Gemini tier — great for high-throughput tool use. Uses the same Google key as above.',
  },
  {
    id: 'anthropic',
    label: 'Anthropic · Claude Haiku 4.5',
    providerType: 'anthropic',
    model: 'claude-haiku-4-5',
    credentialRef: 'anthropic',
    keyLabel: 'Anthropic API key',
    keyPlaceholder: 'sk-ant-…',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    note: 'Works directly from the browser (the required opt-in header is injected for you).',
  },
  {
    id: 'openai',
    label: 'OpenAI · GPT-5 mini',
    providerType: 'openai',
    model: 'gpt-5-mini',
    credentialRef: 'openai',
    keyLabel: 'OpenAI API key',
    keyPlaceholder: 'sk-…',
    keyUrl: 'https://platform.openai.com/api-keys',
    note: 'OpenAI blocks direct browser calls (CORS) — expect to need a proxy.',
  },
  {
    id: 'local-qwen',
    label: 'Local · Qwen2.5 1.5B (WebGPU)',
    providerType: 'web-llm',
    model: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    note: 'Runs entirely on your GPU via WebLLM. No key, fully private — a ~1 GB one-time download; needs WebGPU (Chrome/Edge).',
  },
  {
    id: 'local-llama',
    label: 'Local · Llama 3.2 3B (WebGPU)',
    providerType: 'web-llm',
    model: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    note: 'A larger, stronger local model via WebLLM — a ~2 GB one-time download; needs WebGPU (Chrome/Edge).',
  },
]

export const isLocal = (m: ModelOption): boolean => m.providerType === 'web-llm'
