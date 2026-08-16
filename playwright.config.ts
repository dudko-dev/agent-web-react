import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'

/**
 * Browser tests for the demo. They exist for the things unit tests structurally
 * cannot reach: effect ordering across a real render, a real navigation away
 * and back, IndexedDB persistence, and CORS on the servers the page talks to.
 *
 * The demo is served from its production build, so what is tested is what gets
 * deployed to Pages — including the code-split MCP chunk.
 */

// Some sandboxes ship a Chromium that predates this Playwright's pinned build.
// Use it when it is there rather than failing on a version mismatch; CI runs
// `playwright install chromium` and takes the normal path.
const PREINSTALLED_CHROMIUM = '/opt/pw-browsers/chromium'
const executablePath = existsSync(PREINSTALLED_CHROMIUM) ? PREINSTALLED_CHROMIUM : undefined

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  use: {
    // The subpath is deliberate: Pages serves the demo from /agent-web-react/,
    // so testing the bare origin would exercise a layout that never ships.
    baseURL: 'http://127.0.0.1:4173/agent-web-react/',
    trace: 'retain-on-failure',
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command:
      'npm --prefix demo run build && npm --prefix demo run preview -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/agent-web-react/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
