import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import * as main from '../dist/index.js'
import * as mcp from '../dist/mcp.js'

// The bundle-level invariant behind the `./mcp` subpath. `useMcp` reaches the core's
// `@dudko.dev/agent-web/mcp` with a dynamic import, and a bundler resolves a dynamic import at
// BUILD time: webpack followed it into the core's mcp.js, whose static imports of the optional
// `@modelcontextprotocol/sdk` failed the build of hosts that never touched MCP. Nothing in the
// main entry may mention that path again, whatever it is refactored into.

const read = (file: string): string =>
  readFileSync(new URL(`../dist/${file}`, import.meta.url), 'utf8')

test('main entry (ESM and CJS) never references the core MCP subpath', () => {
  for (const file of ['index.js', 'index.cjs']) {
    assert.doesNotMatch(
      read(file),
      /agent-web\/mcp/,
      `${file} must not mention @dudko.dev/agent-web/mcp — a bundler would follow it into the optional SDK`,
    )
  }
})

test('main entry does not ship the MCP hooks, and does not leave a stub behind', () => {
  for (const name of ['useMcp', 'useMcpServers', 'readCallbackParams', 'claimOAuthCallback']) {
    assert.equal(name in main, false, `${name} moved to @dudko.dev/agent-web-react/mcp`)
  }
})

test('the mcp entry carries the hooks, and is the one place that loads the core connector', () => {
  for (const name of [
    'useMcp',
    'useMcpServers',
    'readCallbackParams',
    'claimOAuthCallback',
    'stripOAuthParams',
    'describeMcpResult',
    'isUnauthorizedError',
  ]) {
    assert.equal(typeof (mcp as Record<string, unknown>)[name], 'function', `${name} is exported`)
  }
  assert.match(read('mcp.js'), /import\(["']@dudko\.dev\/agent-web\/mcp["']\)/)
})

test('the CommonJS build of the mcp entry loads too', () => {
  const require = createRequire(import.meta.url)
  const cjs = require('../dist/mcp.cjs') as Record<string, unknown>
  assert.equal(typeof cjs.useMcpServers, 'function')
  assert.equal(typeof cjs.useMcp, 'function')
})

test('package.json exposes ./mcp with types for both module systems', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    exports: Record<
      string,
      { import: { types: string; default: string }; require: { types: string; default: string } }
    >
  }
  const entry = pkg.exports['./mcp']
  assert.ok(entry, './mcp is declared')
  for (const target of [
    entry.import.types,
    entry.import.default,
    entry.require.types,
    entry.require.default,
  ]) {
    assert.ok(
      readFileSync(new URL(`../${target}`, import.meta.url)),
      `${target} exists after a build`,
    )
  }
})
