import type { ProviderType } from '@dudko.dev/agent-web'

export interface ModelOption {
  id: string
  /** Optgroup shown in the picker (provider family). */
  group: string
  /** Label within its group. */
  label: string
  /** 'web-llm' is handled specially (local, no key); the rest are cloud specs. */
  providerType: ProviderType
  model: string
  /** For cloud providers: the vault ref the key is stored under. */
  credentialRef?: string
  keyLabel?: string
  keyPlaceholder?: string
  keyUrl?: string
  /** A short note about direct-browser BYOK reliability / CORS / download size. */
  note: string
  /**
   * The context window, in tokens. For local models it is the window the model
   * is LOADED with (WebLLM's default is 4096; more costs KV-cache VRAM, not a
   * download). The agent fits its runs into it; unset = 128k.
   */
  contextWindow?: number
}

// Shared per-provider key metadata (all tiers of a provider use one key).
const GOOGLE = {
  credentialRef: 'google',
  keyLabel: 'Google AI Studio key',
  keyPlaceholder: 'AIza…',
  keyUrl: 'https://aistudio.google.com/apikey',
} as const
const ANTHROPIC = {
  credentialRef: 'anthropic',
  keyLabel: 'Anthropic API key',
  keyPlaceholder: 'sk-ant-…',
  keyUrl: 'https://console.anthropic.com/settings/keys',
} as const
const OPENAI = {
  credentialRef: 'openai',
  keyLabel: 'OpenAI API key',
  keyPlaceholder: 'sk-…',
  keyUrl: 'https://platform.openai.com/api-keys',
} as const

/**
 * The models the demo can drive — three tiers (fast · balanced · smart) per
 * cloud provider, plus a spread of local WebGPU models by parameter count.
 *
 * Cloud model ids are **concrete versions** (not rolling `*-latest` aliases),
 * current as of mid-2026; the demo builds each provider model directly (see
 * `providers.ts`). Google (Gemini) is the most reliable direct BYOK from a
 * browser; Anthropic works with an injected opt-in header; OpenAI blocks direct
 * browser calls (CORS) and needs a proxy.
 */
export const MODELS: ModelOption[] = [
  // ── Google (Gemini) ────────────────────────────────────────────────────────
  {
    id: 'google-flash-lite',
    group: 'Google · Gemini',
    label: 'Gemini 3.1 Flash-Lite — fast',
    providerType: 'google',
    model: 'gemini-3.1-flash-lite-preview',
    ...GOOGLE,
    note: 'Cheapest, fastest Gemini tier — great for high-throughput tool use. Reliable direct BYOK from the browser.',
  },
  {
    id: 'google-flash',
    group: 'Google · Gemini',
    label: 'Gemini 3.5 Flash — balanced',
    providerType: 'google',
    model: 'gemini-3.5-flash',
    ...GOOGLE,
    note: 'The balanced default — recommended for this demo. Reliable direct BYOK from the browser.',
  },
  {
    id: 'google-pro',
    group: 'Google · Gemini',
    label: 'Gemini 3.1 Pro — smart',
    providerType: 'google',
    model: 'gemini-3.1-pro-preview',
    ...GOOGLE,
    note: 'Most capable Gemini for complex reasoning. Reliable direct BYOK from the browser.',
  },

  // ── Anthropic (Claude) ───────────────────────────────────────────────────────
  {
    id: 'anthropic-haiku',
    group: 'Anthropic · Claude',
    label: 'Claude Haiku 4.5 — fast',
    providerType: 'anthropic',
    model: 'claude-haiku-4-5',
    ...ANTHROPIC,
    note: 'Fastest, cheapest Claude. Works directly from the browser (the required opt-in header is injected for you).',
  },
  {
    id: 'anthropic-sonnet',
    group: 'Anthropic · Claude',
    label: 'Claude Sonnet 5 — balanced',
    providerType: 'anthropic',
    model: 'claude-sonnet-5',
    ...ANTHROPIC,
    note: 'Balanced Claude — strong coding & tool use. Works directly from the browser (opt-in header injected).',
  },
  {
    id: 'anthropic-opus',
    group: 'Anthropic · Claude',
    label: 'Claude Opus 4.8 — smart',
    providerType: 'anthropic',
    model: 'claude-opus-4-8',
    ...ANTHROPIC,
    note: 'Most capable Claude. Works directly from the browser (opt-in header injected).',
  },

  // ── OpenAI (GPT) ─────────────────────────────────────────────────────────────
  {
    id: 'openai-nano',
    group: 'OpenAI · GPT',
    label: 'GPT-5.4 nano — fast',
    providerType: 'openai',
    model: 'gpt-5.4-nano',
    ...OPENAI,
    note: 'Smallest, fastest GPT-5. OpenAI blocks direct browser calls (CORS) — expect to need a proxy.',
  },
  {
    id: 'openai-mini',
    group: 'OpenAI · GPT',
    label: 'GPT-5.4 mini — balanced',
    providerType: 'openai',
    model: 'gpt-5.4-mini',
    ...OPENAI,
    note: 'Balanced GPT-5. OpenAI blocks direct browser calls (CORS) — expect to need a proxy.',
  },
  {
    id: 'openai-gpt55',
    group: 'OpenAI · GPT',
    label: 'GPT-5.5 — smart',
    providerType: 'openai',
    model: 'gpt-5.5',
    ...OPENAI,
    note: 'Flagship GPT-5.5 for complex reasoning & coding. OpenAI blocks direct browser calls (CORS) — expect to need a proxy.',
  },

  // ── Local (WebGPU / WebLLM) — no key, fully private ──────────────────────────
  {
    id: 'local-qwen-0_8b',
    group: 'Local · WebGPU (no key)',
    label: 'Qwen3.5 0.8B — ~0.6 GB',
    providerType: 'web-llm',
    model: 'Qwen3.5-0.8B-q4f16_1-MLC',
    contextWindow: 32_768,
    note: 'Tiny & quick to download. Loaded with a 32k window (WebLLM defaults to 4k) — ~2 GB of VRAM. Runs entirely on your GPU via WebLLM — no key, fully private. Needs WebGPU (Chrome/Edge).',
  },
  {
    id: 'local-qwen-2b',
    group: 'Local · WebGPU (no key)',
    label: 'Qwen3.5 2B — ~1.5 GB',
    providerType: 'web-llm',
    model: 'Qwen3.5-2B-q4f16_1-MLC',
    contextWindow: 32_768,
    note: 'Small & capable for tools. Loaded with a 32k window — ~2.6 GB of VRAM. Runs entirely on your GPU via WebLLM — no key, fully private. Needs WebGPU (Chrome/Edge).',
  },
  {
    id: 'local-llama-3b',
    group: 'Local · WebGPU (no key)',
    label: 'Llama 3.2 3B — ~2 GB',
    providerType: 'web-llm',
    model: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    contextWindow: 8_192,
    note: 'A well-rounded 3B. Loaded with an 8k window — ~2.7 GB of VRAM. Runs entirely on your GPU via WebLLM — no key, fully private. Needs WebGPU (Chrome/Edge).',
  },
  {
    id: 'local-qwen-4b',
    group: 'Local · WebGPU (no key)',
    label: 'Qwen3.5 4B — ~2.7 GB',
    providerType: 'web-llm',
    model: 'Qwen3.5-4B-q4f16_1-MLC',
    contextWindow: 16_384,
    note: 'Stronger reasoning at a mid size. Loaded with a 16k window — ~4.3 GB of VRAM. Runs entirely on your GPU via WebLLM — no key. Needs WebGPU.',
  },
  {
    id: 'local-phi-vision',
    group: 'Local · WebGPU (no key)',
    label: 'Phi-3.5 Vision 4B — images · ~2.4 GB',
    providerType: 'web-llm',
    model: 'Phi-3.5-vision-instruct-q4f16_1-MLC',
    contextWindow: 8_192,
    note: 'A local multimodal model: paste, drop or attach an image and ask about it — it never leaves your device. Loaded with an 8k window (an image takes ~750 tokens) — ~5.5 GB of VRAM. Needs WebGPU.',
  },
  {
    id: 'local-llama-8b',
    group: 'Local · WebGPU (no key)',
    label: 'Llama 3.1 8B — ~5 GB',
    providerType: 'web-llm',
    model: 'Llama-3.1-8B-Instruct-q4f16_1-MLC',
    contextWindow: 8_192,
    note: 'Large local model. Loaded with an 8k window. Runs on your GPU via WebLLM — no key. A ~5 GB one-time download; needs WebGPU + ~5.5 GB of VRAM.',
  },
  {
    id: 'local-qwen-9b',
    group: 'Local · WebGPU (no key)',
    label: 'Qwen3.5 9B — ~6 GB',
    providerType: 'web-llm',
    model: 'Qwen3.5-9B-q4f16_1-MLC',
    contextWindow: 16_384,
    note: 'A strong ~9B local model. Loaded with a 16k window — ~6.8 GB of VRAM. Runs on your GPU via WebLLM — no key. A ~6 GB download.',
  },
  {
    id: 'local-llama-13b',
    group: 'Local · WebGPU (no key)',
    label: 'Llama 2 13B — ~7 GB',
    providerType: 'web-llm',
    model: 'Llama-2-13b-chat-hf-q4f16_1-MLC',
    contextWindow: 4_096,
    note: 'The largest local model here (13B), and the oldest: its window is 4k (all it was trained on), so long chats get compacted often. A ~7 GB download; needs WebGPU + ~12 GB of VRAM.',
  },
]

export const isLocal = (m: ModelOption): boolean => m.providerType === 'web-llm'
