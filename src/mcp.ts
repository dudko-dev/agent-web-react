// The MCP half of the bindings, behind its own subpath: `@dudko.dev/agent-web-react/mcp`.
//
// WHY THIS IS NOT IN THE MAIN ENTRY. `useMcp` loads the core's `./mcp` subpath with a dynamic
// `import()`, and that was meant to keep `@modelcontextprotocol/sdk` — an optional peer — out of
// the way of hosts that never use MCP. It does at RUNTIME. A bundler does not run anything: for a
// dynamic import it must resolve the target at build time to emit a chunk, and the core's `mcp.js`
// imports the SDK statically (and re-exports `UnauthorizedError` by identity, so that cannot be
// made lazy). So a host that merely imported `useAgent` from the main entry got
// "Module not found: @modelcontextprotocol/sdk/…" from webpack, with MCP nowhere in its code.
//
// A subpath moves the decision to the host, where it belongs: import from here and the SDK is
// needed (and bundled); never import from here and no part of the build ever mentions it. This is
// the same rule the core follows for its own `./mcp`.
export {
  useMcp,
  claimOAuthCallback,
  describeMcpResult,
  isUnauthorizedError,
  readCallbackParams,
  stripOAuthParams,
} from './hooks/use-mcp.js'
export type { McpConnectOptions, McpStatus, UseMcpOptions, UseMcpReturn } from './hooks/use-mcp.js'
export { useMcpServers } from './hooks/use-mcp-servers.js'
export type {
  McpAuthMode,
  McpServerSpec,
  McpServerView,
  UseMcpServersOptions,
  UseMcpServersReturn,
} from './hooks/use-mcp-servers.js'
export type {
  ConnectedMcp,
  McpCatalogEntry,
  McpOAuthCallback,
  McpServerResult,
  McpModule,
} from './mcp-types.js'
