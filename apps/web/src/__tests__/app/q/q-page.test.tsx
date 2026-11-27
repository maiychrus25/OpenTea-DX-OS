// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import QrTracePage from '@/app/q/[lot_code]/page'
import { loadPublicPageData } from '@/app/q/[lot_code]/public-page-data'

jest.mock('@/app/q/[lot_code]/public-page-data', () => ({ loadPublicPageData: jest.fn() }))

const base = {
  lot_code: 'TC-CHE-20261128-001', commodity: 'Chè', quality_grade: null, status: 'QR_EXPORTED', packaging_date: null, packaging_spec: null,
  total_weight_kg: 40, qr_image_url: null, created_at: new Date('2026-11-28T00:00:00Z'), is_harvest_safe: true, latest_safe_harvest_date: null,
  parcels: [{ parcel_code: 'T-01', area_ha: 1.2, household_name: '', crop_type: 'Chè', status: 'TENDING' }],
  journal_summaries: [{ entry_date: new Date('2026-11-10T00:00:00Z'), activity_type: 'SPRAYING', performed_by: '', approved_by_id: null, activity_detail: '', product_name: 'Abamec', dosage: null, withdrawal_days: 7 }],
  certificate_keys: [], htx_name: 'HTX Chè Thái',
  dry_grade: 'DINH',
  batches: [{ batch_code: 'TC-MS-20261128-01', processed_on: '2026-11-28', master_name: null, fresh_kg: 190, dry_kg: 38, recovery_ratio: 5, out_of_band: false, grade: 'DINH', kg_in_lot: 40, ticket_count: 2, parcel_codes: ['T-01'] }],
  intake: [
    { parcel_code: 'T-01', cycle_label: 'Vụ Xuân', weighed_on: '2026-11-27', net_kg: 95, safe_on: '2026-11-20' },
    { parcel_code: 'T-01', cycle_label: 'Vụ Xuân', weighed_on: '2026-11-28', net_kg: 95, safe_on: null },
  ],
  certificates: [
    { id: 'c1', kind: 'VIETGAP', number: 'VG-1', issuer: 'Chi cục', issued_on: '2025-01-01', expires_on: '2027-01-01', file_key: 'key/vg1.pdf' },
    { id: 'c2', kind: 'OCOP', number: 'OC-2', issuer: 'Sở', issued_on: '2025-01-01', expires_on: '2026-01-01', file_key: 'key/oc2.pdf' },
  ],
}

const pageFor = (code: string) => QrTracePage({ params: Promise.resolve({ lot_code: code }) })
const load = (value: unknown) => (loadPublicPageData as jest.Mock).mockResolvedValue(value)

beforeEach(() => {
  (loadPublicPageData as jest.Mock).mockReset()
})

test('the page shows the four layers in order with the batch sentence and certificate states', async () => {
  load({ trace: base, today: '2026-11-28', verification: ['Chuỗi audit khớp.'] })
  render(await pageFor('TC-CHE-20261128-001'))
  const headings = screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)
  expect(headings).toEqual(['1. Vùng trồng', '2. An toàn cách ly', '3. Mẻ sao chế biến', '4. Chứng nhận'])
  expect(screen.getByText('Chuỗi audit khớp.')).toBeInTheDocument()
  expect(screen.getByText('Lô 40,0 kg hạng Đinh lấy từ 1 mẻ, 2 phiếu cân.')).toBeInTheDocument()
  expect(screen.getByText('Còn hiệu lực đến 01/01/2027')).toBeInTheDocument()
  expect(screen.getByText('Đã hết hạn')).toBeInTheDocument()
  expect(screen.getAllByRole('link', { name: 'Xem tệp chứng nhận' })[0]).toHaveAttribute('href', '/api/lot/TC-CHE-20261128-001/certificate?key=key%2Fvg1.pdf')
})

test('a named person in the trace shows only where the page has one; empty names leave no gap', async () => {
  load({ trace: { ...base, batches: [{ ...base.batches![0], master_name: null }] }, today: '2026-11-28', verification: [] })
  render(await pageFor('TC-CHE-20261128-001'))
  expect(screen.queryByText(/Nghệ nhân/)).not.toBeInTheDocument()
  expect(screen.queryByText(/Thực hiện bởi/)).not.toBeInTheDocument()
  expect(screen.queryByText(/Hộ /)).not.toBeInTheDocument()
})

test('a snapshot from before phase 2 renders the old content: no batch layer, legacy certificate links', async () => {
  const old = { ...base, batches: undefined, intake: undefined, certificates: undefined, dry_grade: undefined, certificate_keys: ['key/legacy.pdf'] }
  load({ trace: old, today: '2026-11-28', verification: [] })
  render(await pageFor('TC-CHE-20261128-001'))
  expect(screen.queryByRole('heading', { name: '3. Mẻ sao chế biến' })).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '1. Vùng trồng' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '4. Chứng nhận' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Xem giấy chứng nhận 1' })).toHaveAttribute('href', '/api/lot/TC-CHE-20261128-001/certificate?key=key%2Flegacy.pdf')
})

test('a lot with no data left out has only the header and disclaimer', async () => {
  const empty = { ...base, parcels: [], htx_name: null, journal_summaries: [], batches: [], intake: [], certificates: [], certificate_keys: [] }
  load({ trace: empty, today: '2026-11-28', verification: [] })
  render(await pageFor('TC-CHE-20261128-001'))
  expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chè · Đinh')
})

test('an unknown lot shows the not-found card and no layer', async () => {
  load(null)
  render(await pageFor('TC-KHONG-CO'))
  expect(screen.getByRole('heading', { name: 'Không tìm thấy dữ liệu' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
})

test('a code with a slash is refused before any lookup', async () => {
  render(await pageFor('TC%2Fxau'))
  expect(screen.getByRole('heading', { name: 'Mã QR không hợp lệ' })).toBeInTheDocument()
  expect(loadPublicPageData).not.toHaveBeenCalled()
})

test('the verification block is labelled for screen readers', async () => {
  load({ trace: base, today: '2026-11-28', verification: ['Chuỗi audit khớp.'] })
  render(await pageFor('TC-CHE-20261128-001'))
  expect(within(screen.getByRole('region', { name: 'Kiểm chứng trong sổ audit' })).getByText('Chuỗi audit khớp.')).toBeInTheDocument()
})
