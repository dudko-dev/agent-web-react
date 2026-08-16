import { useEffect, useState } from 'react'
import type { UseMcpReturn } from '@dudko.dev/agent-web-react'

export type McpAuthMode = 'none' | 'bearer' | 'oauth'

export interface McpPanelProps {
  mcp: UseMcpReturn
}

const STORAGE_KEY = 'agent-web-demo:mcp-form'

interface StoredForm {
  url: string
  mode: McpAuthMode
}

// The OAuth flow reloads the page, so the form has to survive it. The bearer
// token deliberately does NOT: it is a credential, and this is a demo — it
// lives in component state for the length of the session only.
const readForm = (): StoredForm => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as StoredForm
  } catch {
    /* private mode */
  }
  return { url: '', mode: 'none' }
}

const STATUS_TEXT: Record<UseMcpReturn['status'], string> = {
  idle: 'Not connected',
  connecting: 'Connecting…',
  connected: 'Connected',
  'needs-authorization': 'Authorization required',
  error: 'Failed',
}

/**
 * Connect the demo to any remote MCP server the visitor names: no auth, a
 * bearer token, or the full OAuth 2.1 + dynamic-registration flow.
 */
export const McpPanel = ({ mcp }: McpPanelProps) => {
  const [form, setForm] = useState<StoredForm>(readForm)
  const [token, setToken] = useState('')

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(form))
    } catch {
      /* private mode */
    }
  }, [form])

  const busy = mcp.status === 'connecting' || mcp.completingAuthorization
  const canConnect = form.url.trim().length > 0 && !busy

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canConnect) return
    void mcp.connect({
      url: form.url.trim(),
      name: 'mcp',
      headers:
        form.mode === 'bearer' && token.trim()
          ? { Authorization: `Bearer ${token.trim()}` }
          : undefined,
      oauth: form.mode === 'oauth',
    })
  }

  return (
    <div className="mcp">
      <form className="mcp__form" onSubmit={submit}>
        <label className="settings__field">
          <span className="settings__label">MCP server URL</span>
          <input
            className="mcp__input"
            type="url"
            inputMode="url"
            placeholder="https://your-server.example/mcp"
            value={form.url}
            onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            disabled={mcp.status === 'connected'}
          />
        </label>

        <div className="mcp__modes" role="radiogroup" aria-label="Authentication">
          {(
            [
              ['none', 'No auth'],
              ['bearer', 'Bearer token'],
              ['oauth', 'OAuth + DCR'],
            ] as [McpAuthMode, string][]
          ).map(([value, label]) => (
            <label key={value} className={`mcp__mode${form.mode === value ? ' is-active' : ''}`}>
              <input
                type="radio"
                name="mcp-auth"
                value={value}
                checked={form.mode === value}
                onChange={() => setForm((f) => ({ ...f, mode: value }))}
                disabled={mcp.status === 'connected'}
              />
              {label}
            </label>
          ))}
        </div>

        {form.mode === 'bearer' && (
          <label className="settings__field">
            <span className="settings__label">Token</span>
            <input
              className="mcp__input"
              type="password"
              placeholder="paste an access token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              disabled={mcp.status === 'connected'}
              autoComplete="off"
            />
          </label>
        )}

        {form.mode === 'oauth' && (
          <p className="settings__note">
            No client ID needed: the app registers itself with your server’s authorization server
            (RFC 7591), runs PKCE, and refreshes the access token on its own when it expires. Tokens
            are stored encrypted in IndexedDB.
          </p>
        )}

        <div className="mcp__actions">
          {mcp.status === 'connected' ? (
            <button type="button" className="settings__btn" onClick={() => void mcp.disconnect()}>
              Disconnect
            </button>
          ) : (
            <button type="submit" className="settings__btn" disabled={!canConnect}>
              {busy ? 'Working…' : 'Connect'}
            </button>
          )}
          {form.mode === 'oauth' && (
            <button
              type="button"
              className="mcp__btn-ghost"
              onClick={() => void mcp.forgetAuthorization()}
              disabled={busy}
            >
              Forget authorization
            </button>
          )}
        </div>
      </form>

      <p className={`mcp__status mcp__status--${mcp.status}`}>
        <span className="mcp__dot" aria-hidden="true" />
        {mcp.completingAuthorization ? 'Finishing authorization…' : STATUS_TEXT[mcp.status]}
        {mcp.status === 'connected' && ` — ${mcp.catalog.length} tool(s)`}
      </p>

      {mcp.status === 'needs-authorization' && (
        <div className="mcp__auth">
          <p>This server wants you to sign in before it hands over its tools.</p>
          <button
            className="settings__btn"
            onClick={mcp.authorize}
            disabled={!mcp.authorizationUrl}
          >
            Authorize with the server →
          </button>
        </div>
      )}

      {mcp.error && <p className="settings__warn">{mcp.error}</p>}

      {mcp.catalog.length > 0 && (
        <ul className="mcp__tools">
          {mcp.catalog.map((t) => (
            <li key={t.name} className="mcp__tool">
              <code>{t.name}</code>
              {t.description && <span>{t.description}</span>}
            </li>
          ))}
        </ul>
      )}

      <p className="mcp__hint">
        Your browser talks to the server directly, so it must send CORS headers for this origin —
        including <code>Access-Control-Expose-Headers: WWW-Authenticate, mcp-session-id</code>, or
        the OAuth challenge can’t be read. Nothing is proxied through us; no server sees your token.
      </p>
    </div>
  )
}
