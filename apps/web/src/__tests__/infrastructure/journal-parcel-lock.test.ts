/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { PrismaJournalRepository } from '@/infrastructure/db/journal/PrismaJournalRepository'

const calls: string[] = []
const lockSql: string[] = []

jest.mock('@/infrastructure/db/prisma.client', () => {
  const tx = {
    $queryRaw: jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push('lock')
      lockSql.push(strings.join('?') + ' <- ' + values.join(','))
      return []
    }),
    parcelCropCycle: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    journalEntry: { create: jest.fn(async () => { calls.push('insert'); return { id: 'j1', parcel: {}, activities: [] } }) },
    parcel: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
    notification: { create: jest.fn().mockResolvedValue({ recipient_id: null }) },
  }
  return {
    prisma: {
      weatherCache: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (run: (t: typeof tx) => unknown) => run(tx)),
    },
  }
})

describe('PrismaJournalRepository.create', () => {
  it('locks the parcel row before it writes the entry, as the weighing ticket does', async () => {
    await new PrismaJournalRepository().create({
      parcel_id: 'parcel-9',
      entry_date: new Date('2026-11-28'),
      activity_type: 'SPRAYING',
      performed_by: 'A',
      submitted_by_id: 'u1',
      submitted_role: 'OFFICER',
      activities: [{ activity_type: 'SPRAYING', product_name: 'X', withdrawal_days: 14 }],
    })
    expect(calls.slice(0, 2)).toEqual(['lock', 'insert'])
    expect(lockSql[0]).toContain('FROM parcels WHERE id = ?')
    expect(lockSql[0]).toContain('FOR UPDATE')
    expect(lockSql[0]).toContain('parcel-9')
  })
})

describe('PrismaJournalRepository.update', () => {
  const { prisma } = jest.requireMock('@/infrastructure/db/prisma.client') as { prisma: Record<string, any> }
  const entry = { id: 'j1', parcel_id: 'parcel-9', entry_date: new Date('2026-11-28'), activity_type: 'SPRAYING', status: 'DRAFT', submitted_role: 'OFFICER', activities: [], parcel: {} }

  beforeEach(() => {
    calls.length = 0
    prisma.$transaction = jest.fn(async (run: (t: unknown) => unknown) =>
      run({
        $queryRaw: jest.fn(async () => { calls.push('lock'); return [] }),
        journalEntry: {
          findUnique: jest.fn(async () => { calls.push('read'); return entry }),
          update: jest.fn(async () => { calls.push('update'); return entry }),
        },
        journalActivity: { deleteMany: jest.fn(), update: jest.fn() },
        parcelCropCycle: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
        parcel: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
        notification: { create: jest.fn().mockResolvedValue({ recipient_id: null }) },
      }),
    )
  })

  it('locks the parcel first when a draft is submitted', async () => {
    await new PrismaJournalRepository().update('j1', {}, true)
    expect(calls[0]).toBe('lock')
  })

  it.each([['activities', { activities: [{ activity_type: 'SPRAYING' }] }], ['entry_date', { entry_date: new Date('2026-11-29') }]])('locks the parcel first when %s change', async (_n, data) => {
    await new PrismaJournalRepository().update('j1', data as never)
    expect(calls[0]).toBe('lock')
  })

  it('takes no lock for a notes-only edit of a draft', async () => {
    await new PrismaJournalRepository().update('j1', { observation: 'ghi chú' })
    expect(calls).not.toContain('lock')
    expect(calls).toContain('update')
  })
})
