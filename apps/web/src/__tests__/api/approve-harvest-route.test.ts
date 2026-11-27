/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { POST } from '@/app/api/parcels/[id]/approve-harvest/route'

const execute = jest.fn()
let role = 'officer'

jest.mock('@/lib/api/tenant', () => ({
  requireTenant: jest.fn(async () => ({ userId: 'u1', role, htxCode: 'TC', htxProfileId: 'htx-tc' })),
}))
jest.mock('@/lib/api/tenant-guard', () => ({ TenantGuard: jest.fn(() => ({ parcel: jest.fn() })) }))
jest.mock('@/application/farm/approve-harvest-usecase', () => ({ ApproveHarvestUseCase: jest.fn(() => ({ execute })) }))
jest.mock('@/infrastructure/db/farm/PrismaParcelRepository', () => ({ PrismaParcelRepository: jest.fn() }))
jest.mock('@/infrastructure/db/journal/PrismaJournalRepository', () => ({ PrismaJournalRepository: jest.fn() }))
jest.mock('@/infrastructure/db/notification/prisma-notification-repository', () => ({ PrismaNotificationRepository: jest.fn() }))

const call = () => POST(new Request('http://x/api/parcels/p1/approve-harvest', { method: 'POST' }), { params: { id: 'p1' } })

describe('POST /api/parcels/[id]/approve-harvest', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    role = 'officer'
    execute.mockResolvedValue({ id: 'p1', status: 'HARVEST_APPROVED' })
  })

  it('answers the envelope for an officer and a manager', async () => {
    for (role of ['officer', 'manager']) {
      const res = await call()
      expect(res.status).toBe(200)
      await expect(res.json()).resolves.toEqual({ data: { parcel: { id: 'p1', status: 'HARVEST_APPROVED' } } })
    }
  })

  it('refuses a farmer with 403 before touching the use case', async () => {
    role = 'farmer'
    const res = await call()
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('FORBIDDEN')
    expect(execute).not.toHaveBeenCalled()
  })
})
