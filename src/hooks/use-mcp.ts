import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentToolSet } from '@dudko.dev/agent-web'
import type {
  BrowserOAuthProvider,
  ConnectedMcp,
  McpCatalogEntry,
  McpModule,
  McpOAuthCallback,
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
   * optional subpath has been loaded once — call `checkOAuthSupport()` to
   * resolve it before offering OAuth in your UI.
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
  /** Load the optional subpath and report whether it can do OAuth. */
  checkOAuthSupport: () => Promise<boolean>
}

const OAUTH_UNSUPPORTED =
  'The installed @dudko.dev/agent-web has no MCP OAuth support. Upgrade the core to a version exporting BrowserOAuthProvider, or use a static Authorization header.'

const PENDING_KEY = 'agent-web-react:mcp:pending'
const OAUTH_KEY = 'agent-web-react:mcp:oauth'

interface OAuthRecord {
  url: string
  name?: string
  redirectUrl: string
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
  modulePromise ??= import('@dudko.dev/agent-web/mcp')
    .then((m) => m as unknown as McpModule)
    .catch((err: unknown) => {
      // A rejected promise is neither null nor undefined, so ??= would cache
      // the failure forever — one flaky chunk fetch would kill MCP for the tab.
      modulePromise = undefined
      throw err
    })
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

const OAUTH_PARAMS = ['code', 'state', 'error', 'error_description', 'iss']

/**
 * Read the authorization-code parameters out of a URL **synchronously**.
 *
 * The core exports an equivalent, but it lives behind a dynamic import: by the
 * time that import resolves, React has flushed the rest of the app's effects,
 * and any one of them may have rewritten `location` (the demo's own view
 * router did exactly that). The callback has to be captured before the first
 * await, so this parser is duplicated here on purpose.
 *
 * Reads the query string and, for hash-routed apps, the fragment. Returns
 * undefined when neither a `code` nor an `error` is present.
 */
export const readCallbackParams = (href?: string): McpOAuthCallback | undefined => {
  const target =
    href ?? (typeof globalThis.location !== 'undefined' ? globalThis.location.href : undefined)
  if (!target) return undefined
  let url: URL
  try {
    url = new URL(target)
  } catch {
    return undefined
  }
  const params = new URLSearchParams(url.search)
  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
  const q = hash.indexOf('?')
  if (q >= 0) {
    for (const [k, v] of new URLSearchParams(hash.slice(q + 1))) {
      if (!params.has(k)) params.set(k, v)
    }
  }
  const code = params.get('code') ?? undefined
  const error = params.get('error') ?? undefined
  if (!code && !error) return undefined
  return {
    code,
    state: params.get('state') ?? undefined,
    error,
    errorDescription: params.get('error_description') ?? undefined,
  }
}

/**
 * Remove the OAuth response parameters from a URL, leaving the rest intact —
 * query string and fragment alike. The code is single-use and lands in history,
 * referrers and screenshots, so it goes as soon as it has been read.
 */
export const stripOAuthParams = (href: string): string => {
  const url = new URL(href)
  for (const key of OAUTH_PARAMS) url.searchParams.delete(key)
  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
  const q = hash.indexOf('?')
  if (q >= 0) {
    const params = new URLSearchParams(hash.slice(q + 1))
    for (const key of OAUTH_PARAMS) params.delete(key)
    const rest = params.toString()
    url.hash = rest ? `${hash.slice(0, q)}?${rest}` : hash.slice(0, q)
  }
  return url.toString()
}

// An authorization code is single-use, and React StrictMode mounts every effect
// twice in development. Claiming happens synchronously, before any await, so
// the second pass cannot race the first into the token endpoint (where it would
// lose the state check and report a CSRF failure on a perfectly good flow).
const claimedCallbacks = new Set<string>()

export const claimOAuthCallback = (callback: McpOAuthCallback): boolean => {
  const key = `${callback.code ?? ''}|${callback.state ?? ''}|${callback.error ?? ''}`
  if (claimedCallbacks.has(key)) return false
  claimedCallbacks.add(key)
  return true
}

const readRecord = <T>(key: string): T | undefined => {
  try {
    const raw = globalThis.localStorage?.getItem(key)
    return raw ? (JSON.parse(raw) as T) : undefined
  } catch {
    return undefined
  }
}

const writeRecord = (key: string, value: unknown): void => {
  try {
    if (value) globalThis.localStorage?.setItem(key, JSON.stringify(value))
    else globalThis.localStorage?.removeItem(key)
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

// The MCP SDK throws this when a server demands authorization we don't have.
// Matching on the name (not the message) keeps a tool that merely mentions
// "401" in its output from flipping the UI into an auth prompt.
const isUnauthorized = (err: unknown): boolean =>
  err instanceof Error && err.name === 'UnauthorizedError'

/**
 * Wrap each tool so a mid-session authorization failure is visible. Without
 * this the panel keeps reporting "connected" while every call fails: the core
 * refreshes silently on a 401, but once the refresh token is gone (revoked,
 * expired) it can only ask for a new authorization.
 */
const watchAuthorization = (tools: AgentToolSet, onUnauthorized: () => void): AgentToolSet => {
  const entries = Object.entries(tools as Record<string, unknown>).map(([name, value]) => {
    const tool = value as { execute?: (args: unknown, options: unknown) => Promise<unknown> }
    if (typeof tool.execute !== 'function') return [name, value]
    const execute = tool.execute.bind(tool)
    return [
      name,
      {
        ...(value as object),
        execute: async (args: unknown, options: unknown) => {
          try {
            return await execute(args, options)
          } catch (err) {
            if (isUnauthorized(err)) onUnauthorized()
            throw err
          }
        },
      },
    ]
  })
  return Object.fromEntries(entries) as AgentToolSet
}

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
  const [completingAuthorization, setCompletingAuthorization] = useState(
    () => readCallbackParams() !== undefined,
  )

  const connectionRef = useRef<ConnectedMcp | undefined>(undefined)
  const providerRef = useRef<BrowserOAuthProvider | undefined>(undefined)
  // Bumped by every connect / disconnect / unmount. A handshake that finishes
  // after its epoch has passed closes itself instead of writing state or
  // leaking an open MCP session onto a dead component.
  const epochRef = useRef(0)
  // Options land in a ref so `connect` keeps a stable identity: it is a natural
  // dependency of effects in host components.
  const optionsRef = useRef(options)
  optionsRef.current = options

  const closeConnection = useCallback(async () => {
    const open = connectionRef.current
    connectionRef.current = undefined
    if (open) await open.close().catch(() => {})
  }, [])

  const checkOAuthSupport = useCallback(async () => {
    try {
      const mod = await loadMcp()
      const supported = typeof mod.BrowserOAuthProvider === 'function'
      setOauthSupported(supported)
      return supported
    } catch {
      setOauthSupported(false)
      return false
    }
  }, [])

  const connect = useCallback(
    async (opts: McpConnectOptions) => {
      const epoch = ++epochRef.current
      const current = () => epochRef.current === epoch
      await closeConnection()
      if (!current()) return
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
          const record: OAuthRecord = {
            url: opts.url,
            name,
            redirectUrl: oauth.redirectUrl ?? defaultRedirectUrl(),
            scope: oauth.scope,
            clientName: oauth.clientName ?? optionsRef.current.clientName,
          }
          authProvider = new mod.BrowserOAuthProvider({
            serverUrl: record.url,
            redirectUrl: record.redirectUrl,
            clientName: record.clientName,
            scope: record.scope,
          })
          providerRef.current = authProvider
          // `pending` resumes the redirect; `oauth` outlives it so tokens stay
          // addressable for forgetAuthorization() after a reload.
          writeRecord(PENDING_KEY, record)
          writeRecord(OAUTH_KEY, record)
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

        if (!current()) {
          // Unmounted, or another connect started while we were shaking hands.
          await connection.close().catch(() => {})
          return
        }

        const outcome = describeMcpResult(connection.results[0])
        if (outcome.status !== 'connected') {
          await connection.close().catch(() => {})
          if (outcome.status === 'needs-authorization') {
            const url = authProvider?.authorizationUrl
            setAuthorizationUrl(url ? String(url) : undefined)
            setStatus('needs-authorization')
            return
          }
          throw new Error(outcome.error)
        }

        connectionRef.current = connection
        setTools(
          watchAuthorization(connection.tools, () => {
            if (!current()) return
            const url = providerRef.current?.authorizationUrl
            if (url) setAuthorizationUrl(String(url))
            setStatus('needs-authorization')
          }),
        )
        setCatalog(connection.catalog)
        setStatus('connected')
      } catch (err) {
        if (!current()) return
        setError(err instanceof Error ? err.message : String(err))
        setStatus('error')
      }
    },
    [closeConnection],
  )

  const disconnect = useCallback(async () => {
    epochRef.current++
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
    const record = readRecord<OAuthRecord>(OAUTH_KEY)
    writeRecord(PENDING_KEY, undefined)
    writeRecord(OAUTH_KEY, undefined)
    // After a reload there is no live provider, but the tokens are still in the
    // vault — rebuild one for the same server so "forget" actually forgets
    // rather than only resetting the UI.
    let provider = providerRef.current
    if (!provider && record) {
      const mod = await loadMcp().catch(() => undefined)
      if (mod?.BrowserOAuthProvider) {
        provider = new mod.BrowserOAuthProvider({
          serverUrl: record.url,
          redirectUrl: record.redirectUrl,
          clientName: record.clientName,
          scope: record.scope,
        })
      }
    }
    await provider?.reset().catch(() => {})
    providerRef.current = undefined
    await disconnect()
  }, [disconnect])

  // Resume an OAuth round-trip: the authorization server has just sent the user
  // back with ?code=… and this component is mounting for the first time.
  useEffect(() => {
    // Everything up to the first await runs synchronously, on purpose: React
    // flushes the remaining passive effects (which may rewrite location) before
    // an awaited continuation resumes, and StrictMode runs this effect twice.
    const callback = readCallbackParams()
    if (!callback) {
      setCompletingAuthorization(false)
      return
    }
    const pending = readRecord<OAuthRecord>(PENDING_KEY)
    if (!pending) {
      // Not our callback — another sign-in flow on this page may still need
      // those parameters, so leave the URL exactly as we found it.
      setCompletingAuthorization(false)
      return
    }
    if (!claimOAuthCallback(callback)) {
      setCompletingAuthorization(false)
      return
    }
    // Ours, and claimed: the code is in hand, so clear it from the address bar
    // now rather than after the reconnect.
    if (typeof globalThis.history !== 'undefined') {
      globalThis.history.replaceState(null, '', stripOAuthParams(globalThis.location.href))
    }

    let cancelled = false
    void (async () => {
      try {
        const mod = await loadMcp()
        setOauthSupported(typeof mod.BrowserOAuthProvider === 'function')
        if (!mod.BrowserOAuthProvider || !mod.finishMcpOAuth) throw new Error(OAUTH_UNSUPPORTED)
        const provider = new mod.BrowserOAuthProvider({
          serverUrl: pending.url,
          redirectUrl: pending.redirectUrl ?? defaultRedirectUrl(),
          clientName: pending.clientName,
          scope: pending.scope,
        })
        providerRef.current = provider
        await mod.finishMcpOAuth(provider, callback)
        writeRecord(PENDING_KEY, undefined)
        if (cancelled) return
        // Hand back to `connect`, which owns the status from here — a slow or
        // hung handshake must not leave the UI stuck on "finishing".
        setCompletingAuthorization(false)
        await connect({ url: pending.url, name: pending.name, oauth: true })
      } catch (err) {
        writeRecord(PENDING_KEY, undefined)
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setStatus('error')
      } finally {
        if (!cancelled) setCompletingAuthorization(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // Runs once: `connect` is stable and the callback exists only on first load.
  }, [connect])

  useEffect(
    () => () => {
      epochRef.current++
      void closeConnection()
    },
    [closeConnection],
  )

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
    checkOAuthSupport,
  }
}
