/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { prisma } from '@/infrastructure/db/prisma.client'
import { PrismaMembershipRepository, resetMembershipSyncCache } from '@/infrastructure/db/auth/PrismaMembershipRepository'
import { logger } from '@/lib/logger'

jest.mock('@/infrastructure/db/prisma.client', () => ({ prisma: { htxMembership: { upsert: jest.fn() } } }))

const upsert = prisma.htxMembership.upsert as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  resetMembershipSyncCache()
})

describe('PrismaMembershipRepository.sync', () => {
  test('writes the roles of the token, sorted, once per process', async () => {
    const repo = new PrismaMembershipRepository()
    await repo.sync('u1', 'htx1', ['farmer', 'manager'])
    await repo.sync('u1', 'htx1', ['manager', 'farmer'])
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert).toHaveBeenCalledWith({
      where: { keycloak_user_id_htx_profile_id: { keycloak_user_id: 'u1', htx_profile_id: 'htx1' } },
      create: { keycloak_user_id: 'u1', htx_profile_id: 'htx1', roles: ['farmer', 'manager'] },
      update: { roles: ['farmer', 'manager'] },
    })
  })

  test('writes again when the roles of the token changed (both directions)', async () => {
    const repo = new PrismaMembershipRepository()
    await repo.sync('u1', 'htx1', ['farmer', 'officer'])
    await repo.sync('u1', 'htx1', ['farmer'])
    expect(upsert).toHaveBeenCalledTimes(2)
    expect(upsert.mock.calls[1][0].update.roles).toEqual(['farmer'])
  })

  test('never records platform_admin, which belongs to no HTX', async () => {
    const repo = new PrismaMembershipRepository()
    await repo.sync('u1', 'htx1', ['platform_admin'])
    expect(upsert).not.toHaveBeenCalled()
    await repo.sync('u1', 'htx1', ['manager', 'platform_admin'])
    expect(upsert.mock.calls[0][0].update.roles).toEqual(['manager'])
  })

  test('logs a database error and does not throw, and retries on the next call', async () => {
    const logged = jest.spyOn(logger, 'error').mockImplementation(() => undefined)
    upsert.mockRejectedValueOnce(new Error('db down'))
    const repo = new PrismaMembershipRepository()
    await expect(repo.sync('u1', 'htx1', ['farmer'])).resolves.toBeUndefined()
    expect(logged).toHaveBeenCalled()
    await repo.sync('u1', 'htx1', ['farmer'])
    expect(upsert).toHaveBeenCalledTimes(2)
    logged.mockRestore()
  })
})
