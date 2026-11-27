/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ApproveHarvestUseCase } from '@/application/farm/approve-harvest-usecase'
import { CreateLotUseCase } from '@/application/lot/CreateLotUseCase'
import { PrismaCropCycleRepository } from '@/infrastructure/db/farm/PrismaCropCycleRepository'

const DAY = 24 * 60 * 60 * 1000
const at = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY)
const spray = (cycle_id: string | null, entryOffset: number, safeOffset: number, status = 'APPROVED') => ({
  status,
  cycle_id,
  entry_date: at(entryOffset),
  activities: [{ safe_harvest_date: at(safeOffset) }],
})

function approveWith(entries: unknown[]) {
  const parcelPort = { findById: jest.fn(async () => ({ id: 'p1', parcel_code: 'A1' })), approveHarvest: jest.fn(async () => ({ id: 'p1' })) }
  const journalPort = { findAll: jest.fn(async () => ({ entries, total: entries.length })) }
  const notifications = { broadcastHarvestApproved: jest.fn() }
  return new ApproveHarvestUseCase(parcelPort as never, journalPort as never, notifications as never)
}

describe('approve-harvest by spray dates', () => {
  it('a spray of the previous flush still inside its withdrawal blocks harvest approval of the new flush', async () => {
    await expect(approveWith([spray('old-flush', -3, 5)]).execute('p1', 'o1', 'officer')).rejects.toThrow('Chưa qua thời gian cách ly')
  })

  it('a spray whose withdrawal is over does not block', async () => {
    await expect(approveWith([spray('old-flush', -20, -1)]).execute('p1', 'o1', 'officer')).resolves.toBeDefined()
  })

  it('a draft and a rejected spray do not block, a pending one does', async () => {
    await expect(approveWith([spray(null, -1, 5, 'DRAFT'), spray(null, -1, 5, 'REJECTED')]).execute('p1', 'o1', 'officer')).resolves.toBeDefined()
    await expect(approveWith([spray(null, -1, 5, 'PENDING_APPROVAL')]).execute('p1', 'o1', 'officer')).rejects.toThrow('Chưa qua')
  })

  it('a legacy entry without a flush blocks too', async () => {
    await expect(approveWith([spray(null, -1, 5)]).execute('p1', 'o1', 'officer')).rejects.toThrow('Chưa qua')
  })
})

describe('create lot by harvest date', () => {
  const lotFor = (entries: unknown[], lineCycle: string | null) => {
    const lotPort = { cycleForLine: jest.fn(async () => lineCycle), create: jest.fn(async () => ({ id: 'l1' })) }
    const parcelPort = { findById: jest.fn(async () => ({ id: 'p1', parcel_code: 'A1', status: 'TENDING' })) }
    const journalPort = { findAll: jest.fn(async () => ({ entries })) }
    return { useCase: new CreateLotUseCase(lotPort as never, parcelPort as never, journalPort as never), lotPort }
  }
  const lot = (harvestOffset: number) => ({ commodity: 'Chè', harvest_date: at(harvestOffset), parcel_ids: ['p1'], htx_profile_id: 'h', created_by_id: 'u' })

  it('a spray after the lot harvest date does not lock that lot', async () => {
    const { useCase, lotPort } = lotFor([spray('next-flush', -1, 13)], 'old-flush')
    await useCase.execute(lot(-3))
    expect(lotPort.create).toHaveBeenCalled()
  })

  it('a spray before the lot harvest date with safe date after it locks the lot even if it belongs to another flush', async () => {
    await expect(lotFor([spray('older-flush', -10, -5)], 'old-flush').useCase.execute(lot(-3))).resolves.toBeDefined()
    await expect(lotFor([spray('older-flush', -10, 4)], 'old-flush').useCase.execute(lot(-3))).rejects.toThrow('WITHDRAWAL_NOT_PASSED')
  })

  it('a spray of the same flush with a safe date after the harvest date locks the lot', async () => {
    await expect(lotFor([spray('old-flush', -2, 10)], 'old-flush').useCase.execute(lot(-3))).rejects.toThrow('WITHDRAWAL_NOT_PASSED')
  })

  it('a legacy entry without a flush is covered by its date', async () => {
    await expect(lotFor([spray(null, -10, 4)], null).useCase.execute(lot(-3))).rejects.toThrow('WITHDRAWAL_NOT_PASSED')
    await expect(lotFor([spray(null, -1, 13)], null).useCase.execute(lot(-3))).resolves.toBeDefined()
  })
})

describe('harvest schedule per flush', () => {
  const cycle = (id: string) => ({
    id,
    sowed_at: null,
    harvested_at: null,
    season: null,
    estimated_harvest_date: new Date(),
    parcel: {
      id: 'p1',
      parcel_code: 'A1',
      status: 'TENDING',
      crop_type: 'Chè',
      area_ha: 1,
      estimated_yield_per_ha: null,
      household: { name: 'H' },
      journal_entries: [
        { cycle_id: 'c2', entry_date: new Date(), activity_type: 'SPRAYING', activities: [{ safe_harvest_date: at(5), product_name: 'X', withdrawal_days: 14 }] },
      ],
    },
  })

  it('returns the contract fields; an open flush is blocked by any spraying of the parcel', async () => {
    const prisma = { parcelCropCycle: { findMany: jest.fn(async () => [cycle('c1'), cycle('c2')]) } }
    const [first, second] = await new PrismaCropCycleRepository(prisma as never).getHarvestSchedule('h', '2026-01-01', '2026-12-31')
    expect(first).toMatchObject({ cycleId: 'c1', parcelId: 'p1', parcelStatus: 'TENDING', canApprove: false })
    expect(second).toMatchObject({ cycleId: 'c2', canApprove: false })
  })
})
