// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import QRCode from 'qrcode'
import { LotLabelSheet } from '@/components/features/lots/LotLabelSheet'
import { LotSourcesSection } from '@/components/features/lots/LotSourcesSection'

jest.mock('qrcode', () => ({ __esModule: true, default: { toDataURL: jest.fn(async () => 'data:image/png;base64,QR') } }))

beforeEach(() => {
  window.print = jest.fn()
})

const sheet = (overrides: Partial<React.ComponentProps<typeof LotLabelSheet>> = {}) => (
  <LotLabelSheet lotCode="TC-CHE-20261128-001" weightKg={19.5} dryGrade="DINH" htxName="HTX Chè Thái" {...overrides} />
)

test('each label carries the QR, the lot code, the grade, the weight and the cooperative', async () => {
  render(sheet())
  expect(await screen.findByRole('img', { name: 'Mã QR lô TC-CHE-20261128-001' })).toHaveAttribute('src', 'data:image/png;base64,QR')
  expect(QRCode.toDataURL).toHaveBeenCalledWith(expect.stringMatching(/\/q\/TC-CHE-20261128-001$/), expect.anything())
  expect(screen.getByText('TC-CHE-20261128-001')).toBeInTheDocument()
  expect(screen.getByText('Chè Đinh')).toBeInTheDocument()
  expect(screen.getByText('19,5 kg')).toBeInTheDocument()
  expect(screen.getByText('HTX Chè Thái')).toBeInTheDocument()
})

test('the copies set how many labels print, each as its own page', async () => {
  render(sheet())
  await screen.findByRole('img')
  fireEvent.change(screen.getByLabelText('Số tem (1 đến 500)'), { target: { value: '3' } })
  expect(screen.getAllByRole('img')).toHaveLength(3)
  fireEvent.click(screen.getByRole('button', { name: 'In tem' }))
  expect(window.print).toHaveBeenCalledTimes(1)
})

test('copies outside 1 to 500 are refused and printing is locked', async () => {
  render(sheet())
  await screen.findByRole('img')
  fireEvent.change(screen.getByLabelText('Số tem (1 đến 500)'), { target: { value: '0' } })
  expect(screen.getByRole('alert')).toHaveTextContent('Nhập số tem từ 1 đến 500.')
  expect(screen.getByRole('button', { name: 'In tem' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Số tem (1 đến 500)'), { target: { value: '501' } })
  expect(screen.getByRole('button', { name: 'In tem' })).toBeDisabled()
})

test('the size preset sets the page class of every label', async () => {
  render(sheet())
  await screen.findByRole('img')
  fireEvent.change(screen.getByLabelText('Khổ tem'), { target: { value: '40x30' } })
  expect(screen.getByRole('img').parentElement).toHaveClass('size40x30')
  fireEvent.change(screen.getByLabelText('Khổ tem'), { target: { value: '60x40' } })
  expect(screen.getByRole('img').parentElement).toHaveClass('size60x40')
})

test('a lot with no grade says only "Chè" and omits the weight when unknown', async () => {
  render(sheet({ dryGrade: null, weightKg: null }))
  await screen.findByRole('img')
  expect(screen.getByText('Chè')).toBeInTheDocument()
  expect(screen.queryByText(/kg$/)).not.toBeInTheDocument()
})

describe('lot sources on the manager lot page', () => {
  const trace = {
    lot_code: 'TC-CHE-20261128-001', commodity: 'Chè', quality_grade: null, status: 'READY' as const, packaging_date: null, packaging_spec: null,
    total_weight_kg: 40, qr_image_url: null, created_at: new Date(), is_harvest_safe: true, latest_safe_harvest_date: null,
    parcels: [], journal_summaries: [], certificate_keys: [], htx_name: 'HTX Chè Thái',
    batches: [{ batch_code: 'TC-MS-20261128-01', processed_on: '2026-11-28', master_name: null, fresh_kg: 190, dry_kg: 38, recovery_ratio: 5, out_of_band: true, grade: 'DINH', kg_in_lot: 40, ticket_count: 2, parcel_codes: ['T-01'] }],
    certificates: [{ id: 'c1', kind: 'VIETGAP' as const, number: 'VG-1', issuer: 'Chi cục', issued_on: '2025-01-01', expires_on: '2027-01-01', file_key: 'k' }],
  }

  test('the batch and certificate of a lot are listed with the grade and the band flag', () => {
    render(<LotSourcesSection trace={trace} />)
    expect(screen.getByText('TC-MS-20261128-01')).toBeInTheDocument()
    expect(screen.getByText(/Đinh · 40,0 kg trong lô/)).toBeInTheDocument()
    expect(screen.getByText('Lệch chuẩn')).toBeInTheDocument()
    expect(screen.getByText(/VietGAP · VG-1/)).toBeInTheDocument()
  })

  test('a snapshot from before phase 2 shows the empty notes', () => {
    render(<LotSourcesSection trace={{ ...trace, batches: undefined, certificates: undefined }} />)
    expect(screen.getByText('Lô này chưa có nguồn từ mẻ sao sấy.')).toBeInTheDocument()
    expect(screen.getByText('Lô này chưa gắn chứng nhận nào.')).toBeInTheDocument()
  })
})
