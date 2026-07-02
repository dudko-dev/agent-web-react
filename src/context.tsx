import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import type { BrowserAgentConfig } from '@dudko.dev/agent-web'
import { useAgent, type UseAgentOptions, type UseAgentReturn } from './hooks/use-agent.js'

const AgentContext = createContext<UseAgentReturn | null>(null)

export interface AgentProviderProps extends UseAgentOptions {
  /** The agent configuration (see `@dudko.dev/agent-web`). */
  config: BrowserAgentConfig
  children: ReactNode
}

/**
 * Build one agent with {@link useAgent} and share it with the subtree, so a
 * chat panel, a plan view and a usage badge can all read the same live run.
 *
 * ```tsx
 * <AgentProvider config={{ model, tools, credentials }}>
 *   <AgentChat />
 * </AgentProvider>
 * ```
 */
export const AgentProvider = ({ config, children, ...options }: AgentProviderProps) => {
  const agent = useAgent(config, options)
  return <AgentContext.Provider value={agent}>{children}</AgentContext.Provider>
}

/** Read the shared agent. Throws if used outside an {@link AgentProvider}. */
export const useAgentContext = (): UseAgentReturn => {
  const ctx = useContext(AgentContext)
  if (!ctx) throw new Error('useAgentContext must be used within an <AgentProvider>')
  return ctx
}

/** Non-throwing variant: returns `null` when outside a provider. */
export const useOptionalAgentContext = (): UseAgentReturn | null => useContext(AgentContext)
