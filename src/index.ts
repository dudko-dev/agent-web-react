// ── Hooks ────────────────────────────────────────────────────────────────────
export { useAgent } from './hooks/use-agent.js'
export type { UseAgentOptions, UseAgentReturn } from './hooks/use-agent.js'
export { useCredentials } from './hooks/use-credentials.js'
export type { UseCredentialsReturn } from './hooks/use-credentials.js'
export { useWebLLMModel } from './hooks/use-webllm-model.js'
export type {
  UseWebLLMModelReturn,
  UseWebLLMModelOptions,
  WebLLMModelFactory,
} from './hooks/use-webllm-model.js'

// ── Context ──────────────────────────────────────────────────────────────────
export { AgentProvider, useAgentContext, useOptionalAgentContext } from './context.js'
export type { AgentProviderProps } from './context.js'

// ── Headless state (the pure event → UI reducer, for custom UIs) ─────────────
export { agentStateReducer, createInitialAgentState } from './state.js'
export type { AgentAction } from './state.js'
export type {
  AgentUiState,
  AgentStatus,
  ChatMessage,
  StepView,
  ToolCallView,
  ModelLoadState,
  ReplanState,
} from './types.js'

// ── Components (optional, pre-styled — import '@dudko.dev/agent-web-react/styles.css') ─
export { AgentChat } from './components/AgentChat.js'
export type { AgentChatProps } from './components/AgentChat.js'
export { MessageList } from './components/MessageList.js'
export type { MessageListProps } from './components/MessageList.js'
export { Composer } from './components/Composer.js'
export type { ComposerProps } from './components/Composer.js'
export { PlanView } from './components/PlanView.js'
export type { PlanViewProps } from './components/PlanView.js'
export { StepList } from './components/StepList.js'
export type { StepListProps } from './components/StepList.js'
export { ModelLoadBar } from './components/ModelLoadBar.js'
export type { ModelLoadBarProps } from './components/ModelLoadBar.js'
export { UsageBadge } from './components/UsageBadge.js'
export type { UsageBadgeProps } from './components/UsageBadge.js'
export { ApiKeyForm } from './components/ApiKeyForm.js'
export type { ApiKeyFormProps } from './components/ApiKeyForm.js'

// ── Convenience re-exports from the core (a peer dep), so a React app can
//    import the agent primitives it needs from one place. ──────────────────────
export {
  createAgent,
  defineTool,
  createWebLLMModel,
  isWebGPUAvailable,
  VaultCredentialStore,
  MemoryCredentialStore,
} from '@dudko.dev/agent-web'
export type {
  Agent,
  RunOptions,
  RunResult,
  BrowserAgentConfig,
  AgentEvent,
  AgentEventHandler,
  AgentTool,
  AgentToolSet,
  CredentialStore,
  ProviderModelSpec,
  ProviderType,
  ModelInput,
  IPlan,
  IPlanStep,
  IStepResult,
  IToolCall,
  IUsage,
} from '@dudko.dev/agent-web'
