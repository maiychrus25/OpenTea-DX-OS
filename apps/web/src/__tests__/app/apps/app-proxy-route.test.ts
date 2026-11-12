/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { prisma } from '@/infrastructure/db/prisma.client'
import { GET, POST, dynamic } from '@/app/apps/[id]/[[...path]]/route'
import { logger } from '@/lib/logger'

jest.mock('@/auth', () => ({ auth: jest.fn().mockResolvedValue({ user: { id: 'u1', htxCode: 'TC' } }) }))
jest.mock('@/lib/auth/core-token', () => ({ getCoreToken: jest.fn().mockResolvedValue('tok') }))
jest.mock('@/infrastructure/db/prisma.client', () => ({ prisma: { $queryRaw: jest.fn() } }))

const row = { id: 'hello', name: 'Xin chào', version: '0.1.0', menu: [], public_prefixes: [] }
const queryRaw = prisma.$queryRaw as unknown as jest.Mock

beforeAll(() => {
  process.env.CORE_GATEWAY_URL = 'http://apisix:9081'
})
beforeEach(() => {
  queryRaw.mockReset()
  global.fetch = jest.fn(async () => new Response('<h1>Xin chào</h1>', { headers: { 'content-type': 'text/html' } })) as unknown as typeof fetch
})

describe('/apps/[id]/[[...path]]', () => {
  test('is never statically rendered', () => {
    expect(dynamic).toBe('force-dynamic')
  })

  test('forwards only to installed apps', async () => {
    queryRaw.mockResolvedValueOnce([row]).mockResolvedValueOnce([{ enabled: true }]).mockResolvedValueOnce([])
    const get = () => GET(new Request('http://web/apps/hello/'), { params: { id: 'hello' } })

    const first = await get()
    expect(first.status).toBe(200)
    expect(await first.text()).toBe('<h1>Xin chào</h1>')
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('http://apisix:9081/apps/hello/')

    // Removed between two requests: the next one is 404 at once, with no cached app list.
    const second = await get()
    expect(second.status).toBe(404)
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(queryRaw).toHaveBeenCalledTimes(3)
  })

  test('answers 404 for an installed app that the session HTX did not enable', async () => {
    queryRaw.mockResolvedValueOnce([row]).mockResolvedValueOnce([{ enabled: false }])
    const res = await GET(new Request('http://web/apps/hello/'), { params: { id: 'hello' } })
    expect(res.status).toBe(404)
    expect(global.fetch).not.toHaveBeenCalled()
    expect(queryRaw.mock.calls[1].slice(1)).toEqual(['hello', 'TC'])
  })

  test('an unknown app is 404 for every method', async () => {
    queryRaw.mockResolvedValue([])
    const res = await POST(new Request('http://web/apps/nope/echo', { method: 'POST', body: 'a=1' }), { params: { id: 'nope', path: ['echo'] } })
    expect(res.status).toBe(404)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  test('answers 503 with the CSP when the app list cannot be read', async () => {
    const logError = jest.spyOn(logger, 'error').mockImplementation(() => undefined)
    queryRaw.mockRejectedValue(new Error('db down'))

    const res = await GET(new Request('http://web/apps/hello/'), { params: { id: 'hello' } })

    expect(res.status).toBe(503)
    expect(res.headers.get('content-security-policy')).toMatch(/script-src 'none'/)
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await res.text()).toMatch(/tạm thời/)
    expect(logError).toHaveBeenCalledWith('Mini-app lookup failed', expect.objectContaining({ app: 'hello' }))
    expect(global.fetch).not.toHaveBeenCalled()
    logError.mockRestore()
  })
})
