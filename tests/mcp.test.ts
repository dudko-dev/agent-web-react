import assert from 'node:assert/strict'
import test from 'node:test'
import {
  claimOAuthCallback,
  describeMcpResult,
  readCallbackParams,
  stripOAuthParams,
} from '../dist/index.js'

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

// The callback has to be read synchronously, before the hook's first await:
// React flushes the rest of the app's effects in between, and one of them may
// rewrite location (the demo's own view router did exactly that).

test('readCallbackParams: reads a query-string callback', () => {
  assert.deepEqual(readCallbackParams('https://app.test/demo/?code=abc&state=xyz'), {
    code: 'abc',
    state: 'xyz',
    error: undefined,
    errorDescription: undefined,
  })
})

test('readCallbackParams: reads a callback carried in a hash route', () => {
  assert.deepEqual(readCallbackParams('https://app.test/#/cb?code=abc&state=xyz'), {
    code: 'abc',
    state: 'xyz',
    error: undefined,
    errorDescription: undefined,
  })
})

test('readCallbackParams: reads a denial, and ignores a URL carrying neither', () => {
  const denied = readCallbackParams('https://app.test/?error=access_denied&error_description=nope')
  assert.equal(denied?.error, 'access_denied')
  assert.equal(denied?.errorDescription, 'nope')
  assert.equal(readCallbackParams('https://app.test/demo/?view=mcp'), undefined)
  assert.equal(readCallbackParams('not a url'), undefined)
})

test('stripOAuthParams: clears a callback carried in the fragment too', () => {
  assert.equal(
    stripOAuthParams('https://app.test/#/cb?code=abc&state=xyz&tab=tools'),
    'https://app.test/#/cb?tab=tools',
  )
  assert.equal(stripOAuthParams('https://app.test/#/cb?code=abc'), 'https://app.test/#/cb')
})

test('claimOAuthCallback: a code can only be claimed once', () => {
  const callback = { code: 'single-use', state: 'st' }
  // StrictMode mounts every effect twice in development; the second pass must
  // not race the first into the token endpoint, where it would lose the
  // single-use state check and report a CSRF failure on a good flow.
  assert.equal(claimOAuthCallback(callback), true)
  assert.equal(claimOAuthCallback({ ...callback }), false)
  assert.equal(claimOAuthCallback({ code: 'another', state: 'st' }), true)
})
