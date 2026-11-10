/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { CoreGatewayClient, parseCoreTimestamp } from '@/infrastructure/core/core-gateway.client'
import { CoreUnauthorizedError, CoreUnavailableError, ForbiddenError } from '@/domain/errors'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { logger } from '@/lib/logger'

jest.mock('@/lib/auth/core-token', () => ({ getCoreToken: jest.fn() }))

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const clientWith = (fetchImpl: jest.Mock) => new CoreGatewayClient('manager', async () => 'tok', fetchImpl as unknown as typeof fetch)

beforeAll(() => {
  process.env.CORE_GATEWAY_URL = 'http://gateway:9081'
})

let logError: jest.SpyInstance
beforeEach(() => {
  logError = jest.spyOn(logger, 'error').mockImplementation(() => undefined)
})
afterEach(() => logError.mockRestore())

describe('CoreGatewayClient', () => {
  test('graphql sends Authorization and x-hasura-role to CORE_GATEWAY_URL/api/data/graphql', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(reply({ data: { parcels: [] } }))

    await expect(clientWith(fetchImpl).graphql('query Q { parcels { id } }', { a: 1 })).resolves.toEqual({ parcels: [] })

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('http://gateway:9081/api/data/graphql')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ Authorization: 'Bearer tok', 'x-hasura-role': 'manager' })
    expect(JSON.parse(init.body)).toEqual({ query: 'query Q { parcels { id } }', variables: { a: 1 } })
    // Next.js would otherwise cache this POST across users.
    expect(init.cache).toBe('no-store')
  })

  test('graphql gives up after 10 seconds', async () => {
    const signal = new AbortController().signal
    const timeout = jest.spyOn(AbortSignal, 'timeout').mockReturnValue(signal)
    const fetchImpl = jest.fn().mockResolvedValue(reply({ data: {} }))

    await clientWith(fetchImpl).graphql('{ a }')

    expect(timeout).toHaveBeenCalledWith(10_000)
    expect(fetchImpl.mock.calls[0][1].signal).toBe(signal)
    timeout.mockRestore()
  })

  test.each([
    ['a network error', () => Promise.reject(new TypeError('fetch failed'))],
    ['a timeout', () => Promise.reject(new DOMException('timed out', 'TimeoutError'))],
    ['a 5xx', () => Promise.resolve(reply({}, 502))],
    ['an unexpected status', () => Promise.resolve(reply({}, 429))],
    ['a body that is not JSON', () => Promise.resolve(new Response('<html>', { status: 200 }))],
    ['a body with errors', () => Promise.resolve(reply({ errors: [{ message: 'field not found' }] }))],
  ])('graphql throws CoreUnavailableError on %s', async (_name, respond) => {
    await expect(clientWith(jest.fn(respond)).graphql('{ a }')).rejects.toBeInstanceOf(CoreUnavailableError)
  })

  test('graphql throws CoreUnauthorizedError on 401', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(reply({}, 401))
    await expect(clientWith(fetchImpl).graphql('{ a }')).rejects.toBeInstanceOf(CoreUnauthorizedError)
  })

  test('graphql throws ForbiddenError on 403, which does not claim the core is down', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(reply({}, 403))
    const failure = clientWith(fetchImpl).graphql('{ a }')
    await expect(failure).rejects.toBeInstanceOf(ForbiddenError)
    await expect(failure).rejects.not.toBeInstanceOf(CoreUnavailableError)
  })

  test('graphql never returns partial data when errors is present', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(reply({ data: { parcels: [{ id: 'p1' }] }, errors: [{ message: 'x' }] }))
    await expect(clientWith(fetchImpl).graphql('{ parcels { id } }')).rejects.toBeInstanceOf(CoreUnavailableError)
  })

  test('a token failure is not reported as the core being down', async () => {
    const client = new CoreGatewayClient('manager', async () => {
      throw new CoreUnauthorizedError()
    }, jest.fn() as unknown as typeof fetch)
    await expect(client.graphql('{ a }')).rejects.toBeInstanceOf(CoreUnauthorizedError)
  })
})

describe('CoreGatewayClient logging', () => {
  const failingRequest = (respond: () => Promise<Response>) =>
    clientWith(jest.fn(respond)).graphql('query ($id: String!) { a(id: $id) }', { id: 'secret-variable-value' }).catch(() => undefined)
  const logged = () => JSON.stringify(logError.mock.calls)

  test('logs the HTTP status of a failed response', async () => {
    await failingRequest(() => Promise.resolve(reply({}, 502)))
    expect(logError).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ status: 502 }))
  })

  test.each([401, 403])('logs a %i from the gateway', async (status) => {
    await failingRequest(() => Promise.resolve(reply({}, status)))
    expect(logError).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ status }))
  })

  test('logs the errors of a GraphQL failure', async () => {
    const errors = [{ message: 'field not found', extensions: { code: 'validation-failed' } }]
    await failingRequest(() => Promise.resolve(reply({ errors })))
    expect(logError).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ status: 200, errors }))
  })

  test('logs the cause of a network failure', async () => {
    const cause = new TypeError('fetch failed')
    await failingRequest(() => Promise.reject(cause))
    expect(logError).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ cause }))
  })

  test.each([
    ['a failed response', () => Promise.resolve(reply({}, 502))],
    ['a GraphQL failure', () => Promise.resolve(reply({ errors: [{ message: 'x' }] }))],
    ['a network failure', () => Promise.reject(new TypeError('fetch failed'))],
  ])('never logs the token or the variable values on %s', async (_name, respond) => {
    await failingRequest(respond)
    expect(logError).toHaveBeenCalled()
    expect(logged()).not.toContain('tok')
    expect(logged()).not.toContain('secret-variable-value')
  })
})

describe('parseCoreTimestamp', () => {
  test('reads a timestamp without a zone as UTC, as Prisma does', () => {
    expect(parseCoreTimestamp('2026-07-20T01:02:03.456').toISOString()).toBe('2026-07-20T01:02:03.456Z')
  })

  test('keeps a zone that is present', () => {
    expect(parseCoreTimestamp('2026-07-20T01:02:03+07:00').toISOString()).toBe('2026-07-19T18:02:03.000Z')
  })
})

describe('withErrorHandler', () => {
  const failing = (error: Error) =>
    withErrorHandler(async () => {
      throw error
    })(new Request('http://localhost/api/x'), {})

  test('withErrorHandler maps CoreUnavailableError to 503 CORE_UNAVAILABLE', async () => {
    const response = (await failing(new CoreUnavailableError())) as NextResponse
    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body.error.code).toBe('CORE_UNAVAILABLE')
    expect(body.error.message).toMatch(/Vui lòng thử lại/)
  })

  test('withErrorHandler maps CoreUnauthorizedError to the 401 that sends the client to login', async () => {
    const response = (await failing(new CoreUnauthorizedError())) as NextResponse
    expect(response.status).toBe(401)
    expect((await response.json()).error.code).toBe('UNAUTHORIZED')
  })

  test('CoreUnavailableError carries the digest that reaches error.tsx', () => {
    expect(new CoreUnavailableError().digest).toBe('CORE_UNAVAILABLE')
  })

  test('CoreUnauthorizedError carries the digest that reaches error.tsx', () => {
    expect(new CoreUnauthorizedError().digest).toBe('CORE_UNAUTHORIZED')
  })
})
