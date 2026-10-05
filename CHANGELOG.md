# 0.0.13 / 2026-10-05

### :tada: Enhancements
- `useWebLLMModel({ contextWindowTokens })` loads a local model with a larger window than WebLLM's 4096 (a different window is a different load); `contextWindow` reports the loaded window
- Demo: every local model is loaded with its own window (Qwen3.5 0.8B/2B 32k, 4B/9B 16k, Llama 3.x 8k, Llama 2 13B 4k) and the agent fits its runs into it — no more "Prompt tokens exceed context window size"; the Window setting is "auto" (the model's) by default; a local multimodal model, Phi-3.5 Vision
- Updated dependencies: @dudko.dev/agent-web 0.0.22 (runs fitted to the model's window, local vision models)

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

