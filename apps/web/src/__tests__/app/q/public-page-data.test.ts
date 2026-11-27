// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { loadPublicPageData } from '@/app/q/[lot_code]/public-page-data'
import { prisma } from '@/infrastructure/db/prisma.client'

const trace = {
  lot_code: 'TC-CHE-20261128-001', commodity: 'Chè', quality_grade: null, status: 'QR_EXPORTED', packaging_date: null, packaging_spec: null,
  total_weight_kg: 40, qr_image_url: null, created_at: new Date('2026-11-28T00:00:00Z'), is_harvest_safe: true, latest_safe_harvest_date: null,
  parcels: [{ parcel_code: 'T-01', area_ha: 1.2, household_name: 'Hoàng Văn Tâm', crop_type: 'Chè', status: 'TENDING' }],
  journal_summaries: [{ entry_date: new Date('2026-11-10T00:00:00Z'), activity_type: 'SPRAYING', performed_by: 'Hoàng Văn Tâm', approved_by_id: null, activity_detail: '', product_name: null, dosage: null, withdrawal_days: 7 }],
  certificate_keys: [], htx_name: 'HTX Chè Tân Cương',
  batches: [{ batch_code: 'TC-MS-20261128-01', processed_on: '2026-11-28', master_name: 'Nguyễn Văn Sao', fresh_kg: 190, dry_kg: 38, recovery_ratio: 5, out_of_band: false, grade: 'DINH', kg_in_lot: 38, ticket_count: 2, parcel_codes: ['T-01'] }],
}

jest.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }))
jest.mock('@/infrastructure/db/prisma.client', () => ({ prisma: { lot: { findUnique: jest.fn() } } }))
jest.mock('@/infrastructure/db/repositories/prisma-lot-trace-repository', () => ({ PrismaLotTraceRepository: jest.fn() }))
jest.mock('@/infrastructure/db/repositories/prisma-lot-verification-repository', () => ({ PrismaLotVerificationRepository: jest.fn() }))
jest.mock('@/application/lot/lot-ai-verification', () => ({ LotAiVerification: jest.fn().mockImplementation(() => ({ execute: async () => [] })) }))
jest.mock('@/application/useCases/get-lot-trace-data-usecase', () => ({
  GetLotTraceDataUseCase: jest.fn().mockImplementation(() => ({ execute: async () => trace })),
}))

const setting = (value: boolean | null) =>
  (prisma.lot.findUnique as jest.Mock).mockResolvedValue(value === null ? null : { htx_profile: { public_show_names: value } })

test('names stay hidden when the cooperative has not allowed them', async () => {
  setting(false)
  const data = await loadPublicPageData(trace.lot_code)
  expect(data!.trace.parcels[0].household_name).toBe('')
  expect(data!.trace.journal_summaries[0].performed_by).toBe('')
  expect(data!.trace.batches![0].master_name).toBeNull()
  expect(prisma.lot.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { lot_code: trace.lot_code } }))
})

test('names show when the cooperative allows them', async () => {
  setting(true)
  const data = await loadPublicPageData(trace.lot_code)
  expect(data!.trace.parcels[0].household_name).toBe('Hoàng Văn Tâm')
  expect(data!.trace.batches![0].master_name).toBe('Nguyễn Văn Sao')
})

test('an unknown setting hides names', async () => {
  setting(null)
  const data = await loadPublicPageData(trace.lot_code)
  expect(data!.trace.parcels[0].household_name).toBe('')
})
