import { useEffect, useState } from 'react'
import type { McpAuthMode, UseMcpServersReturn } from '@dudko.dev/agent-web-react'

export interface McpPanelProps {
  mcp: UseMcpServersReturn
  /** The demo's synthetic 185-tool catalogue (shows tool search). */
  mockCatalog: boolean
  onMockCatalog: (on: boolean) => void
  /** Tools the agent can see in total, and whether tool search is active. */
  toolCount: number
  searchMode: boolean
}

const STATUS_TEXT: Record<string, string> = {
  idle: 'Not connected',
  connecting: 'Connecting…',
  connected: 'Connected',
  'needs-authorization': 'Authorization required',
  error: 'Failed',
}

const nameFromUrl = (url: string): string => {
  try {
    const host = new URL(url).hostname.split('.').filter((p) => p !== 'www' && p !== 'mcp')[0]
    return host || 'mcp'
  } catch {
    return 'mcp'
  }
}

/**
 * Connect the demo to ANY NUMBER of remote MCP servers — each with no auth, a
 * bearer token, or the full OAuth 2.1 + dynamic-registration flow — and watch
 * their tools merge into one agent.
 */
export const McpPanel = ({
  mcp,
  mockCatalog,
  onMockCatalog,
  toolCount,
  searchMode,
}: McpPanelProps) => {
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [mode, setMode] = useState<McpAuthMode>('none')
  const [token, setToken] = useState('')
  const [tokens, setTokens] = useState<Record<string, string>>({})
  const [open, setOpen] = useState<Record<string, boolean>>({})

  // Resolve OAuth support the moment the user reaches for it.
  const check = mcp.checkOAuthSupport
  useEffect(() => {
    if (mode === 'oauth') void check()
  }, [mode, check])
  const oauthUnavailable = mode === 'oauth' && mcp.oauthSupported === false
  const canAdd = url.trim().length > 0 && !oauthUnavailable

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canAdd) return
    void mcp.add({
      name: name.trim() || nameFromUrl(url.trim()),
      url: url.trim(),
      auth: mode,
      token: mode === 'bearer' ? token.trim() : undefined,
    })
    setUrl('')
    setName('')
    setToken('')
  }

  return (
    <div className="mcp">
      <div className="mcp__summary">
        <strong>{toolCount}</strong> tool(s) for the agent
        {searchMode ? (
          <span
            className="mcp__badge"
            title="More than 40 tools: the executor starts each step small and calls find_tools to activate what it needs."
          >
            tool search on
          </span>
        ) : (
          <span className="mcp__badge mcp__badge--muted">all tools sent</span>
        )}
      </div>

      {mcp.completingAuthorization && <p className="settings__note">Finishing authorization…</p>}

      <ul className="mcp__servers">
        {mcp.servers.map((s) => (
          <li key={s.name} className={`mcp__server mcp__server--${s.status}`}>
            <div className="mcp__server-head">
              <span className="mcp__dot" aria-hidden="true" />
              <strong className="mcp__server-name">{s.name}</strong>
              <span className="mcp__server-status">
                {STATUS_TEXT[s.status]}
                {s.status === 'connected' && ` — ${s.catalog.length} tool(s)`}
              </span>
              <span className="mcp__server-actions">
                {s.status === 'needs-authorization' && (
                  <button
                    type="button"
                    className="settings__btn"
                    onClick={() => mcp.authorize(s.name)}
                    disabled={!s.authorizationUrl}
                  >
                    Authorize →
                  </button>
                )}
                {(s.status === 'error' || s.status === 'idle') && (
                  <button
                    type="button"
                    className="mcp__btn-ghost"
                    onClick={() => void mcp.reconnect(s.name, tokens[s.name])}
                  >
                    Reconnect
                  </button>
                )}
                {s.auth === 'oauth' && (
                  <button
                    type="button"
                    className="mcp__btn-ghost"
                    onClick={() => void mcp.forgetAuthorization(s.name)}
                  >
                    Forget auth
                  </button>
                )}
                <button
                  type="button"
                  className="mcp__btn-ghost"
                  aria-label={`Remove ${s.name}`}
                  onClick={() => void mcp.remove(s.name)}
                >
                  ✕
                </button>
              </span>
            </div>
            <div className="mcp__server-url">{s.url}</div>
            {s.auth === 'bearer' && s.status !== 'connected' && (
              <input
                className="mcp__input"
                type="password"
                placeholder="bearer token for this server"
                value={tokens[s.name] ?? ''}
                onChange={(e) => setTokens((t) => ({ ...t, [s.name]: e.target.value }))}
                autoComplete="off"
              />
            )}
            {s.error && <p className="settings__warn">{s.error}</p>}
            {s.catalog.length > 0 && (
              <details
                open={open[s.name] ?? false}
                onToggle={(e) => {
                  const isOpen = (e.target as HTMLDetailsElement).open
                  setOpen((o) => ({ ...o, [s.name]: isOpen }))
                }}
              >
                <summary className="mcp__tools-toggle">Tools</summary>
                <ul className="mcp__tools">
                  {s.catalog.map((t) => (
                    <li key={t.name} className="mcp__tool">
                      <code>{t.name}</code>
                      {t.readOnly && <span className="mcp__ro">read-only</span>}
                      {t.description && <span>{t.description}</span>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ul>

      <form className="mcp__form" onSubmit={submit}>
        <div className="mcp__form-row">
          <label className="settings__field mcp__grow">
            <span className="settings__label">MCP server URL</span>
            <input
              className="mcp__input"
              type="url"
              inputMode="url"
              placeholder="https://your-server.example/mcp"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <label className="settings__field mcp__name">
            <span className="settings__label">Name (tool prefix)</span>
            <input
              className="mcp__input"
              placeholder={url ? nameFromUrl(url) : 'docs'}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        </div>

        <div className="mcp__modes" role="radiogroup" aria-label="Authentication">
          {(
            [
              ['none', 'No auth'],
              ['bearer', 'Bearer token'],
              ['oauth', 'OAuth + DCR'],
            ] as [McpAuthMode, string][]
          ).map(([value, label]) => (
            <label key={value} className={`mcp__mode${mode === value ? ' is-active' : ''}`}>
              <input
                type="radio"
                name="mcp-auth"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
              />
              {label}
            </label>
          ))}
        </div>

        {mode === 'bearer' && (
          <label className="settings__field">
            <span className="settings__label">Token</span>
            <input
              className="mcp__input"
              type="password"
              placeholder="paste an access token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
            />
          </label>
        )}

        {mode === 'oauth' &&
          (oauthUnavailable ? (
            <p className="settings__warn">
              This build of <code>@dudko.dev/agent-web</code> has no MCP OAuth support — upgrade the
              core, or use a bearer token here.
            </p>
          ) : (
            <p className="settings__note">
              No client ID needed: the app registers itself with the server’s authorization server
              (RFC 7591), runs PKCE, and refreshes the access token on its own. Tokens are stored
              encrypted in IndexedDB.
            </p>
          ))}

        <div className="mcp__actions">
          <button type="submit" className="settings__btn" disabled={!canAdd}>
            Add server
          </button>
        </div>
      </form>

      <label className="mcp__mock">
        <input
          type="checkbox"
          checked={mockCatalog}
          onChange={(e) => onMockCatalog(e.target.checked)}
        />
        Add a mock catalogue of 185 tools on 6 pretend servers (CRM, billing, calendar, support,
        docs, analytics) — try “How many open support tickets are there?” and watch the agent search
        for the right tool.
      </label>

      <p className="mcp__hint">
        Servers connect in parallel, each with its own 30 s deadline; paginated tool lists are read
        to the end, and tools a server marks read-only skip the “ask before changes” prompt. Your
        browser talks to each server directly, so it must send CORS headers for this origin —
        including <code>Access-Control-Expose-Headers: WWW-Authenticate, mcp-session-id</code>.
      </p>
    </div>
  )
}
