/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { prisma } from '@/infrastructure/db/prisma.client'
import { PrismaInstalledAppRepository } from '@/infrastructure/db/repositories/prisma-installed-app-repository'

jest.mock('@/infrastructure/db/prisma.client', () => ({ prisma: { $queryRaw: jest.fn() } }))

const queryRaw = prisma.$queryRaw as unknown as jest.Mock
const menu = [{ label: 'Tour', path: '/', roles: ['manager'] }]
const row = { id: 'tea-tour', name: 'Tour', version: '1.0.0', menu, public_prefixes: ['/public/'] }

beforeEach(() => queryRaw.mockReset())

describe('PrismaInstalledAppRepository', () => {
  test('find passes the id as a bound value and maps the row', async () => {
    queryRaw.mockResolvedValue([row])

    const app = await new PrismaInstalledAppRepository().find("x' OR '1'='1")

    expect(app).toEqual({ id: 'tea-tour', name: 'Tour', version: '1.0.0', menu, publicPrefixes: ['/public/'] })
    const [strings, ...values] = queryRaw.mock.calls[0]
    // A tagged template: the SQL text never holds the id.
    expect(Array.isArray(strings.raw)).toBe(true)
    expect(strings.join('?')).toContain('platform.installed_apps')
    expect(strings.join('?')).not.toContain("OR '1'")
    expect(values).toEqual(["x' OR '1'='1"])
  })

  test('find is null when no row matches', async () => {
    queryRaw.mockResolvedValue([])
    await expect(new PrismaInstalledAppRepository().find('nope')).resolves.toBeNull()
  })

  test('list queries every time, with no cache', async () => {
    queryRaw.mockResolvedValueOnce([row]).mockResolvedValueOnce([])
    const repo = new PrismaInstalledAppRepository()

    expect(await repo.list()).toHaveLength(1)
    expect(await repo.list()).toEqual([])
    expect(queryRaw).toHaveBeenCalledTimes(2)
  })
})
