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
 */
export const MODELS: ModelOption[] = [
  {
    id: 'google',
    label: 'Google · Gemini 2.0 Flash',
    providerType: 'google',
    model: 'gemini-2.0-flash',
    credentialRef: 'google',
    keyLabel: 'Google AI Studio key',
    keyPlaceholder: 'AIza…',
    keyUrl: 'https://aistudio.google.com/apikey',
    note: 'Reliable direct BYOK from the browser — recommended for this demo.',
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
    note: 'Works directly (the required browser header is injected for you).',
  },
  {
    id: 'openai',
    label: 'OpenAI · GPT-4o mini',
    providerType: 'openai',
    model: 'gpt-4o-mini',
    credentialRef: 'openai',
    keyLabel: 'OpenAI API key',
    keyPlaceholder: 'sk-…',
    keyUrl: 'https://platform.openai.com/api-keys',
    note: 'OpenAI usually blocks direct browser calls (CORS) — expect to need a proxy.',
  },
  {
    id: 'local',
    label: 'Local · Llama 3.2 3B (WebGPU)',
    providerType: 'web-llm',
    model: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    note: 'Runs entirely on your GPU via WebLLM. No key, fully private — but a ~2 GB one-time download and needs WebGPU (Chrome/Edge).',
  },
]

export const isLocal = (m: ModelOption): boolean => m.providerType === 'web-llm'
