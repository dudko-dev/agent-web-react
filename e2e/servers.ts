import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { z } from 'zod'

/**
 * A real MCP server and a real OAuth authorization server for the browser
 * tests — both on loopback, both CORS-enabled.
 *
 * The CORS part is not incidental. A browser client reads the 401 challenge
 * out of `WWW-Authenticate` to find the resource metadata, and that header is
 * invisible to script unless the server exposes it. Serving these headers here
 * is what makes the test a check of the documented deployment requirement
 * rather than a check of a convenient fiction.
 */

export interface ILocalServers {
  /** MCP endpoint to paste into the demo. */
  mcpUrl: string
  /** Tool calls the server received. */
  calls: { name: string; args: unknown }[]
  registrations: () => number
  close: () => Promise<void>
}

export interface ILocalServersOptions {
  requireAuth?: boolean
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers':
    'content-type, authorization, mcp-session-id, mcp-protocol-version, last-event-id',
  // Without these two the browser can neither read the auth challenge nor keep
  // the MCP session id — the exact failure mode the README warns about.
  'access-control-expose-headers': 'www-authenticate, mcp-session-id',
  'access-control-max-age': '86400',
}

const json = (res: ServerResponse, status: number, body: unknown): void => {
  res.writeHead(status, { 'content-type': 'application/json', ...CORS })
  res.end(JSON.stringify(body))
}

const readBody = async (req: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString()
}

const listen = async (server: Server): Promise<number> => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return (server.address() as AddressInfo).port
}

const shutdown = (server: Server): Promise<void> =>
  new Promise<void>((resolve) => {
    server.closeAllConnections()
    server.close(() => resolve())
  })

/** True for a CORS preflight, which must be answered before anything else. */
const handledPreflight = (req: IncomingMessage, res: ServerResponse): boolean => {
  if (req.method !== 'OPTIONS') return false
  res.writeHead(204, CORS)
  res.end()
  return true
}

export const startServers = async (opts: ILocalServersOptions = {}): Promise<ILocalServers> => {
  const calls: { name: string; args: unknown }[] = []
  const validTokens = new Set<string>()
  let registrations = 0
  let issued = 0

  // ── authorization server ────────────────────────────────────────────────
  const as = createServer((req, res) => {
    void (async () => {
      if (handledPreflight(req, res)) return
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`)

      if (url.pathname.includes('/.well-known/oauth-authorization-server')) {
        json(res, 200, {
          issuer: asUrl,
          authorization_endpoint: `${asUrl}/authorize`,
          token_endpoint: `${asUrl}/token`,
          registration_endpoint: `${asUrl}/register`,
          response_types_supported: ['code'],
          grant_types_supported: ['authorization_code', 'refresh_token'],
          code_challenge_methods_supported: ['S256'],
          token_endpoint_auth_methods_supported: ['none'],
        })
        return
      }

      if (url.pathname === '/register') {
        registrations += 1
        const metadata = JSON.parse((await readBody(req)) || '{}') as Record<string, unknown>
        json(res, 201, { ...metadata, client_id: `dcr-${registrations}`, client_id_issued_at: 1 })
        return
      }

      // The consent screen, minus the consent: bounce straight back to the app
      // with a code, which is what the user sees after approving.
      if (url.pathname === '/authorize') {
        const redirect = new URL(url.searchParams.get('redirect_uri') ?? '')
        redirect.searchParams.set('code', 'auth-code-1')
        const state = url.searchParams.get('state')
        if (state) redirect.searchParams.set('state', state)
        res.writeHead(302, { location: redirect.toString() })
        res.end()
        return
      }

      if (url.pathname === '/token') {
        const params = new URLSearchParams(await readBody(req))
        if (params.get('grant_type') === 'authorization_code' && !params.get('code_verifier')) {
          json(res, 400, { error: 'invalid_request' })
          return
        }
        issued += 1
        const access = `access-${issued}`
        validTokens.clear()
        validTokens.add(access)
        json(res, 200, {
          access_token: access,
          token_type: 'Bearer',
          expires_in: 3600,
          refresh_token: `refresh-${issued}`,
        })
        return
      }

      json(res, 404, { error: 'not_found' })
    })()
  })
  const asUrl = `http://127.0.0.1:${await listen(as)}`

  // ── MCP server ──────────────────────────────────────────────────────────
  const buildServer = (): McpServer => {
    const server = new McpServer({ name: 'e2e-mcp', version: '1.0.0' })
    server.registerTool(
      'echo',
      { description: 'Echo the input back', inputSchema: { text: z.string() } },
      ({ text }) => {
        calls.push({ name: 'echo', args: { text } })
        return { content: [{ type: 'text' as const, text: `echo:${text}` }] }
      },
    )
    return server
  }

  const mcpServer = createServer((req, res) => {
    void (async () => {
      if (handledPreflight(req, res)) return
      const path = new URL(req.url ?? '/', `http://${req.headers.host}`).pathname

      if (path.includes('/.well-known/oauth-protected-resource')) {
        json(res, 200, {
          resource: mcpUrl,
          authorization_servers: [asUrl],
          scopes_supported: ['mcp:tools'],
        })
        return
      }

      if (opts.requireAuth) {
        const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
        if (!validTokens.has(token)) {
          res.writeHead(401, {
            'content-type': 'application/json',
            'www-authenticate': `Bearer resource_metadata="${mcpOrigin}/.well-known/oauth-protected-resource/mcp"`,
            ...CORS,
          })
          res.end(JSON.stringify({ error: 'unauthorized' }))
          return
        }
      }

      const server = buildServer()
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
      res.on('close', () => {
        void transport.close()
        void server.close()
      })
      // The SDK writes its own headers, so CORS has to be set before it does.
      for (const [key, value] of Object.entries(CORS)) res.setHeader(key, value)
      await server.connect(transport)
      const raw = await readBody(req)
      await transport.handleRequest(req, res, raw ? JSON.parse(raw) : undefined)
    })().catch(() => {
      if (!res.headersSent) json(res, 500, { error: 'server_error' })
    })
  })
  const mcpOrigin = `http://127.0.0.1:${await listen(mcpServer)}`
  const mcpUrl = `${mcpOrigin}/mcp`

  return {
    mcpUrl,
    calls,
    registrations: () => registrations,
    close: async () => {
      await shutdown(mcpServer)
      await shutdown(as)
    },
  }
}
