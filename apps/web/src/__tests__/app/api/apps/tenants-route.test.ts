/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { prisma } from '@/infrastructure/db/prisma.client'
import { GET } from '@/app/api/apps/[id]/tenants/route'
import { logger } from '@/lib/logger'

jest.mock('@/infrastructure/db/prisma.client', () => ({ prisma: { $queryRaw: jest.fn() } }))

const queryRaw = prisma.$queryRaw as unknown as jest.Mock
const appRow = { id: 'tea-tour', name: 'Tour', version: '1.0.0', menu: [], public_prefixes: ['/public/'], feed: null }
const call = (id = 'tea-tour', ip = '203.0.113.7') =>
  GET(new Request(`http://web/api/apps/${id}/tenants`, { headers: { 'x-forwarded-for': ip } }), { params: { id } })

beforeEach(() => queryRaw.mockReset())

describe('GET /api/apps/[id]/tenants', () => {
  test('lists the cooperatives that enabled the app', async () => {
    const items = [{ htx_code: 'TC', name: 'HTX Tân Cương', address: 'Thái Nguyên' }]
    queryRaw.mockResolvedValueOnce([appRow]).mockResolvedValueOnce(items)

    const res = await call()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ items })
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(queryRaw.mock.calls[1].slice(1)).toEqual(['tea-tour'])
  })

  test('an app enabled for every cooperative returns every cooperative', async () => {
    // The SQL expresses "*" itself; the route returns what the repository returns.
    const items = [
      { htx_code: 'LB', name: 'HTX A', address: 'x' },
      { htx_code: 'TC', name: 'HTX B', address: 'y' },
    ]
    queryRaw.mockResolvedValueOnce([appRow]).mockResolvedValueOnce(items)

    expect((await (await call()).json()).items).toEqual(items)
    expect(queryRaw.mock.calls[1][0].join('?')).toContain("e.htx_code = '*'")
  })

  test('app without public routes is 404 and its cooperatives are not read', async () => {
    queryRaw.mockResolvedValueOnce([{ ...appRow, public_prefixes: [] }])

    const res = await call()

    expect(res.status).toBe(404)
    expect(queryRaw).toHaveBeenCalledTimes(1)
  })

  test('unknown app is 404', async () => {
    queryRaw.mockResolvedValueOnce([])

    expect((await call('nope')).status).toBe(404)
    expect(queryRaw).toHaveBeenCalledTimes(1)
  })

  test('a lookup failure answers 503 and is logged', async () => {
    const logError = jest.spyOn(logger, 'error').mockImplementation(() => undefined)
    queryRaw.mockRejectedValueOnce(new Error('db down'))

    expect((await call()).status).toBe(503)
    expect(logError).toHaveBeenCalled()
    logError.mockRestore()
  })

  test('is limited by the public read limiter per client IP', async () => {
    process.env.DXOS_APP_PUBLIC_READ_LIMIT = '2'
    let limitedGet: typeof GET | undefined
    jest.isolateModules(() => {
      limitedGet = require('@/app/api/apps/[id]/tenants/route').GET
    })
    delete process.env.DXOS_APP_PUBLIC_READ_LIMIT
    queryRaw.mockResolvedValue([])
    const get = (ip: string) =>
      limitedGet!(new Request('http://web/api/apps/tea-tour/tenants', { headers: { 'x-forwarded-for': ip } }), { params: { id: 'tea-tour' } })

    expect([(await get('198.51.100.1')).status, (await get('198.51.100.1')).status]).toEqual([404, 404])
    const third = await get('198.51.100.1')
    expect(third.status).toBe(429)
    expect((await get('198.51.100.2')).status).toBe(404)
  })
})
