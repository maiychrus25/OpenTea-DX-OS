/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { auth } from '@/auth'
import { AppStoreError } from '@/domain/entities/app-store'
import { NoHtxError, UnauthorizedError } from '@/domain/errors'
import { requireTenant } from '@/lib/api/tenant'
import { GET } from '@/app/api/app-store/route'
import { POST } from '@/app/api/app-store/requests/route'

const repository = { snapshot: jest.fn(), workerAlive: jest.fn(), createRequest: jest.fn() }

jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/api/tenant', () => ({ requireTenant: jest.fn() }))
jest.mock('@/infrastructure/db/repositories/prisma-app-store-repository', () => ({
  PrismaAppStoreRepository: jest.fn().mockImplementation(() => repository),
}))

const mock = (fn: unknown) => fn as jest.Mock
const app = { id: 'hello', name: 'Xin chào', version: '0.1.0', description: '', license: 'MIT', publisher: 'P', roles: ['manager'], hasPublic: false }
const post = (body: unknown) =>
  POST(new Request('http://web/api/app-store/requests', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }), {})
const get = () => GET(new Request('http://web/api/app-store'), {})

beforeEach(() => {
  jest.clearAllMocks()
  mock(auth).mockResolvedValue({ user: { id: 'u1', role: 'manager', htxCode: 'TC' } })
  mock(requireTenant).mockResolvedValue({ userId: 'u1', role: 'manager', htxCode: 'TC', htxProfileId: 'htx-tc' })
  repository.snapshot.mockResolvedValue({ apps: [app], open: [], enablements: [], latest: [] })
  repository.workerAlive.mockResolvedValue(true)
  repository.createRequest.mockResolvedValue(undefined)
})

describe.each([
  ['GET /api/app-store', () => get()],
  ['POST /api/app-store/requests', () => post({ appId: 'hello', action: 'ENABLE' })],
])('%s', (_name, call) => {
  test('401 without a session', async () => {
    mock(auth).mockResolvedValue(null)
    const response = await call()
    expect(response.status).toBe(401)
    expect((await response.json()).error.code).toBe('UNAUTHORIZED')
  })

  test.each(['officer', 'farmer'])('403 FORBIDDEN for a %s, before any lookup', async role => {
    mock(auth).mockResolvedValue({ user: { id: 'u1', role, htxCode: 'TC' } })
    const response = await call()
    expect(response.status).toBe(403)
    expect((await response.json()).error.code).toBe('FORBIDDEN')
    expect(requireTenant).not.toHaveBeenCalled()
    expect(repository.snapshot).not.toHaveBeenCalled()
  })

  test('403 NO_HTX for a manager without an HTX', async () => {
    mock(requireTenant).mockRejectedValue(new NoHtxError())
    const response = await call()
    expect(response.status).toBe(403)
    expect((await response.json()).error.code).toBe('NO_HTX')
  })

  test('401 when the tenant lookup finds no user', async () => {
    mock(requireTenant).mockRejectedValue(new UnauthorizedError())
    expect((await call()).status).toBe(401)
  })
})

describe('GET /api/app-store', () => {
  test('200 with the worker flag and the cards of the session HTX', async () => {
    const response = await get()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { workerAlive: true, apps: [{ ...app, status: 'available', error: null }] } })
    expect(repository.snapshot).toHaveBeenCalledWith('TC')
  })
})

describe('POST /api/app-store/requests', () => {
  test('202 and a queued request for the session HTX, whatever HTX the body names', async () => {
    const response = await post({ appId: 'hello', action: 'ENABLE', htxCode: 'LB', htx_code: 'LB', requestedBy: 'attacker' })
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ data: { status: 'installing' } })
    expect(repository.createRequest).toHaveBeenCalledWith('hello', 'TC', 'ENABLE', 'u1')
  })

  test.each([
    ['not JSON', 'nope'],
    ['no action', { appId: 'hello' }],
    ['an unknown action', { appId: 'hello', action: 'PURGE' }],
    ['an id that is not an app id', { appId: '../x', action: 'ENABLE' }],
    ['a non-string id', { appId: 7, action: 'ENABLE' }],
  ])('400 VALIDATION_ERROR for %s', async (_name, body) => {
    const response = await post(body)
    expect(response.status).toBe(400)
    expect((await response.json()).error.code).toBe('VALIDATION_ERROR')
    expect(repository.createRequest).not.toHaveBeenCalled()
  })

  test('404 APP_NOT_FOUND', async () => {
    const response = await post({ appId: 'ghost', action: 'ENABLE' })
    expect(response.status).toBe(404)
    expect((await response.json()).error.code).toBe('APP_NOT_FOUND')
  })

  test.each([
    ['ALREADY_ENABLED', 'ENABLE', { enablements: [{ appId: 'hello', htxCode: 'TC' }] }],
    ['NOT_ENABLED', 'DISABLE', {}],
    ['ENABLED_FOR_ALL', 'ENABLE', { enablements: [{ appId: 'hello', htxCode: '*' }] }],
    ['REQUEST_OPEN', 'ENABLE', { open: [{ appId: 'hello', action: 'ENABLE' }] }],
  ])('409 %s', async (errorCode, action, over) => {
    repository.snapshot.mockResolvedValue({ apps: [app], open: [], enablements: [], latest: [], ...over })
    const response = await post({ appId: 'hello', action })
    expect(response.status).toBe(409)
    expect((await response.json()).error.code).toBe(errorCode)
  })

  // Review focus 1: both posts pass the status check; the unique index lets only one insert through.
  test('two concurrent ENABLE posts give one 202 and one 409 REQUEST_OPEN', async () => {
    repository.createRequest
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new AppStoreError('REQUEST_OPEN', 'Ứng dụng này đang được xử lý. Vui lòng đợi.'))

    const responses = await Promise.all([post({ appId: 'hello', action: 'ENABLE' }), post({ appId: 'hello', action: 'ENABLE' })])

    expect(responses.map(r => r.status).sort()).toEqual([202, 409])
    const refused = responses.find(r => r.status === 409)!
    expect((await refused.json()).error.code).toBe('REQUEST_OPEN')
  })

  test('an unexpected repository error is a 500, not a refusal', async () => {
    repository.createRequest.mockRejectedValue(new Error('db down'))
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
    expect((await post({ appId: 'hello', action: 'ENABLE' })).status).toBe(500)
  })
})
