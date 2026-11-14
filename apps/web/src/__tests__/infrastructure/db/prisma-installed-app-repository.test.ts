/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { prisma } from '@/infrastructure/db/prisma.client'
import { PrismaInstalledAppRepository } from '@/infrastructure/db/repositories/prisma-installed-app-repository'

jest.mock('@/infrastructure/db/prisma.client', () => ({ prisma: { $queryRaw: jest.fn() } }))

const queryRaw = prisma.$queryRaw as unknown as jest.Mock
const menu = [{ label: 'Tour', path: '/', roles: ['manager'] }]
const row = { id: 'tea-tour', name: 'Tour', version: '1.0.0', menu, public_prefixes: ['/public/'], feed: '/feed' }

beforeEach(() => queryRaw.mockReset())

describe('PrismaInstalledAppRepository', () => {
  test('find passes the id as a bound value and maps the row', async () => {
    queryRaw.mockResolvedValue([row])

    const app = await new PrismaInstalledAppRepository().find("x' OR '1'='1")

    expect(app).toEqual({ id: 'tea-tour', name: 'Tour', version: '1.0.0', menu, publicPrefixes: ['/public/'], feed: '/feed' })
    const [strings, ...values] = queryRaw.mock.calls[0]
    // A tagged template: the SQL text never holds the id.
    expect(Array.isArray(strings.raw)).toBe(true)
    expect(strings.join('?')).toContain('platform.installed_apps')
    expect(strings.join('?')).not.toContain("OR '1'")
    expect(values).toEqual(["x' OR '1'='1"])
  })

  test('a manifest without feed maps to null and the query reads it from the manifest', async () => {
    queryRaw.mockResolvedValue([{ ...row, feed: null }])
    const repo = new PrismaInstalledAppRepository()
    expect((await repo.find('tea-tour'))?.feed).toBeNull()
    expect((await repo.list('TC'))[0].feed).toBeNull()
    for (const [strings] of queryRaw.mock.calls) expect(strings.join('?')).toContain("manifest ->> 'feed'")
  })

  test('find is null when no row matches', async () => {
    queryRaw.mockResolvedValue([])
    await expect(new PrismaInstalledAppRepository().find('nope')).resolves.toBeNull()
  })

  test('list queries every time, with no cache', async () => {
    queryRaw.mockResolvedValueOnce([row]).mockResolvedValueOnce([])
    const repo = new PrismaInstalledAppRepository()

    expect(await repo.list('TC')).toHaveLength(1)
    expect(await repo.list('TC')).toEqual([])
    expect(queryRaw).toHaveBeenCalledTimes(2)
  })

  test('list binds the HTX and keeps apps enabled for it or for *', async () => {
    queryRaw.mockResolvedValue([row])
    await new PrismaInstalledAppRepository().list("T'C")
    const [strings, ...values] = queryRaw.mock.calls[0]
    const text = strings.join('?')
    expect(text).toContain('platform.app_enablements')
    expect(text).toMatch(/htx_code = \?::text OR e\.htx_code = '\*'/)
    expect(text).not.toContain("T'C")
    expect(values).toEqual(["T'C"])
  })

  test('list(null) binds null, so only the * enablement can match', async () => {
    queryRaw.mockResolvedValue([])
    await new PrismaInstalledAppRepository().list(null)
    expect(queryRaw.mock.calls[0].slice(1)).toEqual([null])
  })

  test('isEnabledFor binds both values', async () => {
    queryRaw.mockResolvedValueOnce([{ enabled: true }]).mockResolvedValueOnce([{ enabled: false }])
    const repo = new PrismaInstalledAppRepository()
    await expect(repo.isEnabledFor('hello', 'TC')).resolves.toBe(true)
    await expect(repo.isEnabledFor('hello', 'LB')).resolves.toBe(false)
    const [strings, ...values] = queryRaw.mock.calls[0]
    expect(strings.join('?')).toContain('platform.app_enablements')
    expect(strings.join('?')).toContain("'*'")
    expect(values).toEqual(['hello', 'TC'])
  })
})
