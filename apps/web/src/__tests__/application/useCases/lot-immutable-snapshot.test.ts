// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

/**
 * Story 9-1 — Immutable Snapshot Integration Tests
 *
 * Verifies that:
 *   1. GetLotTraceDataUseCase delegates to repo and returns data unchanged.
 *   2. When repo returns a snapshot (QR_EXPORTED), use case passes it through unmodified.
 *   3. computeSafeHarvestDate utility produces correct safe dates.
 *   4. Snapshot returned for QR_EXPORTED lot is structurally identical to what was persisted.
 *
 * These tests operate at use-case + pure-function level — no live DB required.
 */

import { GetLotTraceDataUseCase } from '@/application/useCases/get-lot-trace-data-usecase'
import { LotTraceRepository } from '@/domain/repositories/lot-trace-repository'
import { LotTraceData } from '@/domain/entities/lot-trace-data'
import { NotFoundError } from '@/domain/errors'
import { computeSafeHarvestDate } from '@/infrastructure/db/repositories/prisma-lot-trace-repository'

// ── Mock repository ────────────────────────────────────────────────────────────

const SNAPSHOT_DATA: LotTraceData = {
  lot_code: 'MD2-ST25-20260801-001',
  commodity: 'Lúa ST25',
  quality_grade: 'Grade 1',
  status: 'QR_EXPORTED',
  packaging_date: new Date('2026-08-01'),
  packaging_spec: 'Bao 25kg',
  total_weight_kg: 500,
  qr_image_url: 'https://minio.test/qr.png',
  created_at: new Date('2026-08-01T08:00:00Z'),
  is_harvest_safe: true,
  latest_safe_harvest_date: new Date('2026-07-28'),
  htx_name: 'HTX Mekong Delta 2',
  parcels: [
    { parcel_code: 'P-MD2-001', area_ha: 1.5, household_name: 'Nguyễn Văn An', crop_type: 'Lúa ST25', status: 'HARVESTED' },
  ],
  journal_summaries: [
    {
      entry_date: new Date('2026-07-20'),
      activity_type: 'FERTILIZING',
      performed_by: 'officer-id-1',
      approved_by_id: 'officer-id-1',
      activity_detail: 'Bón phân NPK',
      product_name: 'NPK 16-16-8',
      dosage: '10kg/sào',
      withdrawal_days: 14,
    },
  ],
  certificate_keys: ['certs/vietgap-2026.pdf'],
}

class MockLotTraceRepo implements LotTraceRepository {
  private returnValue: LotTraceData | null = SNAPSHOT_DATA

  setReturnValue(v: LotTraceData | null) { this.returnValue = v }

  async getLotByCode(_code: string): Promise<LotTraceData | null> {
    return this.returnValue
  }

  async getParcelHarvests(_code: string) {
    return []
  }
}

// ── Use case tests ─────────────────────────────────────────────────────────────

describe('GetLotTraceDataUseCase — immutable snapshot contract', () => {
  let repo: MockLotTraceRepo
  let useCase: GetLotTraceDataUseCase

  beforeEach(() => {
    repo = new MockLotTraceRepo()
    useCase = new GetLotTraceDataUseCase(repo)
  })

  it('returns data from repo unchanged (pass-through contract)', async () => {
    const result = await useCase.execute('MD2-ST25-20260801-001')

    expect(result).toEqual(SNAPSHOT_DATA)
    expect(result.lot_code).toBe('MD2-ST25-20260801-001')
    expect(result.status).toBe('QR_EXPORTED')
  })

  it('throws NotFoundError when repo returns null', async () => {
    repo.setReturnValue(null)
    await expect(useCase.execute('DOES-NOT-EXIST')).rejects.toThrow(NotFoundError)
  })

  it('snapshot data structure is preserved — parcels + journal_summaries unchanged', async () => {
    const result = await useCase.execute('MD2-ST25-20260801-001')

    expect(result.parcels).toHaveLength(1)
    expect(result.parcels[0].parcel_code).toBe('P-MD2-001')
    expect(result.journal_summaries).toHaveLength(1)
    expect(result.journal_summaries[0].withdrawal_days).toBe(14)
    expect(result.certificate_keys).toContain('certs/vietgap-2026.pdf')
  })

  it('snapshot returned for QR_EXPORTED must not include live mutation fields', async () => {
    // The snapshot is the final, locked representation.
    // Verify status is locked and is_harvest_safe matches snapshot (not re-computed).
    const result = await useCase.execute('MD2-ST25-20260801-001')

    expect(result.status).toBe('QR_EXPORTED')
    // is_harvest_safe in snapshot was set at export time — use case does NOT re-derive it
    expect(result.is_harvest_safe).toBe(true)
  })

  it('snapshot from different lot_code returns that lot\'s data unchanged', async () => {
    const anotherLot: LotTraceData = { ...SNAPSHOT_DATA, lot_code: 'MD2-ST25-20260810-002', status: 'DRAFT' }
    repo.setReturnValue(anotherLot)

    const result = await useCase.execute('MD2-ST25-20260810-002')
    expect(result.lot_code).toBe('MD2-ST25-20260810-002')
    expect(result.status).toBe('DRAFT')
  })
})

// ── computeSafeHarvestDate unit tests ─────────────────────────────────────────

describe('computeSafeHarvestDate — withdrawal safety computation', () => {
  it('returns null when no entries', () => {
    expect(computeSafeHarvestDate([])).toBeNull()
  })

  it('returns null when no activities have withdrawal_days', () => {
    const entries = [{ entry_date: new Date('2026-07-01'), activities: [{ withdrawal_days: null }] }]
    expect(computeSafeHarvestDate(entries)).toBeNull()
  })

  it('computes safe date = entry_date + withdrawal_days', () => {
    const entryDate = new Date('2026-07-01')
    const entries = [{ entry_date: entryDate, activities: [{ withdrawal_days: 14 }] }]
    const result = computeSafeHarvestDate(entries)

    expect(result).not.toBeNull()
    const expected = new Date('2026-07-01')
    expected.setDate(expected.getDate() + 14)
    expect(result!.toDateString()).toBe(expected.toDateString())
  })

  it('picks the latest safe date across multiple entries', () => {
    const entries = [
      { entry_date: new Date('2026-07-01'), activities: [{ withdrawal_days: 7 }] },   // safe: 07-08
      { entry_date: new Date('2026-07-10'), activities: [{ withdrawal_days: 14 }] },  // safe: 07-24 ← latest
      { entry_date: new Date('2026-07-05'), activities: [{ withdrawal_days: 10 }] },  // safe: 07-15
    ]
    const result = computeSafeHarvestDate(entries)
    const expected = new Date('2026-07-10')
    expected.setDate(expected.getDate() + 14)
    expect(result!.toDateString()).toBe(expected.toDateString())
  })

  it('ignores activities with null withdrawal_days', () => {
    const entries = [
      { entry_date: new Date('2026-07-01'), activities: [{ withdrawal_days: null }, { withdrawal_days: 7 }] },
    ]
    const result = computeSafeHarvestDate(entries)
    const expected = new Date('2026-07-01')
    expected.setDate(expected.getDate() + 7)
    expect(result!.toDateString()).toBe(expected.toDateString())
  })
})
