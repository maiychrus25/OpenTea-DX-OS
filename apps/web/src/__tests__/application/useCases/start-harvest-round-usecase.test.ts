// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { PrismaClient } from '@prisma/client'
import { StartHarvestRoundUseCase } from '@/application/farm/start-harvest-round.usecase'
import { PrismaCropCycleRepository } from '@/infrastructure/db/farm/PrismaCropCycleRepository'
import { DomainError } from '@/domain/errors'

type Cycle = { id: string; parcel_id: string; season: string; created_at: Date }

/** In-memory parcel and cycles; transactions run one after another, as row locks make them in Postgres. */
function fakeDb(status: string, cycles: Cycle[]) {
  const state = { status, cycles: [...cycles] }
  let queue: Promise<unknown> = Promise.resolve()
  const tx = {
    parcel: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        if (where.status !== state.status) return { count: 0 }
        state.status = data.status
        return { count: 1 }
      }),
    },
    parcelCropCycle: {
      findMany: jest.fn(async ({ where }: any) => state.cycles.filter((c) => c.parcel_id === where.parcel_id)),
      create: jest.fn(async ({ data }: any) => {
        const cycle = { id: `c${state.cycles.length + 1}`, ...data }
        state.cycles.push(cycle)
        return cycle
      }),
    },
  }
  const db = {
    $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => {
      const run = queue.then(() => fn(tx))
      queue = run.catch(() => undefined)
      return run
    }),
  }
  return { state, tx, useCase: new StartHarvestRoundUseCase(new PrismaCropCycleRepository(db as unknown as PrismaClient)) }
}

describe('StartHarvestRoundUseCase', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-11-10T03:00:00Z')))
  afterEach(() => jest.useRealTimers())

  const earlier = [
    { id: 'c1', parcel_id: 'p1', season: 'Lứa 1/2026', created_at: new Date('2026-03-01T03:00:00Z') },
    { id: 'c0', parcel_id: 'p1', season: 'Vụ 2025', created_at: new Date('2025-08-01T03:00:00Z') },
  ]

  test('on a harvested parcel creates the next round of the year and sets the parcel to TENDING', async () => {
    const { state, useCase } = fakeDb('HARVESTED', earlier)
    await expect(useCase.execute('p1', 'officer-1')).resolves.toEqual({ cycleId: 'c3', season: 'Lứa 2/2026' })
    expect(state.status).toBe('TENDING')
    expect(state.cycles).toHaveLength(3)
    expect(state.cycles[2]).toMatchObject({ parcel_id: 'p1', season: 'Lứa 2/2026' })
  })

  test.each(['TENDING', 'SOWING', 'HARVEST_APPROVED', 'DRAFT'])('refuses a parcel in %s and creates no cycle', async (status) => {
    const { state, tx, useCase } = fakeDb(status, earlier)
    await expect(useCase.execute('p1', 'officer-1')).rejects.toThrow(DomainError)
    expect(tx.parcelCropCycle.create).not.toHaveBeenCalled()
    expect(state.cycles).toHaveLength(2)
    expect(state.status).toBe(status)
  })

  test('refuses the second start and keeps one new cycle', async () => {
    const { state, useCase } = fakeDb('HARVESTED', earlier)
    await useCase.execute('p1', 'officer-1')
    await expect(useCase.execute('p1', 'officer-1')).rejects.toThrow('Chỉ bắt đầu lứa mới khi thửa đã thu hoạch')
    expect(state.cycles).toHaveLength(3)
  })

  test('two starts at the same time create one cycle', async () => {
    const { state, useCase } = fakeDb('HARVESTED', earlier)
    const results = await Promise.allSettled([useCase.execute('p1', 'officer-1'), useCase.execute('p1', 'officer-2')])
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected'])
    expect(state.cycles).toHaveLength(3)
  })
})
