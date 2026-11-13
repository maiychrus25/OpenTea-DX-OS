/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { auth } from '@/auth'
import { AppStoreError } from '@/domain/entities/app-store'
import { NoHtxError, UnauthorizedError } from '@/domain/errors'
import { requireTenant } from '@/lib/api/tenant'
import { GET } from '@/app/api/app-store/route'
import { POST } from '@/app/api/app-store/requests/route'
import { GET as getDetail } from '@/app/api/app-store/apps/[id]/route'
import { GET as getScreenshot } from '@/app/api/app-store/apps/[id]/screenshots/[position]/route'
import { GET as getHistory } from '@/app/api/app-store/history/route'

const repository = {
  snapshot: jest.fn(),
  workerAlive: jest.fn(),
  createRequest: jest.fn(),
  history: jest.fn(),
  screenshots: jest.fn(),
  screenshot: jest.fn(),
}

jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/api/tenant', () => ({ requireTenant: jest.fn() }))
jest.mock('@/infrastructure/db/repositories/prisma-app-store-repository', () => ({
  PrismaAppStoreRepository: jest.fn().mockImplementation(() => repository),
}))

const mock = (fn: unknown) => fn as jest.Mock
const app = { id: 'hello', name: 'Xin chào', version: '0.1.0', description: '', license: 'MIT', publisher: 'P', roles: ['manager'], hasPublic: false, menu: [], hasDatabase: false, requiresCore: null, installedOnServer: false, store: {} }
const cardOf = ({ menu: _m, hasDatabase: _d, requiresCore: _r, store: _s, ...card }: typeof app) => card
const post = (body: unknown) =>
  POST(new Request('http://web/api/app-store/requests', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }), {})
const get = () => GET(new Request('http://web/api/app-store'), {})

beforeEach(() => {
  jest.clearAllMocks()
  mock(auth).mockResolvedValue({ user: { id: 'u1', name: 'An', role: 'manager', htxCode: 'TC' } })
  mock(requireTenant).mockResolvedValue({ userId: 'u1', role: 'manager', htxCode: 'TC', htxProfileId: 'htx-tc' })
  repository.snapshot.mockResolvedValue({ apps: [app], open: [], enablements: [], latest: [] })
  repository.workerAlive.mockResolvedValue(true)
  repository.createRequest.mockResolvedValue(undefined)
  repository.history.mockResolvedValue([])
  repository.screenshots.mockResolvedValue([])
  repository.screenshot.mockResolvedValue(null)
})

describe.each([
  ['GET /api/app-store', () => get()],
  ['POST /api/app-store/requests', () => post({ appId: 'hello', action: 'ENABLE' })],
  ['GET /api/app-store/apps/[id]', () => getDetail(new Request('http://web/x'), { params: { id: 'hello' } })],
  ['GET /api/app-store/apps/[id]/screenshots/[position]', () => getScreenshot(new Request('http://web/x'), { params: { id: 'hello', position: '0' } })],
  ['GET /api/app-store/history', () => getHistory(new Request('http://web/x'), {})],
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
    expect(await response.json()).toEqual({ data: { workerAlive: true, apps: [{ ...cardOf(app), status: 'available', error: null, category: null, icon: null, phase: null, openHref: null }] } })
    expect(repository.snapshot).toHaveBeenCalledWith('TC')
  })
})

describe('POST /api/app-store/requests', () => {
  test('202 and a queued request for the session HTX, whatever HTX the body names', async () => {
    const response = await post({ appId: 'hello', action: 'ENABLE', htxCode: 'LB', htx_code: 'LB', requestedBy: 'attacker' })
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ data: { status: 'installing' } })
    expect(repository.createRequest).toHaveBeenCalledWith('hello', 'TC', 'ENABLE', 'u1', 'An')
  })

  test('the requester name comes from the session, never from the body; null without one', async () => {
    mock(auth).mockResolvedValue({ user: { id: 'u1', role: 'manager', htxCode: 'TC' } })
    await post({ appId: 'hello', action: 'ENABLE', requestedByName: 'attacker', userName: 'attacker' })
    expect(repository.createRequest).toHaveBeenCalledWith('hello', 'TC', 'ENABLE', 'u1', null)
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

describe('GET /api/app-store/apps/[id]', () => {
  const detail = (id: string, url = `http://web/api/app-store/apps/${id}`) => getDetail(new Request(url), { params: { id } })

  test('200 with the detail of the session HTX; a query htxCode is ignored', async () => {
    const response = await detail('hello', 'http://web/api/app-store/apps/hello?htxCode=LB')
    expect(response.status).toBe(200)
    expect((await response.json()).data).toMatchObject({ id: 'hello', status: 'available', preview: expect.any(Array) })
    expect(repository.snapshot).toHaveBeenCalledWith('TC')
    expect(repository.history).toHaveBeenCalledWith('TC', 'hello', 20)
  })

  test.each(['ghost', '../x', 'A', 'x', '1abc'])('404 APP_NOT_FOUND for %s', async id => {
    const response = await detail(id)
    expect(response.status).toBe(404)
    expect((await response.json()).error.code).toBe('APP_NOT_FOUND')
  })
})

describe('GET /api/app-store/apps/[id]/screenshots/[position]', () => {
  const shot = (id: string, position: string) => getScreenshot(new Request('http://web/x'), { params: { id, position } })

  test('200 with the stored bytes and the safe headers', async () => {
    repository.screenshot.mockResolvedValue({ contentType: 'image/webp', bytes: new Uint8Array([1, 2, 3]) })
    const response = await shot('hello', '2')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/webp')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('cache-control')).toBe('private, max-age=300')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
    expect(repository.screenshot).toHaveBeenCalledWith('hello', 2)
  })

  test.each([['hello', '4'], ['hello', '-1'], ['hello', '1.5'], ['hello', 'a'], ['hello', ''], ['../x', '0'], ['hello', '01']])(
    '404 for app %s position %s, without a lookup',
    async (id, position) => {
      expect((await shot(id, position)).status).toBe(404)
      expect(repository.screenshot).not.toHaveBeenCalled()
    },
  )

  test('404 when there is no such image', async () => {
    expect((await shot('hello', '0')).status).toBe(404)
  })
})

describe('GET /api/app-store/history', () => {
  test('200 with the 50 newest requests of the session HTX; a query htxCode is ignored', async () => {
    repository.history.mockResolvedValue([{ id: 'r1' }])
    const response = await getHistory(new Request('http://web/api/app-store/history?htxCode=LB'), {})
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: [{ id: 'r1' }] })
    expect(repository.history).toHaveBeenCalledWith('TC', null, 50)
  })
})
