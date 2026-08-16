import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentToolSet } from '@dudko.dev/agent-web'
import type {
  BrowserOAuthProvider,
  ConnectedMcp,
  McpCatalogEntry,
  McpModule,
  McpServerResult,
} from '../mcp-types.js'

export type McpStatus = 'idle' | 'connecting' | 'connected' | 'needs-authorization' | 'error'

export interface McpConnectOptions {
  /** The server's StreamableHTTP endpoint. */
  url: string
  /** Prefix for the discovered tool names ("<name>__<tool>"). Default 'mcp'. */
  name?: string
  /** Static headers, e.g. `{ Authorization: 'Bearer …' }`. Ignored when `oauth` is set. */
  headers?: Record<string, string>
  /**
   * Authenticate with OAuth 2.1 + dynamic client registration. Requires a core
   * that ships the OAuth provider; check `oauthSupported` before offering it.
   */
  oauth?: boolean | { redirectUrl?: string; scope?: string; clientName?: string }
}

export interface UseMcpOptions {
  /** Client name reported to the MCP server during initialize. */
  clientName?: string
  /** Called with connector log lines — handy while debugging a server. */
  onLog?: (level: string, message: string) => void
}

export interface UseMcpReturn {
  status: McpStatus
  /** Merge into `BrowserAgentConfig.tools` once `status === 'connected'`. */
  tools?: AgentToolSet
  catalog: McpCatalogEntry[]
  error?: string
  /** Where to send the user when `status === 'needs-authorization'`. */
  authorizationUrl?: string
  /**
   * Whether the installed core exposes the OAuth API. `undefined` until the
   * optional subpath has been loaded once (first `connect`, or a callback).
   */
  oauthSupported?: boolean
  /** True while an OAuth redirect is being finished on mount. */
  completingAuthorization: boolean
  connect: (options: McpConnectOptions) => Promise<void>
  disconnect: () => Promise<void>
  /** Navigate to the authorization server. Call it from a user gesture. */
  authorize: () => void
  /** Drop the stored tokens and dynamic registration for the current server. */
  forgetAuthorization: () => Promise<void>
}

const OAUTH_UNSUPPORTED =
  'The installed @dudko.dev/agent-web has no MCP OAuth support. Upgrade the core to a version exporting BrowserOAuthProvider, or use a static Authorization header.'

const STORAGE_KEY = 'agent-web-react:mcp:pending'

interface PendingConnect {
  url: string
  name?: string
  redirectUrl?: string
  scope?: string
  clientName?: string
}

let modulePromise: Promise<McpModule> | undefined

/**
 * Load the core's optional `./mcp` subpath. Kept dynamic so apps that never
 * touch MCP don't pull `@modelcontextprotocol/sdk` into their bundle, and so a
 * core without the OAuth half degrades to a clear message instead of a crash.
 */
const loadMcp = (): Promise<McpModule> => {
  modulePromise ??= import('@dudko.dev/agent-web/mcp').then((m) => m as unknown as McpModule)
  return modulePromise
}

/** Map a single server's connect outcome onto the hook's status. Pure. */
export const describeMcpResult = (
  result: McpServerResult | undefined,
): { status: McpStatus; error?: string } => {
  if (!result) return { status: 'error', error: 'The connector returned no result for the server' }
  if (result.connected) return { status: 'connected' }
  if (result.needsAuthorization) return { status: 'needs-authorization' }
  return { status: 'error', error: result.error ?? 'Could not connect to the MCP server' }
}

/**
 * Remove the OAuth response parameters from a URL, leaving the rest intact.
 * The code is single-use and lands in history, referrers and screenshots —
 * clear it as soon as it has been exchanged.
 */
export const stripOAuthParams = (href: string): string => {
  const url = new URL(href)
  for (const key of ['code', 'state', 'error', 'error_description', 'iss']) {
    url.searchParams.delete(key)
  }
  return url.toString()
}

const looksLikeCallback = (): boolean => {
  if (typeof globalThis.location === 'undefined') return false
  const params = new URLSearchParams(globalThis.location.search)
  return params.has('code') || params.has('error')
}

const readPending = (): PendingConnect | undefined => {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as PendingConnect) : undefined
  } catch {
    return undefined
  }
}

const writePending = (value: PendingConnect | undefined): void => {
  try {
    if (value) globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(value))
    else globalThis.localStorage?.removeItem(STORAGE_KEY)
  } catch {
    // Private mode / storage disabled: the OAuth round-trip simply won't
    // resume automatically, which the UI already handles.
  }
}

// A redirect_uri must not carry a fragment (RFC 6749 §3.1.2), and it has to
// match the registered value byte-for-byte, so query and hash are dropped.
const defaultRedirectUrl = (): string =>
  typeof globalThis.location === 'undefined'
    ? ''
    : `${globalThis.location.origin}${globalThis.location.pathname}`

/**
 * Connect the browser agent to a remote MCP server the user names at runtime —
 * static header, or full OAuth 2.1 with dynamic client registration.
 *
 * The OAuth round-trip leaves the page, so the hook persists what it needs to
 * resume: on mount it detects `?code=…`, finishes the exchange, cleans the URL
 * and reconnects, all before the app renders anything MCP-related.
 *
 * ```tsx
 * const mcp = useMcp()
 * // await mcp.connect({ url, oauth: true })
 * // mcp.status === 'needs-authorization' && <button onClick={mcp.authorize}>Authorize</button>
 * // <AgentProvider config={{ model, tools: { ...local, ...mcp.tools } }}>
 * ```
 */
export const useMcp = (options: UseMcpOptions = {}): UseMcpReturn => {
  const [status, setStatus] = useState<McpStatus>('idle')
  const [tools, setTools] = useState<AgentToolSet | undefined>(undefined)
  const [catalog, setCatalog] = useState<McpCatalogEntry[]>([])
  const [error, setError] = useState<string | undefined>(undefined)
  const [authorizationUrl, setAuthorizationUrl] = useState<string | undefined>(undefined)
  const [oauthSupported, setOauthSupported] = useState<boolean | undefined>(undefined)
  const [completingAuthorization, setCompletingAuthorization] = useState(looksLikeCallback)

  const connectionRef = useRef<ConnectedMcp | undefined>(undefined)
  const providerRef = useRef<BrowserOAuthProvider | undefined>(undefined)
  // Options land in a ref so `connect` keeps a stable identity: it is a natural
  // dependency of effects in host components.
  const optionsRef = useRef(options)
  optionsRef.current = options

  const closeConnection = useCallback(async () => {
    const open = connectionRef.current
    connectionRef.current = undefined
    if (open) await open.close().catch(() => {})
  }, [])

  const connect = useCallback(
    async (opts: McpConnectOptions) => {
      await closeConnection()
      setStatus('connecting')
      setError(undefined)
      setAuthorizationUrl(undefined)
      setTools(undefined)
      setCatalog([])

      try {
        const mod = await loadMcp()
        setOauthSupported(typeof mod.BrowserOAuthProvider === 'function')
        const name = opts.name ?? 'mcp'
        let authProvider: BrowserOAuthProvider | undefined

        if (opts.oauth) {
          if (!mod.BrowserOAuthProvider) throw new Error(OAUTH_UNSUPPORTED)
          const oauth = typeof opts.oauth === 'object' ? opts.oauth : {}
          const redirectUrl = oauth.redirectUrl ?? defaultRedirectUrl()
          authProvider = new mod.BrowserOAuthProvider({
            serverUrl: opts.url,
            redirectUrl,
            clientName: oauth.clientName ?? optionsRef.current.clientName,
            scope: oauth.scope,
          })
          providerRef.current = authProvider
          // Remember enough to rebuild this provider after the redirect: the
          // page will be reloaded from scratch when the user comes back.
          writePending({
            url: opts.url,
            name,
            redirectUrl,
            scope: oauth.scope,
            clientName: oauth.clientName ?? optionsRef.current.clientName,
          })
        } else {
          providerRef.current = undefined
        }

        const connection = await mod.connectMcpHttp(
          {
            [name]: {
              url: opts.url,
              headers: opts.oauth ? undefined : opts.headers,
              authProvider,
            },
          },
          { clientName: optionsRef.current.clientName, onLog: optionsRef.current.onLog },
        )

        const outcome = describeMcpResult(connection.results[0])
        if (outcome.status !== 'connected') {
          await connection.close().catch(() => {})
          if (outcome.status === 'needs-authorization') {
            const url = providerRef.current?.authorizationUrl
            setAuthorizationUrl(url ? String(url) : undefined)
            setStatus('needs-authorization')
            return
          }
          throw new Error(outcome.error)
        }

        connectionRef.current = connection
        setTools(connection.tools)
        setCatalog(connection.catalog)
        setStatus('connected')
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setStatus('error')
      }
    },
    [closeConnection],
  )

  const disconnect = useCallback(async () => {
    await closeConnection()
    setTools(undefined)
    setCatalog([])
    setAuthorizationUrl(undefined)
    setError(undefined)
    setStatus('idle')
  }, [closeConnection])

  const authorize = useCallback(() => {
    if (authorizationUrl && typeof globalThis.location !== 'undefined') {
      globalThis.location.href = authorizationUrl
    }
  }, [authorizationUrl])

  const forgetAuthorization = useCallback(async () => {
    writePending(undefined)
    await providerRef.current?.reset().catch(() => {})
    providerRef.current = undefined
    await disconnect()
  }, [disconnect])

  // Resume an OAuth round-trip: the authorization server has just sent the user
  // back with ?code=… and this component is mounting for the first time.
  useEffect(() => {
    if (!looksLikeCallback()) {
      setCompletingAuthorization(false)
      return
    }
    let cancelled = false
    void (async () => {
      const pending = readPending()
      try {
        const mod = await loadMcp()
        setOauthSupported(typeof mod.BrowserOAuthProvider === 'function')
        const callback = mod.readOAuthCallback?.()
        if (!callback || !pending || !mod.BrowserOAuthProvider || !mod.finishMcpOAuth) return
        const provider = new mod.BrowserOAuthProvider({
          serverUrl: pending.url,
          redirectUrl: pending.redirectUrl ?? defaultRedirectUrl(),
          clientName: pending.clientName,
          scope: pending.scope,
        })
        providerRef.current = provider
        await mod.finishMcpOAuth(provider, callback)
        if (cancelled) return
        await connect({ url: pending.url, name: pending.name, oauth: true })
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
          setStatus('error')
        }
      } finally {
        writePending(undefined)
        // Drop the one-time code from the address bar whatever happened, so a
        // reload can't replay a spent (or failed) authorization.
        if (typeof globalThis.history !== 'undefined') {
          globalThis.history.replaceState(null, '', stripOAuthParams(globalThis.location.href))
        }
        if (!cancelled) setCompletingAuthorization(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // Runs once: `connect` is stable and the callback exists only on first load.
  }, [connect])

  useEffect(() => () => void closeConnection(), [closeConnection])

  return {
    status,
    tools,
    catalog,
    error,
    authorizationUrl,
    oauthSupported,
    completingAuthorization,
    connect,
    disconnect,
    authorize,
    forgetAuthorization,
  }
}
