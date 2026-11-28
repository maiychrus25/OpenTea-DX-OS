/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { auth } from '@/auth'
import * as journal from '@/app/api/journal/route'

const repo = { create: jest.fn(), findByClientId: jest.fn() }

jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/auth/core-token', () => ({ getCoreToken: jest.fn() }))
jest.mock('@/lib/api/tenant', () => ({
  requireTenant: jest.fn().mockResolvedValue({ userId: 'u1', role: 'farmer', htxCode: 'TC', htxProfileId: 'htx-tc' }),
}))
jest.mock('@/lib/api/tenant-guard', () => ({ TenantGuard: jest.fn(() => ({ parcel: jest.fn() })) }))
jest.mock('@/infrastructure/db/journal/PrismaJournalRepository', () => ({ PrismaJournalRepository: jest.fn(() => repo) }))
jest.mock('@/infrastructure/db/farm/PrismaParcelRepository', () => ({
  PrismaParcelRepository: jest.fn(() => ({ findById: jest.fn().mockResolvedValue({ id: 'p1', household_id: 'hh-1' }) })),
}))
jest.mock('@/infrastructure/db/pesticide/PrismaPesticideRepository', () => ({
  PrismaPesticideRepository: jest.fn(() => ({
    matchByTradeName: jest.fn().mockResolvedValue(null),
    floorFor: jest.fn().mockResolvedValue(null),
  })),
}))
jest.mock('@/application/farm/GetFarmerHouseholdUseCase', () => ({
  GetFarmerHouseholdUseCase: jest.fn(() => ({ execute: jest.fn().mockResolvedValue({ id: 'hh-1' }) })),
}))

const CLIENT_ID = '3f2b8c1e-5a47-4d0e-9b62-1c7a9e4d5f10'
const post = (body: Record<string, unknown>) =>
  journal.POST(
    new Request('http://localhost/api/journal', {
      method: 'POST',
      body: JSON.stringify({ parcel_id: 'p1', entry_date: '2026-11-28', activities: [{ activity_type: 'IRRIGATION' }], ...body }),
    }),
    {}
  )

beforeEach(() => {
  jest.clearAllMocks()
  ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'u1', role: 'farmer', htxCode: 'TC', name: 'U' } })
})

describe('POST /api/journal with client_id', () => {
  it('duplicate client_id from the same sender returns the first entry', async () => {
    repo.findByClientId.mockResolvedValue({ id: 'first' })

    const res = await post({ client_id: CLIENT_ID })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: { id: 'first' } })
    expect(repo.findByClientId).toHaveBeenCalledWith('u1', CLIENT_ID)
    expect(repo.create).not.toHaveBeenCalled()
  })

  it('creates the entry the first time and stores the client_id', async () => {
    repo.findByClientId.mockResolvedValue(null)
    repo.create.mockResolvedValue({ id: 'new' })

    const res = await post({ client_id: CLIENT_ID })

    expect(res.status).toBe(201)
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ client_id: CLIENT_ID, submitted_by_id: 'u1' }))
  })

  it('works without a client_id', async () => {
    repo.create.mockResolvedValue({ id: 'new' })
    const res = await post({})
    expect(res.status).toBe(201)
    expect(repo.findByClientId).not.toHaveBeenCalled()
  })

  it('rejects a client_id that is not a uuid', async () => {
    expect((await post({ client_id: 'abc' })).status).toBe(400)
  })

  it('answers a spraying below the floor with 422 WITHDRAWAL_BELOW_FLOOR', async () => {
    const res = await post({ activities: [{ activity_type: 'SPRAYING', product_name: 'Thuốc lạ', withdrawal_days: 3 }] })
    expect(res.status).toBe(422)
    await expect(res.json()).resolves.toEqual({
      error: { code: 'WITHDRAWAL_BELOW_FLOOR', message: 'Thời gian cách ly không được thấp hơn 14 ngày (mức sàn của thuốc này).' },
    })
    expect(repo.create).not.toHaveBeenCalled()
  })
})

describe('fresh_leaf_kg', () => {
  it('harvest entry stores fresh_leaf_kg', async () => {
    repo.create.mockResolvedValue({ id: 'new' })
    const res = await post({ activities: [{ activity_type: 'HARVEST', fresh_leaf_kg: 120.5 }] })
    expect(res.status).toBe(201)
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ activities: [expect.objectContaining({ activity_type: 'HARVEST', fresh_leaf_kg: 120.5 })] })
    )
  })

  it('fresh_leaf_kg on a spraying is rejected', async () => {
    const res = await post({ activities: [{ activity_type: 'SPRAYING', fresh_leaf_kg: 10 }] })
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('VALIDATION_ERROR')
    expect(repo.create).not.toHaveBeenCalled()
  })

  it.each([0, -1, 100001])('rejects %s kg', async (kg) => {
    expect((await post({ activities: [{ activity_type: 'HARVEST', fresh_leaf_kg: kg }] })).status).toBe(400)
  })
})
