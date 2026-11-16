/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { createHmac } from 'node:crypto'
import { auth } from '@/auth'
import { authFromRequest, coreTokenOf, resetJwksCache } from '@/lib/auth/request-user'
import { CoreUnavailableError, ForbiddenError, UnauthorizedError } from '@/domain/errors'
import { ISSUER, baseClaims, jwksResponse, makeKey, signToken } from '@/test-support/bearer-fixture'

jest.mock('@/auth', () => ({ auth: jest.fn() }))

const mock = (fn: unknown) => fn as jest.Mock
const key = makeKey('k1')
const otherKey = makeKey('k1') // same kid, different key: a forged signature
const fetchMock = jest.fn()
const originalFetch = global.fetch

const request = (authorization?: string) =>
  new Request('http://localhost/api/journal', { headers: authorization === undefined ? {} : { authorization } })
const bearer = (claims: Record<string, unknown> = {}, k = key, header: Record<string, unknown> = {}) =>
  request(`Bearer ${signToken(k, baseClaims(claims), header)}`)

beforeEach(() => {
  jest.clearAllMocks()
  resetJwksCache()
  process.env.KEYCLOAK_ISSUER = ISSUER
  fetchMock.mockImplementation(async () => jwksResponse(key))
  global.fetch = fetchMock as unknown as typeof fetch
  mock(auth).mockResolvedValue(null)
})
afterAll(() => {
  global.fetch = originalFetch
  delete process.env.KEYCLOAK_ISSUER
})

describe('a valid mobile token', () => {
  test('gives the same user shape as a session', async () => {
    const result = await authFromRequest(bearer())
    expect(result?.user).toEqual({ id: 'user-1', role: 'farmer', htxCode: 'TC', name: 'Nguyen Van A' })
    expect(auth).not.toHaveBeenCalled()
  })

  test('takes the strongest role', async () => {
    const result = await authFromRequest(bearer({ realm_access: { roles: ['farmer', 'manager'] } }))
    expect(result?.user.role).toBe('manager')
  })

  test('hands the verified token on as the core token', async () => {
    const result = await authFromRequest(bearer())
    expect(await coreTokenOf(result!)!()).toBe(result!.accessToken)
  })

  test('caches the key set', async () => {
    await authFromRequest(bearer())
    await authFromRequest(bearer())
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('a token with no usable htx_code yields htxCode null', async () => {
    expect((await authFromRequest(bearer({ htx_code: 42 })))?.user.htxCode).toBeNull()
    expect((await authFromRequest(bearer({ htx_code: '../x' })))?.user.htxCode).toBeNull()
  })

  test('refetches once for an unknown kid after the cache is old enough (rotation), not on every miss', async () => {
    await authFromRequest(bearer())
    const rotated = makeKey('k2')
    fetchMock.mockImplementation(async () => jwksResponse(key, rotated))
    const realNow = Date.now
    Date.now = () => realNow() + 60_000
    try {
      expect((await authFromRequest(bearer({}, rotated)))?.user.id).toBe('user-1')
      await expect(authFromRequest(bearer({}, makeKey('k3')))).rejects.toBeInstanceOf(UnauthorizedError)
      await expect(authFromRequest(bearer({}, makeKey('k4')))).rejects.toBeInstanceOf(UnauthorizedError)
    } finally {
      Date.now = realNow
    }
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('an invalid mobile token is 401 and never falls back to the cookie', () => {
  beforeEach(() => mock(auth).mockResolvedValue({ user: { id: 'cookie-user', role: 'manager', htxCode: 'TC' } }))

  const rejected = async (req: Request) => {
    await expect(authFromRequest(req)).rejects.toBeInstanceOf(UnauthorizedError)
    expect(auth).not.toHaveBeenCalled()
  }

  test('expired', () => rejected(bearer({ exp: Math.floor(Date.now() / 1000) - 120 })))
  test('not yet valid', () => rejected(bearer({ nbf: Math.floor(Date.now() / 1000) + 600 })))
  test('no exp', () => rejected(bearer({ exp: undefined })))
  test('wrong issuer', () => rejected(bearer({ iss: 'http://evil.test/realms/agrimarket' })))
  test('wrong authorized party (service account or web client)', async () => {
    await rejected(bearer({ azp: 'nextjs-web' }))
    await rejected(bearer({ azp: 'dx-os-service' }))
    await rejected(bearer({ azp: undefined, aud: 'dxos-mobile' }))
  })
  test('bad signature', () => rejected(bearer({}, otherKey)))
  test('unknown kid', () => rejected(bearer({}, makeKey('nope'))))
  test('missing sub', () => rejected(bearer({ sub: undefined })))
  test('alg none', () => {
    const head = Buffer.from(JSON.stringify({ alg: 'none', kid: 'k1' })).toString('base64url')
    const body = Buffer.from(JSON.stringify(baseClaims())).toString('base64url')
    return rejected(request(`Bearer ${head}.${body}.`))
  })
  test('HS256 signed with the public key as secret', () => {
    const head = Buffer.from(JSON.stringify({ alg: 'HS256', kid: 'k1' })).toString('base64url')
    const body = Buffer.from(JSON.stringify(baseClaims())).toString('base64url')
    const secret = JSON.stringify(key.jwk)
    const mac = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')
    return rejected(request(`Bearer ${head}.${body}.${mac}`))
  })
  test('garbage', async () => {
    await rejected(request('Bearer not-a-jwt'))
    await rejected(request('Bearer a.b.c'))
    await rejected(request('Bearer '))
    await rejected(request('Bearer'))
    await rejected(request(`Bearer ${'a'.repeat(9000)}`))
  })
  test('payload tampered after signing', () => {
    const [h, , s] = signToken(key, baseClaims()).split('.')
    const forged = Buffer.from(JSON.stringify(baseClaims({ realm_access: { roles: ['manager'] } }))).toString('base64url')
    return rejected(request(`Bearer ${h}.${forged}.${s}`))
  })
})

describe('roles', () => {
  test('a verified token without a mapped role is 403', async () => {
    await expect(authFromRequest(bearer({ realm_access: { roles: ['customer'] } }))).rejects.toBeInstanceOf(ForbiddenError)
    await expect(authFromRequest(bearer({ realm_access: undefined }))).rejects.toBeInstanceOf(ForbiddenError)
  })
})

describe('Keycloak unreachable', () => {
  test('fails closed with 503, never trusting the token', async () => {
    fetchMock.mockRejectedValue(new Error('down'))
    await expect(authFromRequest(bearer())).rejects.toBeInstanceOf(CoreUnavailableError)
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }))
    await expect(authFromRequest(bearer())).rejects.toBeInstanceOf(CoreUnavailableError)
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
    await expect(authFromRequest(bearer())).rejects.toBeInstanceOf(CoreUnavailableError)
  })
})

describe('without a Bearer header', () => {
  test('uses the cookie session', async () => {
    mock(auth).mockResolvedValue({ user: { id: 'c1', role: 'officer', htxCode: 'TC' } })
    const result = await authFromRequest(request())
    expect(result).toEqual({ user: { id: 'c1', role: 'officer', htxCode: 'TC' }, accessToken: null })
    expect(coreTokenOf(result!)).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('no session is null', async () => {
    expect(await authFromRequest(request())).toBeNull()
  })

  test('another scheme is not a Bearer', async () => {
    mock(auth).mockResolvedValue({ user: { id: 'c1', role: 'officer', htxCode: 'TC' } })
    expect((await authFromRequest(request('Basic abc')))?.user.id).toBe('c1')
  })
})
