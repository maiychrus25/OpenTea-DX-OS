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
        { id: 'hello', name: 'Xin chào', version: '0.1.0', description: 'd', license: 'MIT', publisher: 'P', roles: ['manager'], has_public: true,
          menu: [{ label: 'M', path: '/', roles: ['manager'] }], store: { icon: 'leaf' }, requires_core: '>=1.10.0', has_database: true, installed_on_server: true },
      ])
      .mockResolvedValueOnce([{ app_id: 'hello', action: 'ENABLE', phase: 'build' }])
      .mockResolvedValueOnce([{ app_id: 'hello', htx_code: '*' }])
      .mockResolvedValueOnce([{ app_id: 'hello', status: 'FAILED', error: 'x', phase: null }])

    const snap = await new PrismaAppStoreRepository().snapshot("T'C")

    expect(snap).toEqual({
      apps: [{ id: 'hello', name: 'Xin chào', version: '0.1.0', description: 'd', license: 'MIT', publisher: 'P', roles: ['manager'], hasPublic: true,
        menu: [{ label: 'M', path: '/', roles: ['manager'] }], store: { icon: 'leaf' }, requiresCore: '>=1.10.0', hasDatabase: true, installedOnServer: true }],
      open: [{ appId: 'hello', action: 'ENABLE', phase: 'build' }],
      enablements: [{ appId: 'hello', htxCode: '*' }],
      latest: [{ appId: 'hello', status: 'FAILED', error: 'x', phase: null }],
    })
    expect(queryRaw.mock.calls.map(call => Array.isArray((call[0] as { raw?: string[] }).raw))).toEqual([true, true, true, true])
    const tables = queryRaw.mock.calls.map(sql).join('\n')
    for (const table of ['app_catalog', 'app_requests', 'app_enablements', 'installed_apps']) expect(tables).toContain(`platform.${table}`)
    expect(tables).not.toContain("T'C")
    expect(queryRaw.mock.calls.slice(1).map(call => call.slice(1))).toEqual([["T'C"], ["T'C"], ["T'C"]])
  })

  test('workerAlive is true for a recent heartbeat or a request running for under 15 minutes', async () => {
    queryRaw.mockResolvedValueOnce([{ alive: true }]).mockResolvedValueOnce([{ alive: false }])
    const repo = new PrismaAppStoreRepository()
    await expect(repo.workerAlive()).resolves.toBe(true)
    await expect(repo.workerAlive()).resolves.toBe(false)
    expect(queryRaw).toHaveBeenCalledTimes(2)
    const text = sql(queryRaw.mock.calls[0])
    expect(text).toContain("seen_at > now() - interval '30 seconds'")
    expect(text).toContain("status = 'RUNNING' AND started_at > now() - interval '15 minutes'")
  })

  test('createRequest binds every value', async () => {
    executeRaw.mockResolvedValue(1)
    await new PrismaAppStoreRepository().createRequest('hello', 'TC', 'ENABLE', 'u1', 'An')
    const [strings, ...values] = executeRaw.mock.calls[0]
    expect(Array.isArray(strings.raw)).toBe(true)
    expect(values).toEqual(['hello', 'TC', 'ENABLE', 'u1', 'An'])
  })

  test.each([
    ['P2010 with the Postgres unique code', 'P2010', { code: '23505' }],
    ['P2002', 'P2002', undefined],
  ])('createRequest maps a unique violation (%s) to REQUEST_OPEN', async (_name, code, meta) => {
    executeRaw.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code, clientVersion: 'x', meta }))
    const error = await new PrismaAppStoreRepository().createRequest('hello', 'TC', 'ENABLE', 'u1', 'An').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AppStoreError)
    expect((error as AppStoreError).code).toBe('REQUEST_OPEN')
  })

  test('createRequest rethrows any other error', async () => {
    executeRaw.mockRejectedValue(new Error('db down'))
    await expect(new PrismaAppStoreRepository().createRequest('hello', 'TC', 'ENABLE', 'u1', 'An')).rejects.toThrow('db down')
  })

  test('createRequest stores at most 120 characters of the name, or null', async () => {
    executeRaw.mockResolvedValue(1)
    const repo = new PrismaAppStoreRepository()
    await repo.createRequest('hello', 'TC', 'ENABLE', 'u1', 'x'.repeat(200))
    await repo.createRequest('hello', 'TC', 'ENABLE', 'u1', null)
    expect(executeRaw.mock.calls[0][5]).toBe('x'.repeat(120))
    expect(executeRaw.mock.calls[1][5]).toBeNull()
  })

  test('history binds the HTX of the caller', async () => {
    queryRaw.mockResolvedValue([
      {
        id: 'r1', app_id: 'hello', app_name: 'Xin chào', action: 'ENABLE', status: 'FAILED', requested_by_name: 'An',
        created_at: new Date('2026-11-13T01:00:00Z'), finished_at: null, error: 'x',
      },
    ])
    const entries = await new PrismaAppStoreRepository().history("T'C", null, 50)
    const call = queryRaw.mock.calls[0]
    expect(sql(call)).toContain('r.htx_code = ?')
    expect(sql(call)).not.toContain("T'C")
    expect(call.slice(1)).toEqual([null, null, "T'C", 50])
    expect(entries).toEqual([
      {
        id: 'r1', appId: 'hello', appName: 'Xin chào', action: 'ENABLE', status: 'FAILED', requestedByName: 'An',
        createdAt: '2026-11-13T01:00:00.000Z', finishedAt: null, error: 'x',
      },
    ])
  })

  test('history binds the optional app filter and the limit', async () => {
    queryRaw.mockResolvedValue([])
    await new PrismaAppStoreRepository().history('TC', 'tea-shop', 20)
    expect(queryRaw.mock.calls[0].slice(1)).toEqual(['tea-shop', 'tea-shop', 'TC', 20])
  })

  test('screenshots lists captions without bytes, and screenshot binds app and position', async () => {
    queryRaw.mockResolvedValueOnce([{ position: 1, caption: 'c' }]).mockResolvedValueOnce([{ content_type: 'image/png', bytes: Buffer.from([1, 2]) }]).mockResolvedValueOnce([])
    const repo = new PrismaAppStoreRepository()
    await expect(repo.screenshots('hello')).resolves.toEqual([{ position: 1, caption: 'c' }])
    expect(sql(queryRaw.mock.calls[0])).not.toContain('bytes')
    await expect(repo.screenshot('hello', 1)).resolves.toEqual({ contentType: 'image/png', bytes: Buffer.from([1, 2]) })
    expect(queryRaw.mock.calls[1].slice(1)).toEqual(['hello', 1])
    await expect(repo.screenshot('hello', 3)).resolves.toBeNull()
  })
})
