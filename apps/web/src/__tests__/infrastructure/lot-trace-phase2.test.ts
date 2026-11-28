// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { prisma } from '@/infrastructure/db/prisma.client'
import { PrismaLotTraceRepository } from '@/infrastructure/db/repositories/prisma-lot-trace-repository'

jest.mock('@/infrastructure/db/prisma.client', () => ({ prisma: { lot: { findUnique: jest.fn() } } }))

const spray = (entry: string, safe: string, cycle: string | null = 'c1', status = 'APPROVED') => ({
  status, cycle_id: cycle, entry_date: new Date(entry), activity_type: 'SPRAYING', performed_by: 'Hộ A', approved_by_id: null,
  activities: [{ activity_detail: 'x', product_name: 'P', dosage: '1', withdrawal_days: 5, safe_harvest_date: new Date(safe) }],
})
const ticket = (id: string, weighed: string, kg: string) => ({ id, parcel_id: 'p1', cycle_id: 'c1', weighed_at: new Date(weighed), net_kg: kg, parcel: { parcel_code: 'TC-A1' }, cycle: { season: 'Lứa 1/2026' } })
const cert = (over: Record<string, unknown> = {}) => ({
  certificate: { id: 'k1', kind: 'VIETGAP', number: 'VG-1', issuer: 'Sở NN', issued_on: new Date('2026-01-01'), expires_on: new Date('2027-01-01'), file_key: 'para/TC/Certificates/k1.pdf', revoked_at: null, ...over },
})

function lot(over: Record<string, unknown> = {}, sprays: unknown[] = []) {
  return {
    lot_code: 'TC-CHE-20261127-001', commodity: 'Chè', quality_grade: 'Đinh', dry_grade: 'DINH', status: 'READY', harvest_date: new Date('2026-11-27T00:00:00Z'),
    packaging_type: null, actual_weight_kg: null, estimated_weight_kg: 40, qr_image_url: null, created_at: new Date(), certificate_keys: [], htx_profile: { name: 'HTX Tân Cương' },
    public_page_data: null, certificates: [],
    batch_sources: [
      { kg: '40.0', output: { grade: 'DINH', batch: {
        batch_code: 'TC-MS-20261127-01', processed_on: new Date('2026-11-27T00:00:00Z'), master_name: 'Anh Ba', fresh_kg: '190.0', dry_kg: '40.0', recovery_ratio: '4.75', out_of_band: false,
        tickets: [ticket('t1', '2026-11-26T03:00:00Z', '100.0'), ticket('t2', '2026-11-27T03:00:00Z', '90.0')],
      } } },
    ],
    lot_parcels: [{ parcel_id: 'p1', cycle_id: 'c1', parcel: { parcel_code: 'TC-A1', area_ha: 1, crop_type: 'Chè', status: 'TENDING', household: { name: 'Hộ A' }, journal_entries: sprays } }],
    ...over,
  }
}
const read = (row: unknown) => {
  ;(prisma.lot.findUnique as jest.Mock).mockResolvedValue(row)
  return new PrismaLotTraceRepository().getLotByCode('TC-CHE-20261127-001')
}

describe('trace data of a lot from batches', () => {
  it('has the batch, the intake of every source ticket and the grade, and is safe without sprays', async () => {
    const data = await read(lot())
    expect(data?.dry_grade).toBe('DINH')
    expect(data?.is_harvest_safe).toBe(true)
    expect(data?.batches).toEqual([{ batch_code: 'TC-MS-20261127-01', processed_on: '2026-11-27', master_name: 'Anh Ba', fresh_kg: 190, dry_kg: 40, recovery_ratio: 4.75, out_of_band: false, grade: 'DINH', kg_in_lot: 40, ticket_count: 2, parcel_codes: ['TC-A1'] }])
    expect(data?.intake).toEqual([
      { parcel_code: 'TC-A1', cycle_label: 'Lứa 1/2026', weighed_on: '2026-11-26', net_kg: 100, safe_on: null },
      { parcel_code: 'TC-A1', cycle_label: 'Lứa 1/2026', weighed_on: '2026-11-27', net_kg: 90, safe_on: null },
    ])
    expect(JSON.stringify(data?.intake)).not.toMatch(/household|ticket_no|Hộ A/)
  })

  it('shows the safe day of a spraying that counted, when it was already over', async () => {
    const data = await read(lot({}, [spray('2026-11-10', '2026-11-20T00:00:00+07:00')]))
    expect(data?.is_harvest_safe).toBe(true)
    expect(data?.intake?.map((i) => i.safe_on)).toEqual(['2026-11-20', '2026-11-20'])
  })

  it('is unsafe when a spraying dated before the weighing is safe only after it, even if written down later (Review Focus 3)', async () => {
    const data = await read(lot({}, [spray('2026-11-25', '2026-11-30T00:00:00+07:00', 'c2')]))
    expect(data?.is_harvest_safe).toBe(false)
    expect(data?.latest_safe_harvest_date).toEqual(new Date('2026-11-30T00:00:00+07:00'))
  })

  it('judges each ticket on its own weigh day: a spraying safe on the second weigh day blocks only the first ticket', async () => {
    const data = await read(lot({}, [spray('2026-11-24', '2026-11-27T00:00:00+07:00')]))
    expect(data?.is_harvest_safe).toBe(false)
  })

  it('leaves out drafts', async () => {
    const data = await read(lot({}, [spray('2026-11-25', '2026-12-30T00:00:00+07:00', 'c1', 'DRAFT')]))
    expect(data?.is_harvest_safe).toBe(true)
  })
})

describe('certificates are read live', () => {
  it('lists them for a lot that is not exported yet', async () => {
    const data = await read(lot({ certificates: [cert()] }))
    expect(data?.certificates).toEqual([{ id: 'k1', kind: 'VIETGAP', number: 'VG-1', issuer: 'Sở NN', issued_on: '2026-01-01', expires_on: '2027-01-01', file_key: 'para/TC/Certificates/k1.pdf', revoked_at: null }])
  })

  it('overwrites the snapshot of an exported lot, so a revoke after the export shows (and an old snapshot gets the live list)', async () => {
    const snapshot = { lot_code: 'TC-CHE-20261127-001', created_at: '2026-11-27T00:00:00Z', packaging_date: null, latest_safe_harvest_date: null, journal_summaries: [], certificates: [{ id: 'k1', file_key: 'x', revoked_at: null }] }
    const revoked = await read(lot({ status: 'QR_EXPORTED', public_page_data: snapshot, certificates: [cert({ revoked_at: new Date('2026-12-01T03:00:00Z') })] }))
    expect(revoked?.certificates?.[0]).toMatchObject({ id: 'k1', revoked_at: '2026-12-01T03:00:00.000Z' })
    const old = await read(lot({ status: 'QR_EXPORTED', public_page_data: { ...snapshot, certificates: undefined }, certificates: [] }))
    expect(old?.certificates).toEqual([])
  })

  it('still reads a lot row from before phase 2 (no batch sources, no certificate relation)', async () => {
    const row = lot({ batch_sources: undefined, certificates: undefined, dry_grade: null })
    const data = await read(row)
    expect(data?.batches).toBeUndefined()
    expect(data?.intake).toBeUndefined()
    expect(data?.certificates).toEqual([])
    expect(data?.dry_grade).toBeNull()
  })
})
