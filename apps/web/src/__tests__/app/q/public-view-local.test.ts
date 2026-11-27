// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { certificateStatusOn, hideNamesUnlessAllowed } from '@/app/q/[lot_code]/public-view-local'
import type { LotTraceData } from '@/domain/entities/lot-trace-data'

const trace = {
  lot_code: 'TC-CHE-20261128-001', commodity: 'Chè', quality_grade: null, status: 'QR_EXPORTED', packaging_date: null, packaging_spec: null,
  total_weight_kg: 40, qr_image_url: null, created_at: new Date('2026-11-28T00:00:00Z'), is_harvest_safe: true, latest_safe_harvest_date: null,
  parcels: [{ parcel_code: 'T-01', area_ha: 1.2, household_name: 'Nguyễn Văn A', crop_type: 'Chè', status: 'TENDING' }],
  journal_summaries: [{ entry_date: new Date('2026-11-10T00:00:00Z'), activity_type: 'SPRAYING', performed_by: 'Trần Thị B', approved_by_id: null, activity_detail: '', product_name: 'Abamec', dosage: null, withdrawal_days: 7 }],
  certificate_keys: [], htx_name: 'HTX Chè Thái',
  batches: [{ batch_code: 'TC-MS-20261128-01', processed_on: '2026-11-28', master_name: 'Ông C', fresh_kg: 190, dry_kg: 38, recovery_ratio: 5, out_of_band: false, grade: 'DINH', kg_in_lot: 40, ticket_count: 2, parcel_codes: ['T-01'] }],
} as unknown as LotTraceData

test('names leave the page unless the cooperative allows them: household, journal author and batch master', () => {
  const hidden = hideNamesUnlessAllowed(trace, false)
  expect(hidden.parcels[0].household_name).toBe('')
  expect(hidden.journal_summaries[0].performed_by).toBe('')
  expect(hidden.batches?.[0].master_name).toBeNull()
  expect(hidden.parcels[0].parcel_code).toBe('T-01')
  expect(hideNamesUnlessAllowed(trace, true)).toBe(trace)
})

test('a snapshot from before phase 2 keeps no batch list after hiding names', () => {
  const old = { ...trace, batches: undefined } as LotTraceData
  expect(hideNamesUnlessAllowed(old, false).batches).toBeUndefined()
})

test('a certificate is valid through its expiry day and expired from the next day', () => {
  const cert = { id: 'c1', kind: 'VIETGAP' as const, number: 'VG', issuer: 'x', issued_on: '2025-01-01', expires_on: '2026-11-28', file_key: 'k' }
  expect(certificateStatusOn(cert, '2026-11-28')).toBe('VALID')
  expect(certificateStatusOn(cert, '2026-11-29')).toBe('EXPIRED')
})

test('a revoked certificate is revoked whatever its date', () => {
  const cert = { id: 'c1', kind: 'OCOP' as const, number: 'OC', issuer: 'x', issued_on: '2025-01-01', expires_on: '2030-01-01', file_key: 'k', revoked_at: '2026-11-01T00:00:00Z' }
  expect(certificateStatusOn(cert, '2026-11-28')).toBe('REVOKED')
})
