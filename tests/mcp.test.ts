import assert from 'node:assert/strict'
import test from 'node:test'
import { describeMcpResult, stripOAuthParams } from '../dist/index.js'

// The connect/OAuth machinery lives in the core and is covered there; what this
// package owns is the mapping from a connect outcome to UI state, and the URL
// hygiene around the redirect. Both are pure, so they are tested without React.

test('describeMcpResult: a connected server yields the connected status', () => {
  assert.deepEqual(describeMcpResult({ name: 'mcp', connected: true }), { status: 'connected' })
})

test('describeMcpResult: needsAuthorization outranks the accompanying error text', () => {
  assert.deepEqual(
    describeMcpResult({
      name: 'mcp',
      connected: false,
      needsAuthorization: true,
      error: 'Unauthorized',
    }),
    { status: 'needs-authorization' },
  )
})

test('describeMcpResult: a plain failure carries the server error through', () => {
  assert.deepEqual(describeMcpResult({ name: 'mcp', connected: false, error: 'DNS exploded' }), {
    status: 'error',
    error: 'DNS exploded',
  })
})

test('describeMcpResult: a failure with no message still gets a readable one', () => {
  const { status, error } = describeMcpResult({ name: 'mcp', connected: false })
  assert.equal(status, 'error')
  assert.match(error ?? '', /Could not connect/)
})

test('describeMcpResult: a missing result is an error, not a crash', () => {
  const { status, error } = describeMcpResult(undefined)
  assert.equal(status, 'error')
  assert.match(error ?? '', /no result/)
})

test('stripOAuthParams: drops the single-use response params, keeps everything else', () => {
  assert.equal(
    stripOAuthParams('https://app.test/demo/?code=abc&state=xyz&iss=as&view=mcp#/panel'),
    'https://app.test/demo/?view=mcp#/panel',
  )
})

test('stripOAuthParams: drops an error response too', () => {
  assert.equal(
    stripOAuthParams('https://app.test/?error=access_denied&error_description=nope'),
    'https://app.test/',
  )
})

test('stripOAuthParams: leaves a clean URL untouched', () => {
  assert.equal(stripOAuthParams('https://app.test/demo/'), 'https://app.test/demo/')
})
