import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AgentToolSet } from '@dudko.dev/agent-web'
import type {
  BrowserOAuthProvider,
  ConnectedMcp,
  McpCatalogEntry,
  McpModule,
} from '../mcp-types.js'
import {
  claimOAuthCallback,
  defaultRedirectUrl,
  describeMcpResult,
  loadMcp,
  OAUTH_UNSUPPORTED,
  PENDING_TTL_MS,
  readCallbackParams,
  readRecord,
  stripOAuthParams,
  watchAuthorization,
  writeRecord,
  type McpStatus,
  type UseMcpOptions,
} from './use-mcp.js'

export type McpAuthMode = 'none' | 'bearer' | 'oauth'

/** One server the user wants connected. */
export interface McpServerSpec {
  /**
   * Unique name; also the tool prefix ("<name>__<tool>"). Sanitised to
   * `[a-zA-Z0-9_-]`; a taken name gets a numeric suffix.
   */
  name: string
  /** The server's StreamableHTTP endpoint. */
  url: string
  auth?: McpAuthMode
  /** Bearer token for `auth: 'bearer'` — kept in memory only, never persisted. */
  token?: string
  /** OAuth details for `auth: 'oauth'`. */
  oauth?: { redirectUrl?: string; scope?: string; clientName?: string }
}

/** A server's live state. */
export interface McpServerView {
  name: string
  url: string
  auth: McpAuthMode
  status: McpStatus
  error?: string
  /** Where to send the user when `status === 'needs-authorization'`. */
  authorizationUrl?: string
  catalog: McpCatalogEntry[]
}

export interface UseMcpServersOptions extends UseMcpOptions {
  /**
   * Remember the server list (never tokens) in localStorage so it survives a
   * reload — and the OAuth redirect, which IS a reload (default true).
   */
  persist?: boolean
  /** localStorage key of the list (default 'agent-web-react:mcp-servers'). */
  storageKey?: string
  /** Reconnect remembered servers on mount (default true). Bearer servers wait for their token. */
  autoConnect?: boolean
  /** Per-server connect deadline in ms (default: the core's, 30 s). */
  connectTimeoutMs?: number
}

export interface UseMcpServersReturn {
  servers: McpServerView[]
  /** Tools of every connected server, merged — pass to `BrowserAgentConfig.tools`. */
  tools: AgentToolSet
  /** Catalogue of every connected server, merged. */
  catalog: McpCatalogEntry[]
  connectedCount: number
  /** True while an OAuth redirect is being finished on mount. */
  completingAuthorization: boolean
  /** Whether the installed core can do OAuth (undefined until checked). */
  oauthSupported?: boolean
  checkOAuthSupport: () => Promise<boolean>
  /** Add (or replace, by name) a server and connect it. Resolves with the final name. */
  add: (spec: McpServerSpec) => Promise<string>
  /** Disconnect and forget a server. */
  remove: (name: string) => Promise<void>
  /** Connect again — optionally with a fresh bearer token. */
  reconnect: (name: string, token?: string) => Promise<void>
  /** Navigate to the server's authorization page. Call it from a user gesture. */
  authorize: (name: string) => void
  /** Drop a server's stored OAuth tokens and registration. */
  forgetAuthorization: (name: string) => Promise<void>
}

interface StoredServer {
  name: string
  url: string
  auth: McpAuthMode
  oauth?: McpServerSpec['oauth']
}

interface PendingRecord {
  name: string
  url: string
  redirectUrl: string
  scope?: string
  clientName?: string
  startedAt: number
}

interface Live {
  epoch: number
  connection?: ConnectedMcp
  provider?: BrowserOAuthProvider
  tools?: AgentToolSet
  token?: string
}

const DEFAULT_KEY = 'agent-web-react:mcp-servers'

const sanitize = (s: string): string => s.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32) || 'mcp'

const view = (s: StoredServer, patch: Partial<McpServerView> = {}): McpServerView => ({
  name: s.name,
  url: s.url,
  auth: s.auth,
  status: 'idle',
  catalog: [],
  ...patch,
})

/**
 * Connect the browser agent to SEVERAL remote MCP servers at once, each with
 * its own auth (none, a bearer token, or OAuth 2.1 + dynamic registration).
 * Every server is its own connection — adding or removing one never touches
 * the others — and their tools merge into one `tools` set, prefixed by server
 * name. The list is remembered across reloads (tokens excepted), and an OAuth
 * round-trip resumes on return.
 *
 * ```tsx
 * const mcp = useMcpServers()
 * // await mcp.add({ name: 'github', url, auth: 'oauth' })
 * // await mcp.add({ name: 'docs', url, auth: 'bearer', token })
 * const agent = useAgent({ model, tools: { ...local, ...mcp.tools } }, { deps: [mcp.tools] })
 * ```
 *
 * With many servers the merged catalogue can reach hundreds of tools; the core
 * switches to tool search above `toolSearchThreshold` automatically.
 */
export const useMcpServers = (options: UseMcpServersOptions = {}): UseMcpServersReturn => {
  const storageKey = options.storageKey ?? DEFAULT_KEY
  const pendingKey = `${storageKey}:pending`
  const persist = options.persist !== false

  const [servers, setServers] = useState<McpServerView[]>(() =>
    persist ? (readRecord<StoredServer[]>(storageKey) ?? []).map((s) => view(s)) : [],
  )
  const [oauthSupported, setOauthSupported] = useState<boolean | undefined>(undefined)
  const [completingAuthorization, setCompleting] = useState(
    () => readCallbackParams() !== undefined && readRecord(pendingKey) !== undefined,
  )
  // Bumped whenever a server's tools change, to recompute the merged set.
  const [toolsVersion, setToolsVersion] = useState(0)

  const liveRef = useRef(new Map<string, Live>())
  const specsRef = useRef(new Map<string, StoredServer>())
  if (specsRef.current.size === 0 && servers.length > 0) {
    for (const s of servers)
      specsRef.current.set(s.name, { name: s.name, url: s.url, auth: s.auth })
  }
  const optionsRef = useRef(options)
  optionsRef.current = options
  const unmountedRef = useRef(false)

  const saveList = useCallback(() => {
    if (!persist) return
    writeRecord(storageKey, [...specsRef.current.values()])
  }, [persist, storageKey])

  const patch = useCallback((name: string, p: Partial<McpServerView>) => {
    if (unmountedRef.current) return
    setServers((list) => list.map((s) => (s.name === name ? { ...s, ...p } : s)))
  }, [])

  const live = (name: string): Live => {
    let l = liveRef.current.get(name)
    if (!l) {
      l = { epoch: 0 }
      liveRef.current.set(name, l)
    }
    return l
  }

  const closeServer = useCallback(async (name: string) => {
    const l = liveRef.current.get(name)
    if (!l) return
    l.epoch += 1
    const open = l.connection
    l.connection = undefined
    if (l.tools) {
      l.tools = undefined
      setToolsVersion((v) => v + 1)
    }
    if (open) await open.close().catch(() => {})
  }, [])

  const providerFor = (mod: McpModule, spec: StoredServer): BrowserOAuthProvider => {
    if (!mod.BrowserOAuthProvider) throw new Error(OAUTH_UNSUPPORTED)
    return new mod.BrowserOAuthProvider({
      serverUrl: spec.url,
      redirectUrl: spec.oauth?.redirectUrl ?? defaultRedirectUrl(),
      clientName: spec.oauth?.clientName ?? optionsRef.current.clientName,
      scope: spec.oauth?.scope,
    })
  }

  const connectServer = useCallback(
    async (name: string): Promise<void> => {
      const spec = specsRef.current.get(name)
      if (!spec) return
      await closeServer(name)
      const l = live(name)
      const epoch = ++l.epoch
      const current = () => !unmountedRef.current && l.epoch === epoch
      if (spec.auth === 'bearer' && !l.token) {
        patch(name, { status: 'idle', error: 'Enter the bearer token to connect.' })
        return
      }
      patch(name, {
        status: 'connecting',
        error: undefined,
        authorizationUrl: undefined,
        catalog: [],
      })
      try {
        const mod = await loadMcp()
        setOauthSupported(typeof mod.BrowserOAuthProvider === 'function')
        let provider: BrowserOAuthProvider | undefined
        if (spec.auth === 'oauth') {
          provider = providerFor(mod, spec)
          l.provider = provider
        }
        const connection = await mod.connectMcpHttp(
          {
            [name]: {
              url: spec.url,
              headers:
                spec.auth === 'bearer' && l.token
                  ? { Authorization: `Bearer ${l.token}` }
                  : undefined,
              authProvider: provider,
              connectTimeoutMs: optionsRef.current.connectTimeoutMs,
            },
          },
          {
            clientName: optionsRef.current.clientName,
            onLog: optionsRef.current.onLog,
            connectTimeoutMs: optionsRef.current.connectTimeoutMs,
          },
        )
        if (!current()) {
          await connection.close().catch(() => {})
          return
        }
        const outcome = describeMcpResult(connection.results[0])
        if (outcome.status !== 'connected') {
          await connection.close().catch(() => {})
          if (outcome.status === 'needs-authorization') {
            const url = provider?.authorizationUrl
            patch(name, {
              status: 'needs-authorization',
              authorizationUrl: url ? String(url) : undefined,
            })
            return
          }
          throw new Error(outcome.error)
        }
        l.connection = connection
        l.tools = watchAuthorization(connection.tools, mod, () => {
          if (!current()) return
          const url = l.provider?.authorizationUrl
          patch(name, {
            status: 'needs-authorization',
            authorizationUrl: url ? String(url) : undefined,
          })
        })
        setToolsVersion((v) => v + 1)
        patch(name, { status: 'connected', catalog: connection.catalog })
      } catch (err) {
        if (!current()) return
        patch(name, { status: 'error', error: err instanceof Error ? err.message : String(err) })
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [closeServer, patch, pendingKey],
  )

  const add = useCallback(
    async (input: McpServerSpec): Promise<string> => {
      let name = sanitize(input.name)
      // A different server under a taken name gets a suffix; the same URL replaces.
      const taken = specsRef.current.get(name)
      if (taken && taken.url !== input.url) {
        let n = 2
        while (specsRef.current.has(`${name}_${n}`)) n += 1
        name = `${name}_${n}`
      }
      const spec: StoredServer = {
        name,
        url: input.url,
        auth: input.auth ?? 'none',
        ...(input.oauth ? { oauth: input.oauth } : {}),
      }
      specsRef.current.set(name, spec)
      live(name).token = input.auth === 'bearer' ? input.token : undefined
      setServers((list) =>
        list.some((s) => s.name === name)
          ? list.map((s) => (s.name === name ? view(spec) : s))
          : [...list, view(spec)],
      )
      saveList()
      await connectServer(name)
      return name
    },
    [connectServer, saveList],
  )

  const remove = useCallback(
    async (name: string) => {
      await closeServer(name)
      liveRef.current.delete(name)
      specsRef.current.delete(name)
      saveList()
      setServers((list) => list.filter((s) => s.name !== name))
    },
    [closeServer, saveList],
  )

  const reconnect = useCallback(
    async (name: string, token?: string) => {
      if (token !== undefined) live(name).token = token
      await connectServer(name)
    },
    [connectServer],
  )

  const authorize = useCallback(
    (name: string) => {
      const url = servers.find((s) => s.name === name)?.authorizationUrl
      const spec = specsRef.current.get(name)
      if (!url || !spec || typeof globalThis.location === 'undefined') return
      // The redirect reloads the page: remember which server it is for. Written
      // here, at the user's click, so with several servers awaiting consent the
      // record always names the one actually being authorized.
      const pending: PendingRecord = {
        name,
        url: spec.url,
        redirectUrl: spec.oauth?.redirectUrl ?? defaultRedirectUrl(),
        scope: spec.oauth?.scope,
        clientName: spec.oauth?.clientName ?? optionsRef.current.clientName,
        startedAt: Date.now(),
      }
      writeRecord(pendingKey, pending)
      globalThis.location.href = url
    },
    [servers, pendingKey],
  )

  const forgetAuthorization = useCallback(
    async (name: string) => {
      const spec = specsRef.current.get(name)
      const l = liveRef.current.get(name)
      let provider = l?.provider
      if (!provider && spec?.auth === 'oauth') {
        const mod = await loadMcp().catch(() => undefined)
        if (mod?.BrowserOAuthProvider) provider = providerFor(mod, spec)
      }
      await provider?.reset().catch(() => {})
      if (l) l.provider = undefined
      const pending = readRecord<PendingRecord>(pendingKey)
      if (pending?.name === name) writeRecord(pendingKey, undefined)
      await closeServer(name)
      patch(name, { status: 'idle', authorizationUrl: undefined, catalog: [], error: undefined })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [closeServer, patch, pendingKey],
  )

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

  // On mount: finish an OAuth round-trip that came back to this page, then
  // reconnect the remembered servers.
  useEffect(() => {
    unmountedRef.current = false
    // Synchronous up to the first await, like useMcp: another effect may
    // rewrite `location`, and StrictMode runs this twice.
    const callback = readCallbackParams()
    const pending = readRecord<PendingRecord>(pendingKey)
    const fresh = pending !== undefined && Date.now() - pending.startedAt < PENDING_TTL_MS
    const ours = Boolean(callback && pending && fresh && claimOAuthCallback(callback))
    if (callback && pending && !fresh) writeRecord(pendingKey, undefined)
    if (ours && typeof globalThis.history !== 'undefined') {
      globalThis.history.replaceState(null, '', stripOAuthParams(globalThis.location.href))
    }
    const autoConnect = optionsRef.current.autoConnect !== false
    void (async () => {
      if (ours && pending && callback) {
        try {
          const mod = await loadMcp()
          setOauthSupported(typeof mod.BrowserOAuthProvider === 'function')
          if (!mod.finishMcpOAuth) throw new Error(OAUTH_UNSUPPORTED)
          const spec = specsRef.current.get(pending.name) ?? {
            name: pending.name,
            url: pending.url,
            auth: 'oauth' as const,
          }
          if (!specsRef.current.has(spec.name)) {
            specsRef.current.set(spec.name, spec)
            setServers((list) => [...list, view(spec)])
            saveList()
          }
          const provider = providerFor(mod, {
            ...spec,
            oauth: {
              redirectUrl: pending.redirectUrl,
              scope: pending.scope,
              clientName: pending.clientName,
            },
          })
          live(spec.name).provider = provider
          await mod.finishMcpOAuth(provider, callback)
          writeRecord(pendingKey, undefined)
        } catch (err) {
          writeRecord(pendingKey, undefined)
          patch(pending.name, {
            status: 'error',
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
      setCompleting(false)
      if (autoConnect || ours) {
        await Promise.all(
          [...specsRef.current.keys()]
            .filter((name) => autoConnect || name === pending?.name)
            .map((name) => connectServer(name)),
        )
      }
    })()
    return () => {
      unmountedRef.current = true
      for (const name of liveRef.current.keys()) void closeServer(name)
    }
    // Runs once: the callbacks are stable and the redirect exists only on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tools = useMemo<AgentToolSet>(() => {
    const merged: AgentToolSet = {}
    for (const l of liveRef.current.values()) if (l.tools) Object.assign(merged, l.tools)
    return merged
    // toolsVersion is the change signal for the mutable map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolsVersion])

  const catalog = useMemo(
    () => servers.filter((s) => s.status === 'connected').flatMap((s) => s.catalog),
    [servers],
  )

  return {
    servers,
    tools,
    catalog,
    connectedCount: servers.filter((s) => s.status === 'connected').length,
    completingAuthorization,
    oauthSupported,
    checkOAuthSupport,
    add,
    remove,
    reconnect,
    authorize,
    forgetAuthorization,
  }
}
