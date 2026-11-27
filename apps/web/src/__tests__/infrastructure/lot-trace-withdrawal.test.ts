// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { prisma } from '@/infrastructure/db/prisma.client'
import { PrismaLotTraceRepository } from '@/infrastructure/db/repositories/prisma-lot-trace-repository'

jest.mock('@/infrastructure/db/prisma.client', () => ({ prisma: { lot: { findUnique: jest.fn() } } }))

test('the lot trace leaves drafts and rejected entries out of the withdrawal check', async () => {
  const findUnique = prisma.lot.findUnique as jest.Mock
  findUnique.mockResolvedValue(null)
  await new PrismaLotTraceRepository().getLotByCode('TC-1')
  const entries = findUnique.mock.calls[0][0].include.lot_parcels.include.parcel.include.journal_entries
  expect(entries.where.status).toEqual({ notIn: ['DRAFT', 'REJECTED'] })
})

describe('lot safety is judged against the lot harvest date', () => {
  const DAY = 24 * 60 * 60 * 1000
  const at = (days: number) => new Date(Date.now() + days * DAY)
  const spray = (cycle_id: string, entryDays: number, safeDays: number) => ({
    status: 'APPROVED', cycle_id, entry_date: at(entryDays), activity_type: 'SPRAYING', performed_by: 'U', approved_by_id: null,
    activities: [{ activity_detail: 'x', product_name: 'P', dosage: '1', withdrawal_days: 7, safe_harvest_date: at(safeDays) }],
  })
  const trace = async (entries: unknown[]) => {
    ;(prisma.lot.findUnique as jest.Mock).mockResolvedValue({
      lot_code: 'TC-1', commodity: 'Chè', quality_grade: null, status: 'READY', harvest_date: at(-10), packaging_type: null,
      actual_weight_kg: null, estimated_weight_kg: null, qr_image_url: null, created_at: new Date(), certificate_keys: [], htx_profile: null,
      public_page_data: null,
      lot_parcels: [{ cycle_id: 'old', parcel: { parcel_code: 'A1', area_ha: 1, crop_type: 'Chè', status: 'TENDING', household: { name: 'H' }, journal_entries: entries } }],
    })
    return new PrismaLotTraceRepository().getLotByCode('TC-1')
  }

  test('a spray before the harvest date whose safe date is after it makes the lot unsafe even after that safe date has passed', async () => {
    // harvest at -10, sprayed at -12 with a safe date at -5: already past, but the lot was picked inside the withdrawal
    const data = await trace([spray('old', -12, -5)])
    expect(data?.is_harvest_safe).toBe(false)
    expect(data?.latest_safe_harvest_date).toEqual(at(-5))
  })

  test('a spray after the harvest date of the next flush does not make the lot unsafe', async () => {
    const data = await trace([spray('next', -3, 4)])
    expect(data?.is_harvest_safe).toBe(true)
  })

  test('a spray whose safe date is before the harvest date is safe', async () => {
    expect((await trace([spray('old', -20, -12)]))?.is_harvest_safe).toBe(true)
  })
})
