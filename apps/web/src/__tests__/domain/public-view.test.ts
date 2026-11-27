/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { publicView } from '@/domain/lot/public-view'
import type { LotTraceData } from '@/domain/entities/lot-trace-data'

const trace = (): LotTraceData => ({
  lot_code: 'TC-CHE-1', commodity: 'Chè', quality_grade: 'Đinh', status: 'QR_EXPORTED', packaging_date: null, packaging_spec: null,
  total_weight_kg: 10, qr_image_url: null, created_at: new Date('2026-11-28'), is_harvest_safe: true, latest_safe_harvest_date: null,
  parcels: [{ parcel_code: 'P1', area_ha: 1, household_name: 'Nguyễn Văn A', crop_type: 'Chè', status: 'ACTIVE' }],
  journal_summaries: [{ entry_date: new Date('2026-11-01'), activity_type: 'SPRAYING', performed_by: 'Trần Thị B', approved_by_id: null, activity_detail: 'x', product_name: null, dosage: null, withdrawal_days: null }],
  certificate_keys: [], htx_name: 'HTX Tân Cương',
  batches: [{ batch_code: 'TC-MS-1', processed_on: '2026-11-20', master_name: 'Lê Văn C', fresh_kg: 50, dry_kg: 10, recovery_ratio: 5, out_of_band: false, grade: 'Đinh', kg_in_lot: 10, ticket_count: 2, parcel_codes: ['P1'] }],
})

describe('publicView', () => {
  it('blanks household, performer and master names when names are off, and changes nothing else', () => {
    const input = trace()
    const out = publicView(input, false)
    expect(out.parcels[0].household_name).toBe('')
    expect(out.journal_summaries[0].performed_by).toBe('')
    expect(out.batches?.[0].master_name).toBeNull()
    expect({ ...out, parcels: 0, journal_summaries: 0, batches: 0 }).toEqual({ ...input, parcels: 0, journal_summaries: 0, batches: 0 })
    expect(out.parcels[0]).toMatchObject({ parcel_code: 'P1', area_ha: 1 })
    expect(out.batches?.[0]).toMatchObject({ batch_code: 'TC-MS-1', fresh_kg: 50 })
  })

  it('does not mutate its input', () => {
    const input = trace()
    publicView(input, false)
    expect(input.parcels[0].household_name).toBe('Nguyễn Văn A')
    expect(input.batches?.[0].master_name).toBe('Lê Văn C')
  })

  it('keeps the names when they are on', () => {
    const out = publicView(trace(), true)
    expect(out.parcels[0].household_name).toBe('Nguyễn Văn A')
    expect(out.journal_summaries[0].performed_by).toBe('Trần Thị B')
    expect(out.batches?.[0].master_name).toBe('Lê Văn C')
  })

  it('renders a snapshot stored before phase 2 (no batches) without adding the field', () => {
    const old = trace()
    delete old.batches
    const out = publicView(old, false)
    expect(out.batches).toBeUndefined()
    expect(out.parcels[0].household_name).toBe('')
  })
})
