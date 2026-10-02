import { expect, test, type Page } from '@playwright/test'
import { startServers, type ILocalServers } from './servers.ts'

/**
 * What only a browser can check.
 *
 * The MCP connector and the OAuth flow are unit-tested in the core, and the
 * hook's pure parts are unit-tested here — but the failure that actually
 * shipped was none of those: an unrelated `useEffect` rewrote `location`
 * while the hook was awaiting a dynamic import, so the authorization code was
 * gone by the time it looked. That needs a real page, real effects, real
 * navigation and real IndexedDB.
 */

let servers: ILocalServers

test.beforeEach(async () => {
  servers = await startServers({ requireAuth: test.info().title.includes('OAuth') })
})

test.afterEach(async () => {
  await servers.close()
})

const openMcpPanel = async (page: Page) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'MCP servers' }).click()
  await expect(page.getByPlaceholder('https://your-server.example/mcp')).toBeVisible()
}

const addServer = async (page: Page, url: string, auth?: 'OAuth + DCR') => {
  await page.getByPlaceholder('https://your-server.example/mcp').fill(url)
  // The name is the tool prefix: "mcp" keeps the tool called mcp__echo.
  await page.getByLabel('Name (tool prefix)').fill('mcp')
  if (auth) await page.getByRole('radio', { name: auth }).check()
  await page.getByRole('button', { name: 'Add server' }).click()
}

const status = (page: Page) => page.locator('.mcp__server-status')

test('connects to a server that needs no auth and lists its tools', async ({ page }) => {
  await openMcpPanel(page)
  await addServer(page, servers.mcpUrl)

  await expect(status(page)).toContainText('Connected')
  await expect(page.locator('.mcp__tool code')).toHaveText(['mcp__echo'])
  // The chat panel only appears once tools are in hand.
  await expect(page.getByText('Connect one or more servers on the right')).toBeHidden()
})

test('OAuth: authorize, come back, and end up connected', async ({ page }) => {
  await openMcpPanel(page)
  await addServer(page, servers.mcpUrl, 'OAuth + DCR')

  // The server challenges; the app registers itself and asks the user to go.
  await expect(status(page)).toContainText('Authorization required')

  // Clicking through leaves the app entirely — the authorization server
  // bounces back with ?code=, and the page reloads from scratch.
  await page.getByRole('button', { name: /Authorize/ }).click()

  await expect(status(page)).toContainText('Connected', { timeout: 15_000 })
  await expect(page.locator('.mcp__tool code')).toHaveText(['mcp__echo'])
  expect(servers.registrations()).toBe(1)

  // The single-use code must not survive in the address bar, or a reload
  // replays a spent authorization.
  expect(new URL(page.url()).searchParams.get('code')).toBeNull()
  // And the visitor lands back on the panel they were using, not the default.
  await expect(page.getByRole('tab', { name: 'MCP servers' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
})

test('OAuth: a reload reconnects with the stored tokens, without re-authorizing', async ({
  page,
}) => {
  await openMcpPanel(page)
  await addServer(page, servers.mcpUrl, 'OAuth + DCR')
  await expect(status(page)).toContainText('Authorization required')
  await page.getByRole('button', { name: /Authorize/ }).click()
  await expect(status(page)).toContainText('Connected', { timeout: 15_000 })

  await page.reload()
  await page.getByRole('tab', { name: 'MCP servers' }).click()

  // The server list is remembered and reconnects on its own.
  await expect(status(page)).toContainText('Connected', { timeout: 15_000 })
  // Tokens and the dynamic registration came out of the encrypted vault: no
  // second round-trip to the authorization server.
  expect(servers.registrations()).toBe(1)
})

test('reports a server that cannot be reached instead of hanging', async ({ page }) => {
  await openMcpPanel(page)
  await addServer(page, 'http://127.0.0.1:1/mcp')

  await expect(status(page)).toContainText('Failed', { timeout: 15_000 })
  await expect(page.locator('.mcp__server .settings__warn')).toBeVisible()
})

test('several servers merge into one toolbox', async ({ page }) => {
  await openMcpPanel(page)
  await addServer(page, servers.mcpUrl)
  await expect(status(page)).toContainText('Connected')
  await page.getByPlaceholder('https://your-server.example/mcp').fill(servers.mcpUrl)
  await page.getByLabel('Name (tool prefix)').fill('second')
  await page.getByRole('button', { name: 'Add server' }).click()

  await expect(status(page)).toHaveText([/Connected/, /Connected/])
  await expect(page.locator('.mcp__tool code')).toHaveText(['mcp__echo', 'second__echo'])
})
