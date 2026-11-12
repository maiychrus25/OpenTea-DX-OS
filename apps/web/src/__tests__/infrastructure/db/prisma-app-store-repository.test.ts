/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { Prisma } from '@prisma/client'
import { AppStoreError } from '@/domain/entities/app-store'
import { prisma } from '@/infrastructure/db/prisma.client'
import { PrismaAppStoreRepository } from '@/infrastructure/db/repositories/prisma-app-store-repository'

jest.mock('@/infrastructure/db/prisma.client', () => ({ prisma: { $queryRaw: jest.fn(), $executeRaw: jest.fn() } }))

const queryRaw = prisma.$queryRaw as unknown as jest.Mock
const executeRaw = prisma.$executeRaw as unknown as jest.Mock
const sql = (call: unknown[]) => (call[0] as string[]).join('?')

beforeEach(() => {
  queryRaw.mockReset()
  executeRaw.mockReset()
})

describe('PrismaAppStoreRepository', () => {
  test('snapshot reads the four tables with the HTX bound and maps the rows', async () => {
    queryRaw
      .mockResolvedValueOnce([
        { id: 'hello', name: 'Xin chào', version: '0.1.0', description: 'd', license: 'MIT', publisher: 'P', roles: ['manager'], has_public: true },
      ])
      .mockResolvedValueOnce([{ app_id: 'hello', action: 'ENABLE' }])
      .mockResolvedValueOnce([{ app_id: 'hello', htx_code: '*' }])
      .mockResolvedValueOnce([{ app_id: 'hello', status: 'FAILED', error: 'x' }])

    const snap = await new PrismaAppStoreRepository().snapshot("T'C")

    expect(snap).toEqual({
      apps: [{ id: 'hello', name: 'Xin chào', version: '0.1.0', description: 'd', license: 'MIT', publisher: 'P', roles: ['manager'], hasPublic: true }],
      open: [{ appId: 'hello', action: 'ENABLE' }],
      enablements: [{ appId: 'hello', htxCode: '*' }],
      latest: [{ appId: 'hello', status: 'FAILED', error: 'x' }],
    })
    expect(queryRaw.mock.calls.map(call => Array.isArray((call[0] as { raw?: string[] }).raw))).toEqual([true, true, true, true])
    const tables = queryRaw.mock.calls.map(sql).join('\n')
    for (const table of ['app_catalog', 'app_requests', 'app_enablements']) expect(tables).toContain(`platform.${table}`)
    expect(tables).not.toContain("T'C")
    expect(queryRaw.mock.calls.slice(1).map(call => call.slice(1))).toEqual([["T'C"], ["T'C"], ["T'C"]])
  })

  test('workerAlive is true only when a recent heartbeat exists', async () => {
    queryRaw.mockResolvedValueOnce([{ alive: true }]).mockResolvedValueOnce([{ alive: false }])
    const repo = new PrismaAppStoreRepository()
    await expect(repo.workerAlive()).resolves.toBe(true)
    await expect(repo.workerAlive()).resolves.toBe(false)
    expect(sql(queryRaw.mock.calls[0])).toContain("interval '30 seconds'")
  })

  test('createRequest binds every value', async () => {
    executeRaw.mockResolvedValue(1)
    await new PrismaAppStoreRepository().createRequest('hello', 'TC', 'ENABLE', 'u1')
    const [strings, ...values] = executeRaw.mock.calls[0]
    expect(Array.isArray(strings.raw)).toBe(true)
    expect(values).toEqual(['hello', 'TC', 'ENABLE', 'u1'])
  })

  test.each([
    ['P2010 with the Postgres unique code', 'P2010', { code: '23505' }],
    ['P2002', 'P2002', undefined],
  ])('createRequest maps a unique violation (%s) to REQUEST_OPEN', async (_name, code, meta) => {
    executeRaw.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code, clientVersion: 'x', meta }))
    const error = await new PrismaAppStoreRepository().createRequest('hello', 'TC', 'ENABLE', 'u1').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AppStoreError)
    expect((error as AppStoreError).code).toBe('REQUEST_OPEN')
  })

  test('createRequest rethrows any other error', async () => {
    executeRaw.mockRejectedValue(new Error('db down'))
    await expect(new PrismaAppStoreRepository().createRequest('hello', 'TC', 'ENABLE', 'u1')).rejects.toThrow('db down')
  })
})
