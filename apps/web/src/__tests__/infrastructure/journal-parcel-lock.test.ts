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
