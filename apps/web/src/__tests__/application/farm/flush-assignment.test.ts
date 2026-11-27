/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { cycleForEntryDate, cycleForLotLine, ensureOpenCycle } from '@/infrastructure/db/farm/PrismaCropCycleRepository'

type Cycle = { id: string; parcel_id: string; sowed_at: Date | null; harvested_at: Date | null; created_at: Date; season?: string }
const day = (iso: string) => new Date(`${iso}T00:00:00Z`)

function fakeTx(initial: Cycle[]) {
  const cycles = [...initial]
  return {
    cycles,
    $queryRaw: jest.fn(async () => []),
    parcelCropCycle: {
      findMany: jest.fn(async ({ where }: { where: { parcel_id: string } }) => cycles.filter((c) => c.parcel_id === where.parcel_id)),
      create: jest.fn(async ({ data }: { data: Omit<Cycle, 'id' | 'harvested_at'> }) => {
        const row = { id: `new-${cycles.length}`, harvested_at: null, ...data } as Cycle
        cycles.push(row)
        return row
      }),
    },
  }
}

const closed: Cycle = { id: 'c1', parcel_id: 'p1', sowed_at: day('2026-10-01'), harvested_at: day('2026-11-10'), created_at: day('2026-10-01') }
const open: Cycle = { id: 'c2', parcel_id: 'p1', sowed_at: day('2026-11-12'), harvested_at: null, created_at: day('2026-11-12') }

describe('flush assignment', () => {
  it('entry on the harvest day stays in the closed flush', async () => {
    const tx = fakeTx([closed])
    expect(await cycleForEntryDate(tx as never, 'p1', day('2026-11-10'))).toBe('c1')
    expect(tx.parcelCropCycle.create).not.toHaveBeenCalled()
  })

  it('care after the harvest opens the next flush once', async () => {
    const tx = fakeTx([closed])
    const first = await cycleForEntryDate(tx as never, 'p1', day('2026-11-12'), day('2026-11-12'))
    const second = await cycleForEntryDate(tx as never, 'p1', day('2026-11-13'), day('2026-11-13'))
    expect(first).not.toBe('c1')
    expect(second).toBe(first)
    expect(tx.cycles).toHaveLength(2)
    expect(tx.cycles[1].season).toBe('Lứa 2/2026')
  })

  it('a backdated entry before the harvest belongs to the closed flush', async () => {
    const tx = fakeTx([closed, open])
    expect(await cycleForEntryDate(tx as never, 'p1', day('2026-11-05'))).toBe('c1')
    expect(await cycleForEntryDate(tx as never, 'p1', day('2026-11-20'))).toBe('c2')
  })

  it('an entry before every flush started uses the earliest flush', async () => {
    expect(await cycleForEntryDate(fakeTx([closed]) as never, 'p1', day('2026-09-01'))).toBe('c1')
  })

  it('a parcel without flushes gets none', async () => {
    const tx = fakeTx([])
    expect(await cycleForEntryDate(tx as never, 'p1', day('2026-11-12'))).toBeNull()
    expect(await ensureOpenCycle(tx as never, 'p1', day('2026-11-12'))).toBeNull()
  })

  it('ensureOpenCycle returns the open flush without creating one', async () => {
    const tx = fakeTx([closed, open])
    expect(await ensureOpenCycle(tx as never, 'p1', day('2026-11-20'))).toBe('c2')
    expect(tx.parcelCropCycle.create).not.toHaveBeenCalled()
  })

  it('a lot line takes the flush harvested on or before the lot date, else the open one', async () => {
    const tx = fakeTx([closed, open])
    expect(await cycleForLotLine(tx as never, 'p1', day('2026-11-10'))).toBe('c1')
    expect(await cycleForLotLine(tx as never, 'p1', day('2026-11-05'))).toBe('c2')
  })
})

describe('PrismaJournalRepository submit', () => {
  it('submitting a draft assigns the flush by entry_date', async () => {
    const tx = fakeTx([closed, open])
    const entry = { parcel_id: 'p1', entry_date: day('2026-11-10'), activity_type: 'SPRAYING', status: 'DRAFT', submitted_role: 'FARMER', performed_by: 'U', submitted_by_id: 'u', parcel: {}, activities: [{ id: 'a1', withdrawal_days: 14, safe_harvest_date: null }] }
    const updated: Record<string, unknown>[] = []
    const txClient = Object.assign(tx, {
      journalActivity: { deleteMany: jest.fn(), update: jest.fn() },
      journalEntry: {
        findUnique: jest.fn(async () => entry),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          updated.push(data)
          return { ...entry, ...data }
        }),
      },
      parcel: { findUnique: jest.fn(async () => ({ parcel_code: 'A', household_id: 'h', household: { htx_profile_id: 'x' } })) },
      notification: { create: jest.fn(async () => ({ recipient_id: null })) },
    })
    jest.doMock('@/infrastructure/db/prisma.client', () => ({ prisma: { $transaction: (fn: (t: unknown) => unknown) => fn(txClient) } }))
    const { PrismaJournalRepository } = await import('@/infrastructure/db/journal/PrismaJournalRepository')

    await new PrismaJournalRepository().update('e1', { observation: 'Đã phun' }, true)
    expect(updated[0].cycle_id).toBe('c1') // dated on the harvest day: the closed flush

    entry.entry_date = day('2026-11-14')
    await new PrismaJournalRepository().update('e1', {}, true)
    expect(updated[1].cycle_id).toBe('c2')
    expect(updated[1].status).toBe('PENDING_APPROVAL')
    // the withdrawal restarts from the confirmed spray date
    expect(txClient.journalActivity.update).toHaveBeenLastCalledWith({ where: { id: 'a1' }, data: { safe_harvest_date: day('2026-11-28') } })
  })
})
