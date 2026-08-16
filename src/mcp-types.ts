import type { AgentToolSet } from '@dudko.dev/agent-web'

/**
 * Structural types for the core's OPTIONAL `@dudko.dev/agent-web/mcp` subpath.
 *
 * The subpath is loaded with a dynamic import and typed here rather than
 * imported, for two reasons: it drags in `@modelcontextprotocol/sdk` (an
 * optional peer of the core, which apps without MCP must not have to install),
 * and the OAuth half only exists in newer cores while this package supports
 * `@dudko.dev/agent-web >= 0.0.6`. `useMcp` feature-detects at runtime and
 * reports `oauthSupported: false` on an older core instead of crashing.
 */

export interface McpCatalogEntry {
  name: string
  description: string
  server: string
}

export interface McpServerResult {
  name: string
  connected: boolean
  error?: string
  needsAuthorization?: boolean
}

export interface ConnectedMcp {
  tools: AgentToolSet
  catalog: McpCatalogEntry[]
  results: McpServerResult[]
  refreshServer?: (name: string) => Promise<void>
  close: () => Promise<void>
}

export interface McpHttpServerConfig {
  url: string
  headers?: Record<string, string>
  authProvider?: unknown
}

export interface McpOAuthCallback {
  code?: string
  state?: string
  error?: string
  errorDescription?: string
}

export interface BrowserOAuthProvider {
  serverUrl: string
  authorizationUrl?: URL
  isAuthorized(): Promise<boolean>
  reset(): Promise<void>
}

export interface BrowserOAuthProviderOptions {
  serverUrl: string
  redirectUrl: string
  clientName?: string
  scope?: string
}

/** The shape of the subpath module, as far as this package uses it. */
export interface McpModule {
  connectMcpHttp: (
    servers: Record<string, McpHttpServerConfig>,
    opts?: { clientName?: string; onLog?: (level: string, message: string) => void },
  ) => Promise<ConnectedMcp>
  BrowserOAuthProvider?: new (opts: BrowserOAuthProviderOptions) => BrowserOAuthProvider
  readOAuthCallback?: (input?: string | URL) => McpOAuthCallback | undefined
  finishMcpOAuth?: (provider: BrowserOAuthProvider, callback: McpOAuthCallback) => Promise<void>
  /**
   * The SDK's error class, re-exported by the core so an authorization failure
   * can be recognised by identity. Absent on cores older than 0.0.12.
   */
  UnauthorizedError?: new (message?: string) => Error
}
