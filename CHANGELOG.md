# 0.0.13 / 2026-10-05

### :tada: Enhancements
- `useLocalModel(id, engine)`: load any on-device runtime (WebLLM, the browser's built-in model, transformers.js, your own) with progress, switching and unloading; `useWebLLMModel` is it with `createWebLLMEngine`
- `useWebLLMModel({ contextWindowTokens })` loads a local model with a larger window than WebLLM's 4096 (a different window is a different load); `contextWindow` reports the loaded window
- Demo — windows: every local model is loaded with its own window and the agent fits its runs into it — no more "Prompt tokens exceed context window size"; the Window setting is "auto" (the model's) by default
- Demo — models: current Gemini (3.8 Flash, 3.5 Flash-Lite, 3.1 Pro), Claude (Haiku 4.5, Sonnet 5.5, Opus 5.5, Fable 5.1) and GPT-6 (Luna, Sol, Astra); new providers Kimi (K2.6, K3), Groq and Cerebras (fast), Mistral, OpenRouter (any model id); local Gemma 3 1B, Llama 3.2 1B, Ministral 3 3B, Phi-4 mini, Phi-3.5 Vision (WebLLM), Gemini Nano (Chrome's built-in model) and SmolVLM / Gemma 4 E2B (transformers.js); Llama 2 13B removed. Every provider and runtime loads on first use.
- Demo — speed: "Fast answers" (no replanner and no synthesizer: 2 model calls per turn)
- Updated dependencies: @dudko.dev/agent-web 0.0.22 (runs fitted to the model's window, local vision models, provider capabilities)

# 0.0.12 / 2026-10-03

### :tada: Enhancements
- `useWebLLMModel` follows the current model id: switching models shows the new one as not loaded (it used to keep reporting the old one as ready); the previous model stays in memory until the next load frees it first; new `unload()` and `loadedModelId`
- `useAgent`: a setting changed mid-run no longer flips the panel out of "running"; the next run uses the new agent
- "No thinking" (`none`) thinking level in the composer chip and labels
- Demo: chess endings decided by the rules (a mating move is never answered by the agent; the result covers the board and closes the chat), a failed agent turn shown with its reason and the board locked until it moves (Retry / Engine move); the model card names the model in GPU memory and can unload it
- Updated dependencies: @dudko.dev/agent-web 0.0.21 (WebLLM thinking switch)

# 0.0.11 / 2026-10-03

### :tada: Enhancements
- Updated dependencies: @modelcontextprotocol/sdk

# 0.0.9 / 2026-09-26

### :tada: Enhancements
- Updated dependencies: @dudko.dev/agent-web, @modelcontextprotocol/sdk, prettier

# 0.0.8 / 2026-09-19

### :tada: Enhancements
- Updated dependencies: @dudko.dev/agent-web, @playwright/test, @types/react, @types/react-dom, prettier, react, react-dom, typescript

# 0.0.7 / 2026-08-29

### :tada: Enhancements
- Updated dependencies: @types/react-dom

# 0.0.6 / 2026-08-21

### :tada: Enhancements
- Updated dependencies: typescript

# 0.0.3 / 2026-08-14

### :tada: Enhancements
- Updated dependencies: @types/react, @types/react-dom, prettier, react, react-dom, typescript

