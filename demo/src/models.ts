import type { CloudProvider } from './cloud'

/** Where a model runs: a cloud API (your key) or this device. */
export type Runtime = 'cloud' | 'web-llm' | 'built-in' | 'transformers-js'

export interface ModelOption {
  id: string
  /** Optgroup shown in the picker (provider family / runtime). */
  group: string
  /** Label within its group. */
  label: string
  runtime: Runtime
  /** For cloud models: the provider whose API is called. */
  provider?: CloudProvider
  /** The model id as the API / runtime expects it. */
  model: string
  /** OpenRouter's "any model": the id is typed by the user (`model` is the placeholder). */
  customModel?: boolean
  /** For cloud providers: the vault ref the key is stored under. */
  credentialRef?: string
  keyLabel?: string
  keyPlaceholder?: string
  keyUrl?: string
  /** What it is good at, what it costs (VRAM / download), and anything to know. */
  note: string
  /**
   * The context window, in tokens. For WebLLM models it is the window the
   * model is LOADED with (WebLLM's default is 4096; more costs KV-cache VRAM,
   * not a download). The agent fits its runs into it; unset = 128k.
   */
  contextWindow?: number
  /** Takes images, where the core can't tell from the model (built-in, Gemma 4). */
  vision?: boolean
}

// Shared per-provider key metadata (all models of a provider use one key).
const GOOGLE = {
  runtime: 'cloud',
  provider: 'google',
  credentialRef: 'google',
  keyLabel: 'Google AI Studio key',
  keyPlaceholder: 'AIza…',
  keyUrl: 'https://aistudio.google.com/apikey',
} as const
const ANTHROPIC = {
  runtime: 'cloud',
  provider: 'anthropic',
  credentialRef: 'anthropic',
  keyLabel: 'Anthropic API key',
  keyPlaceholder: 'sk-ant-…',
  keyUrl: 'https://console.anthropic.com/settings/keys',
} as const
const OPENAI = {
  runtime: 'cloud',
  provider: 'openai',
  credentialRef: 'openai',
  keyLabel: 'OpenAI API key',
  keyPlaceholder: 'sk-…',
  keyUrl: 'https://platform.openai.com/api-keys',
} as const
const KIMI = {
  runtime: 'cloud',
  provider: 'moonshotai',
  credentialRef: 'moonshot',
  keyLabel: 'Moonshot (Kimi) API key',
  keyPlaceholder: 'sk-…',
  keyUrl: 'https://platform.kimi.ai/',
} as const
const GROQ = {
  runtime: 'cloud',
  provider: 'groq',
  credentialRef: 'groq',
  keyLabel: 'Groq API key',
  keyPlaceholder: 'gsk_…',
  keyUrl: 'https://console.groq.com/keys',
} as const
const CEREBRAS = {
  runtime: 'cloud',
  provider: 'cerebras',
  credentialRef: 'cerebras',
  keyLabel: 'Cerebras API key',
  keyPlaceholder: 'csk-…',
  keyUrl: 'https://cloud.cerebras.ai/',
} as const
const MISTRAL = {
  runtime: 'cloud',
  provider: 'mistral',
  credentialRef: 'mistral',
  keyLabel: 'Mistral API key',
  keyPlaceholder: 'your Mistral key',
  keyUrl: 'https://console.mistral.ai/api-keys',
} as const
const OPENROUTER = {
  runtime: 'cloud',
  provider: 'openrouter',
  credentialRef: 'openrouter',
  keyLabel: 'OpenRouter API key',
  keyPlaceholder: 'sk-or-…',
  keyUrl: 'https://openrouter.ai/keys',
} as const
const WEBLLM = { group: 'Local · WebLLM (WebGPU, no key)', runtime: 'web-llm' } as const

/**
 * The models the demo can drive: cloud providers called straight from the
 * page with the user's key (every one sends CORS headers — checked October
 * 2026), and on-device models in three runtimes. Cloud ids are concrete
 * versions, current as of October 2026; the demo builds each model itself
 * (see `cloud.ts` and `local-engines.ts`).
 */
export const MODELS: ModelOption[] = [
  // ── Google (Gemini) — 1M window, images & PDFs ─────────────────────────────
  {
    id: 'google-flash-lite',
    group: 'Google · Gemini',
    label: 'Gemini 3.5 Flash-Lite — fast',
    model: 'gemini-3.5-flash-lite',
    ...GOOGLE,
    contextWindow: 1_048_576,
    note: 'Cheap and fast ($0.30 / $2.50 per 1M tokens), images and PDFs, a free tier.',
  },
  {
    id: 'google-flash',
    group: 'Google · Gemini',
    label: 'Gemini 3.8 Flash — balanced',
    model: 'gemini-3.8-flash',
    ...GOOGLE,
    contextWindow: 1_048_576,
    note: 'The newest Flash and the demo’s default: strong tool use, images and PDFs, a free tier ($0.75 / $3.75 per 1M until the end of 2026).',
  },
  {
    id: 'google-pro',
    group: 'Google · Gemini',
    label: 'Gemini 3.1 Pro — smart',
    model: 'gemini-3.1-pro-preview',
    ...GOOGLE,
    contextWindow: 1_048_576,
    note: 'The most capable Gemini (a preview; no free tier).',
  },

  // ── Anthropic (Claude) ───────────────────────────────────────────────────────
  {
    id: 'anthropic-haiku',
    group: 'Anthropic · Claude',
    label: 'Claude Haiku 4.5 — fast',
    model: 'claude-haiku-4-5',
    ...ANTHROPIC,
    contextWindow: 200_000,
    note: 'The fastest, cheapest Claude (retires no sooner than 15 Oct 2026). Called from the page with the opt-in header Anthropic requires.',
  },
  {
    id: 'anthropic-sonnet',
    group: 'Anthropic · Claude',
    label: 'Claude Sonnet 5.5 — balanced',
    model: 'claude-sonnet-5-5',
    ...ANTHROPIC,
    contextWindow: 1_000_000,
    note: 'Balanced Claude: strong coding and tool use, images and PDFs, a 1M window.',
  },
  {
    id: 'anthropic-opus',
    group: 'Anthropic · Claude',
    label: 'Claude Opus 5.5 — smart',
    model: 'claude-opus-5-5',
    ...ANTHROPIC,
    contextWindow: 1_000_000,
    note: 'Anthropic’s recommended default for hard tasks, a 1M window.',
  },
  {
    id: 'anthropic-fable',
    group: 'Anthropic · Claude',
    label: 'Claude Fable 5.1 — top tier',
    model: 'claude-fable-5-1',
    ...ANTHROPIC,
    contextWindow: 1_000_000,
    note: 'The most capable Claude ($10 / $50 per 1M tokens).',
  },

  // ── OpenAI (GPT-6) ───────────────────────────────────────────────────────────
  {
    id: 'openai-luna',
    group: 'OpenAI · GPT',
    label: 'GPT-6 Luna — fast',
    model: 'gpt-6-luna',
    ...OPENAI,
    contextWindow: 922_000,
    note: 'The cheapest GPT-6 ($0.10 / $0.50 per 1M tokens), images.',
  },
  {
    id: 'openai-sol',
    group: 'OpenAI · GPT',
    label: 'GPT-6.1 Sol — balanced',
    model: 'gpt-6.1-sol',
    ...OPENAI,
    contextWindow: 922_000,
    note: 'Balanced GPT-6 (tools through the Responses API, which the AI SDK uses).',
  },
  {
    id: 'openai-astra',
    group: 'OpenAI · GPT',
    label: 'GPT-6 Astra — smart',
    model: 'gpt-6-astra',
    ...OPENAI,
    contextWindow: 922_000,
    note: 'OpenAI’s flagship.',
  },

  // ── Moonshot (Kimi) ──────────────────────────────────────────────────────────
  {
    id: 'kimi-k2_6',
    group: 'Moonshot · Kimi',
    label: 'Kimi K2.6 — balanced',
    model: 'kimi-k2.6',
    ...KIMI,
    contextWindow: 262_144,
    note: 'Cheap ($0.95 / $4 per 1M tokens), images and video, thinking you can switch off. No PDFs (convert them first).',
  },
  {
    id: 'kimi-k3',
    group: 'Moonshot · Kimi',
    label: 'Kimi K3 — smart',
    model: 'kimi-k3',
    ...KIMI,
    contextWindow: 1_048_576,
    note: 'Kimi’s flagship (open weights): always thinks, images and video, a 1M window ($3 / $15 per 1M).',
  },

  // ── Fast inference (Groq, Cerebras) ──────────────────────────────────────────
  {
    id: 'groq-oss-20b',
    group: 'Fast · Groq / Cerebras',
    label: 'GPT-OSS 20B on Groq — fastest',
    model: 'openai/gpt-oss-20b',
    ...GROQ,
    contextWindow: 131_072,
    note: 'Answers in a blink: Groq runs it at ~1000 tokens/s. Text only.',
  },
  {
    id: 'groq-oss-120b',
    group: 'Fast · Groq / Cerebras',
    label: 'GPT-OSS 120B on Groq',
    model: 'openai/gpt-oss-120b',
    ...GROQ,
    contextWindow: 131_072,
    note: 'The bigger open GPT, still very fast. Text only.',
  },
  {
    id: 'groq-qwen',
    group: 'Fast · Groq / Cerebras',
    label: 'Qwen3.8 27B on Groq — images',
    model: 'qwen/qwen3.8-27b',
    ...GROQ,
    contextWindow: 131_072,
    note: 'Fast and multimodal (a preview on Groq): images, tools, reasoning.',
  },
  {
    id: 'cerebras-oss-120b',
    group: 'Fast · Groq / Cerebras',
    label: 'GPT-OSS 120B on Cerebras',
    model: 'gpt-oss-120b',
    ...CEREBRAS,
    contextWindow: 65_536,
    note: 'Among the fastest inference there is. Cerebras answers errors without CORS headers, so a wrong key shows as a network error.',
  },

  // ── Mistral ──────────────────────────────────────────────────────────────────
  {
    id: 'mistral-small',
    group: 'Mistral',
    label: 'Mistral Small 4 — fast',
    model: 'mistral-small-2603',
    ...MISTRAL,
    contextWindow: 262_144,
    note: 'Cheap ($0.15 / $0.60 per 1M tokens) and quick, images.',
  },
  {
    id: 'mistral-medium',
    group: 'Mistral',
    label: 'Mistral Medium 3.5 — balanced',
    model: 'mistral-medium-2604',
    ...MISTRAL,
    contextWindow: 262_144,
    note: 'Mistral’s balanced model, images.',
  },

  // ── OpenRouter: one key, any model ───────────────────────────────────────────
  {
    id: 'openrouter-kimi',
    group: 'OpenRouter (any model)',
    label: 'Kimi K3 via OpenRouter',
    model: 'moonshotai/kimi-k3',
    ...OPENROUTER,
    contextWindow: 1_048_576,
    note: 'One OpenRouter key reaches every provider it lists.',
  },
  {
    id: 'openrouter-custom',
    group: 'OpenRouter (any model)',
    label: 'Any model — type its id',
    model: 'deepseek/deepseek-v4-pro',
    customModel: true,
    ...OPENROUTER,
    note: 'Type any OpenRouter model id (provider/model), e.g. deepseek/deepseek-v4-pro, zai-org/glm-5.3, qwen/qwen3.8-27b.',
  },

  // ── Local: WebLLM (WebGPU) — no key, nothing leaves the device ──────────────
  {
    id: 'local-gemma3-1b',
    ...WEBLLM,
    label: 'Gemma 3 1B — fastest · ~0.7 GB',
    model: 'gemma3-1b-it-q4f16_1-MLC',
    contextWindow: 8_192,
    note: 'The quickest local model to download and to answer. 8k window (its maximum) — ~0.8 GB of VRAM.',
  },
  {
    id: 'local-llama-1b',
    ...WEBLLM,
    label: 'Llama 3.2 1B — fast · ~0.9 GB',
    model: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    contextWindow: 16_384,
    note: 'Small and quick. Loaded with a 16k window — ~1.3 GB of VRAM.',
  },
  {
    id: 'local-qwen-0_8b',
    ...WEBLLM,
    label: 'Qwen3.5 0.8B — ~0.6 GB',
    model: 'Qwen3.5-0.8B-q4f16_1-MLC',
    contextWindow: 32_768,
    note: 'Tiny, with a 32k window (WebLLM defaults to 4k) — ~2 GB of VRAM. It thinks by default: set Thinking to "none" for faster answers.',
  },
  {
    id: 'local-qwen-2b',
    ...WEBLLM,
    label: 'Qwen3.5 2B — ~1.5 GB',
    model: 'Qwen3.5-2B-q4f16_1-MLC',
    contextWindow: 32_768,
    note: 'Small and capable with tools. 32k window — ~2.6 GB of VRAM. Thinking "none" makes it faster.',
  },
  {
    id: 'local-ministral-3b',
    ...WEBLLM,
    label: 'Ministral 3 3B — ~2.5 GB',
    model: 'Ministral-3-3B-Instruct-2512-BF16-q4f16_1-MLC',
    contextWindow: 8_192,
    note: 'Mistral’s small model (Dec 2025). 8k window — ~3.3 GB of VRAM.',
  },
  {
    id: 'local-llama-3b',
    ...WEBLLM,
    label: 'Llama 3.2 3B — ~2 GB',
    model: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    contextWindow: 8_192,
    note: 'A well-rounded 3B. 8k window — ~2.7 GB of VRAM.',
  },
  {
    id: 'local-phi4-mini',
    ...WEBLLM,
    label: 'Phi-4 mini 3.8B — ~2.5 GB',
    model: 'Phi-4-mini-instruct-q4f16_1-MLC',
    contextWindow: 8_192,
    note: 'Microsoft’s small model, good at reasoning and code. 8k window — ~3.9 GB of VRAM.',
  },
  {
    id: 'local-qwen-4b',
    ...WEBLLM,
    label: 'Qwen3.5 4B — ~2.7 GB',
    model: 'Qwen3.5-4B-q4f16_1-MLC',
    contextWindow: 16_384,
    note: 'Stronger reasoning at a mid size. 16k window — ~4.3 GB of VRAM.',
  },
  {
    id: 'local-phi-vision',
    ...WEBLLM,
    label: 'Phi-3.5 Vision 4B — images · ~2.4 GB',
    model: 'Phi-3.5-vision-instruct-q4f16_1-MLC',
    contextWindow: 8_192,
    note: 'A local multimodal model: paste, drop or attach an image and ask about it — it never leaves your device. 8k window (an image takes ~750 tokens) — ~5.5 GB of VRAM.',
  },
  {
    id: 'local-llama-8b',
    ...WEBLLM,
    label: 'Llama 3.1 8B — ~5 GB',
    model: 'Llama-3.1-8B-Instruct-q4f16_1-MLC',
    contextWindow: 8_192,
    note: 'A large local model. 8k window — ~5.5 GB of VRAM.',
  },
  {
    id: 'local-qwen-9b',
    ...WEBLLM,
    label: 'Qwen3.5 9B — ~6 GB',
    model: 'Qwen3.5-9B-q4f16_1-MLC',
    contextWindow: 16_384,
    note: 'The strongest local model here. 16k window — ~6.8 GB of VRAM.',
  },

  // ── Local: the browser's own model ───────────────────────────────────────────
  {
    id: 'built-in-nano',
    group: 'Local · built into the browser',
    label: 'Gemini Nano (Chrome) — no download',
    runtime: 'built-in',
    model: 'gemini-nano',
    vision: true,
    note: 'Chrome’s built-in model (the Prompt API, Chrome 148+ on desktop): the page downloads nothing, it takes images. Small window (a few thousand tokens) — keep chats short.',
  },

  // ── Local: transformers.js (ONNX on WebGPU) ─────────────────────────────────
  {
    id: 'tjs-smolvlm',
    group: 'Local · transformers.js (WebGPU)',
    label: 'SmolVLM 256M — images · ~0.2 GB',
    runtime: 'transformers-js',
    model: 'HuggingFaceTB/SmolVLM-256M-Instruct',
    contextWindow: 8_192,
    note: 'A tiny, fast vision model: describe or read an image. Too small to drive tools well — ask it about pictures.',
  },
  {
    id: 'tjs-gemma4-e2b',
    group: 'Local · transformers.js (WebGPU)',
    label: 'Gemma 4 E2B — images · ~3.5 GB',
    runtime: 'transformers-js',
    model: 'onnx-community/gemma-4-E2B-it-ONNX',
    contextWindow: 32_768,
    vision: true,
    note: 'Google’s on-device multimodal model (text and images; a 128k window, run here with 32k). Experimental in this demo: a large first download.',
  },
]

export const isLocal = (m: ModelOption): boolean => m.runtime !== 'cloud'
