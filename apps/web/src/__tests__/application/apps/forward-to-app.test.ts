/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { createPublicLimiter, forwardToApp } from '@/application/apps/forward-to-app'
import type { InstalledApp } from '@/domain/entities/installed-app'
import { logger } from '@/lib/logger'

const app: InstalledApp = { id: 'tea-tour', name: 'Tour', version: '1.0.0', menu: [], publicPrefixes: ['/public/'] }
const CSP = "default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'self'"

beforeAll(() => {
  process.env.CORE_GATEWAY_URL = 'http://apisix:9081'
})

function setup(reply: Response = new Response('ok', { headers: { 'content-type': 'text/html' } }), clientIp = '203.0.113.1') {
  const fetchImpl = jest.fn().mockResolvedValue(reply)
  const getToken = jest.fn().mockResolvedValue('tok')
  // A fresh limiter per test, so no test inherits another's counts.
  const isPublicLimited = createPublicLimiter()
  return { fetchImpl, getToken, deps: { fetchImpl: fetchImpl as unknown as typeof fetch, getToken, clientIp, isPublicLimited } }
}
const sent = (fetchImpl: jest.Mock) => ({ url: fetchImpl.mock.calls[0][0] as string, init: fetchImpl.mock.calls[0][1] as RequestInit })
const header = (init: RequestInit, name: string) => new Headers(init.headers).get(name)

describe('forwardToApp', () => {
  test('forwards method, query, content-type and accept to the gateway with manual redirects and no cache', async () => {
    const { fetchImpl, deps } = setup()
    const req = new Request('http://web/apps/tea-tour/tours/a%20b?x=1&y=2', {
      headers: { 'content-type': 'text/plain', accept: 'text/html' },
    })

    await forwardToApp(req, app, ['tours', 'a b'], deps)

    const { url, init } = sent(fetchImpl)
    expect(url).toBe('http://apisix:9081/apps/tea-tour/tours/a%20b?x=1&y=2')
    expect(init.method).toBe('GET')
    expect(init.redirect).toBe('manual')
    expect(init.cache).toBe('no-store')
    expect(header(init, 'content-type')).toBe('text/plain')
    expect(header(init, 'accept')).toBe('text/html')
  })

  test('streams a POST body through with its length', async () => {
    const { fetchImpl, deps } = setup()
    const req = new Request('http://web/apps/tea-tour/book', {
      method: 'POST',
      body: 'message=hi',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'content-length': '10' },
    })

    await forwardToApp(req, app, ['book'], deps)

    const { init } = sent(fetchImpl)
    expect(init.method).toBe('POST')
    expect(init.body).toBe(req.body)
    expect((init as { duplex?: string }).duplex).toBe('half')
    expect(header(init, 'content-length')).toBe('10')
  })

  test('gives up after 10 seconds and answers 503', async () => {
    const signal = new AbortController().signal
    const timeout = jest.spyOn(AbortSignal, 'timeout').mockReturnValue(signal)
    const logError = jest.spyOn(logger, 'error').mockImplementation(() => undefined)
    const { fetchImpl, deps } = setup()
    fetchImpl.mockRejectedValue(new Error('timeout'))

    const res = await forwardToApp(new Request('http://web/apps/tea-tour/'), app, [], deps)

    expect(timeout).toHaveBeenCalledWith(10_000)
    expect(sent(fetchImpl).init.signal).toBe(signal)
    expect(res.status).toBe(503)
    expect(logError).toHaveBeenCalledWith('Mini-app request failed', expect.objectContaining({ app: 'tea-tour' }))
    timeout.mockRestore()
    logError.mockRestore()
  })

  test('rejects traversal and encoded separators', async () => {
    const { fetchImpl, deps } = setup()
    const bad = [['..'], ['.'], ['a', '', 'b'], ['a/b'], ['a\\b'], ['%2e%2e'], ['x%2Fy'], ['x%5cy'], ['%2E']]
    for (const path of bad) {
      const res = await forwardToApp(new Request('http://web/apps/tea-tour/x'), app, path, deps)
      expect(res.status).toBe(400)
    }
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  test('attaches the token only on protected paths', async () => {
    const protectedCall = setup()
    await forwardToApp(new Request('http://web/apps/tea-tour/'), app, [], protectedCall.deps)
    expect(header(sent(protectedCall.fetchImpl).init, 'authorization')).toBe('Bearer tok')

    const publicCall = setup(undefined, '198.51.100.50')
    await forwardToApp(new Request('http://web/apps/tea-tour/public/book'), app, ['public', 'book'], publicCall.deps)
    expect(publicCall.getToken).not.toHaveBeenCalled()
    expect(header(sent(publicCall.fetchImpl).init, 'authorization')).toBeNull()
  })

  test('drops browser cookie and authorization headers', async () => {
    const { fetchImpl, deps } = setup()
    const req = new Request('http://web/apps/tea-tour/public/x', {
      headers: { cookie: 'authjs.session-token=s', authorization: 'Bearer forged', 'x-hasura-role': 'admin', 'x-hasura-admin-secret': 'z' },
    })

    await forwardToApp(req, app, ['public', 'x'], { ...deps, clientIp: '198.51.100.51' })

    const headers = new Headers(sent(fetchImpl).init.headers)
    expect(headers.get('cookie')).toBeNull()
    expect(headers.get('authorization')).toBeNull()
    expect(Array.from(headers.keys()).filter(name => name.startsWith('x-hasura-'))).toEqual([])
  })

  test('keeps redirects and strips set-cookie', async () => {
    const upstream = new Response(null, {
      status: 303,
      headers: { location: '/apps/tea-tour/?said=hi', 'set-cookie': 'app=1', 'x-powered-by': 'app' },
    })
    const { deps } = setup(upstream)

    const res = await forwardToApp(new Request('http://web/apps/tea-tour/echo', { method: 'POST', body: 'a=1' }), app, ['echo'], deps)

    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/apps/tea-tour/?said=hi')
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(res.headers.get('x-powered-by')).toBeNull()
  })

  test.each([
    ['/apps/tea-tour/?said=hi'],
    ['/apps/tea-tour'],
    ['?said=hi'],
    ['done'],
    ['http://web/apps/tea-tour/done'],
  ])('keeps a redirect that stays in the app: %s', async (location) => {
    const { deps } = setup(new Response(null, { status: 303, headers: { location } }))

    const res = await forwardToApp(new Request('http://web/apps/tea-tour/echo', { method: 'POST', body: 'a=1' }), app, ['echo'], deps)

    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe(location)
  })

  test.each([
    ['https://evil.example/apps/tea-tour/'],
    ['//evil.example/apps/tea-tour/'],
    ['http://apisix:9081/apps/tea-tour/'],
    ['/manager/dashboard'],
    ['/apps/other/'],
    ['/apps/tea-tourx/'],
    ['/apps/tea-tour/../other/'],
    ['/apps/tea-tour/%2e%2e/other/'],
    ['javascript:alert(1)'],
  ])('drops a redirect that leaves the app and answers 502: %s', async (location) => {
    const logError = jest.spyOn(logger, 'error').mockImplementation(() => undefined)
    const { deps } = setup(new Response(null, { status: 302, headers: { location } }))

    const res = await forwardToApp(new Request('http://web/apps/tea-tour/echo', { method: 'POST', body: 'a=1' }), app, ['echo'], deps)

    expect(res.status).toBe(502)
    expect(res.headers.get('location')).toBeNull()
    expect(res.headers.get('content-security-policy')).toBe(CSP)
    expect(await res.text()).toMatch(/chuyển hướng/)
    expect(logError).toHaveBeenCalledWith('Mini-app redirect refused', { app: 'tea-tour' })
    logError.mockRestore()
  })

  test('replaces a forged browser authorization with the session token on protected paths', async () => {
    const { fetchImpl, deps } = setup()
    const req = new Request('http://web/apps/tea-tour/', { headers: { authorization: 'Bearer forged' } })

    await forwardToApp(req, app, [], deps)

    expect(header(sent(fetchImpl).init, 'authorization')).toBe('Bearer tok')
  })

  test('uses the injected public limiter', async () => {
    const { fetchImpl, deps } = setup()
    const isPublicLimited = jest.fn().mockReturnValue(true)

    const res = await forwardToApp(new Request('http://web/apps/tea-tour/public/x'), app, ['public', 'x'], { ...deps, isPublicLimited })

    expect(res.status).toBe(429)
    expect(isPublicLimited).toHaveBeenCalledWith('203.0.113.1')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  test('sets the CSP without scripts', async () => {
    const { deps } = setup(new Response('<p>hi</p>', { headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "script-src *" } }))

    const res = await forwardToApp(new Request('http://web/apps/tea-tour/'), app, [], deps)

    expect(res.headers.get('content-security-policy')).toBe(CSP)
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(await res.text()).toBe('<p>hi</p>')
  })

  test('limits public paths per client ip', async () => {
    const { fetchImpl, deps } = setup()
    fetchImpl.mockImplementation(async () => new Response('ok'))
    const call = (ip: string) =>
      forwardToApp(new Request('http://web/apps/tea-tour/public/x'), app, ['public', 'x'], { ...deps, clientIp: ip })

    for (let i = 0; i < 10; i++) expect((await call('192.0.2.10')).status).toBe(200)
    const limited = await call('192.0.2.10')
    expect(limited.status).toBe(429)
    expect(limited.headers.get('content-security-policy')).toBe(CSP)
    expect((await call('192.0.2.11')).status).toBe(200)
    // Protected paths are not counted against the public limit.
    expect((await forwardToApp(new Request('http://web/apps/tea-tour/'), app, [], { ...deps, clientIp: '192.0.2.10' })).status).toBe(200)
  })

  describe('cross-site writes (R18)', () => {
    const post = (headers: Record<string, string>, method = 'POST') =>
      new Request('http://0.0.0.0:3000/apps/tea-tour/tours', { method, body: method === 'GET' ? undefined : 'a=1', headers })

    beforeEach(() => {
      process.env.AUTH_URL = 'https://htx.example.vn'
    })
    afterEach(() => {
      delete process.env.AUTH_URL
    })

    test.each([
      ['POST', { origin: 'https://evil.example', host: 'htx.example.vn' }],
      ['POST', { origin: 'null', host: 'htx.example.vn' }],
      ['PUT', { origin: 'https://evil.example' }],
      ['DELETE', { origin: 'http://htx.example.vn.evil.example' }],
    ])('refuses a %s from another origin with 403 before any token or upstream call: %j', async (method, headers) => {
      const { fetchImpl, getToken, deps } = setup()

      const res = await forwardToApp(post(headers, method), app, ['tours'], deps)

      expect(res.status).toBe(403)
      expect(res.headers.get('content-security-policy')).toBe(CSP)
      expect(await res.text()).toMatch(/trang khác/)
      expect(getToken).not.toHaveBeenCalled()
      expect(fetchImpl).not.toHaveBeenCalled()
    })

    test('refuses a public form posted from another origin too', async () => {
      const { fetchImpl, deps } = setup()
      const req = new Request('http://web/apps/tea-tour/public/TC/tours/x/book', { method: 'POST', body: 'a=1', headers: { origin: 'https://evil.example' } })

      expect((await forwardToApp(req, app, ['public', 'TC', 'tours', 'x', 'book'], deps)).status).toBe(403)
      expect(fetchImpl).not.toHaveBeenCalled()
    })

    test.each([
      ['the Host header', { origin: 'http://localhost:3000', host: 'localhost:3000' }],
      ['AUTH_URL', { origin: 'https://htx.example.vn', host: 'web:3000' }],
      ['no Origin header', {}],
    ])('forwards a POST whose origin matches %s', async (_, headers) => {
      const { fetchImpl, deps } = setup()

      const res = await forwardToApp(post(headers), app, ['tours'], deps)

      expect(res.status).toBe(200)
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    })

    test('does not check the origin of a GET', async () => {
      const { fetchImpl, deps } = setup()

      await forwardToApp(post({ origin: 'https://evil.example' }, 'GET'), app, ['tours'], deps)

      expect(fetchImpl).toHaveBeenCalledTimes(1)
    })
  })

  test('answers 401 when the session has no token', async () => {
    const { fetchImpl, getToken, deps } = setup()
    getToken.mockRejectedValue(new Error('no session'))

    const res = await forwardToApp(new Request('http://web/apps/tea-tour/'), app, [], deps)

    expect(res.status).toBe(401)
    expect(res.headers.get('content-type')).toMatch(/^text\/html/)
    expect(res.headers.get('content-security-policy')).toBe(CSP)
    const body = await res.text()
    expect(body).toContain('đăng nhập')
    expect(body).toMatch(/<a href="\/login" target="_top">/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
