// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { LotList } from '@/app/officer/lots/_components/LotList'
import { ExportQrDialog } from '@/components/features/lots/ExportQrDialog'

const cert = (id: string, status: 'VALID' | 'EXPIRED' | 'REVOKED', kind = 'VIETGAP') => ({
  id, kind, number: 'VG-' + id, issuer: 'Chi cục', issued_on: '2025-01-01', expires_on: '2027-01-01', scope_note: null,
  file_name: 'a.pdf', file_mime: 'application/pdf', file_size: 1000, revoked_at: status === 'REVOKED' ? '2026-01-01T00:00:00Z' : null,
  revoke_reason: null, status,
})
const lot = { id: 'l1', lot_code: 'TC-CHE-20261128-001', commodity: 'Chè', harvest_date: null, estimated_weight_kg: 100, actual_weight_kg: null, status: 'READY', parcel_count: 2, created_at: '2026-11-28T00:00:00Z' }

let certificates: unknown[]
let calls: { url: string; method: string; body: any }[]
let exportResponse: () => { ok: boolean; status: number; json: () => Promise<unknown> }

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data })

beforeEach(() => {
  certificates = [cert('c1', 'VALID'), cert('c2', 'EXPIRED', 'OCOP'), cert('c3', 'VALID', 'ORGANIC')]
  calls = []
  exportResponse = () => ok({ data: { lot_code: lot.lot_code } })
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ url, method, body })
    if (url === '/api/lots') return ok({ data: [lot] })
    if (url === '/api/certificates') return ok({ data: certificates })
    if (url === '/api/lots/l1/export-qr' && method === 'POST') return exportResponse()
    return { ok: false, status: 404, json: async () => ({}) }
  }) as unknown as typeof fetch
})

test('the create button shows only when labs is on; the from-batches link is always there', async () => {
  const { unmount } = render(<LotList labsEnabled={false} />)
  await screen.findByText('TC-CHE-20261128-001')
  expect(screen.queryByRole('button', { name: '+ Tạo lô mới' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Đóng lô từ mẻ' })).toHaveAttribute('href', '/officer/lots/from-batches')
  unmount()
  render(<LotList labsEnabled />)
  await screen.findByText('TC-CHE-20261128-001')
  expect(screen.getByRole('button', { name: '+ Tạo lô mới' })).toBeInTheDocument()
})

test('the export dialog checks the valid certificates and posts only the ones left checked', async () => {
  render(<LotList />)
  fireEvent.click(await screen.findByRole('button', { name: /Xuất QR/ }))
  const expired = await screen.findByRole('checkbox', { name: /OCOP/ })
  expect(expired).toBeDisabled()
  expect(expired).not.toBeChecked()
  expect(screen.getByRole('checkbox', { name: /VietGAP/ })).toBeChecked()
  fireEvent.click(screen.getByRole('checkbox', { name: /Hữu cơ/ }))
  const confirm = screen.getAllByRole('button', { name: 'Xuất QR' }).pop()!
  fireEvent.click(confirm)
  await waitFor(() => expect(calls.some(c => c.method === 'POST')).toBe(true))
  expect(calls.find(c => c.method === 'POST')!.body).toEqual({ certificate_ids: ['c1'] })
  expect(await screen.findByText('Đã xuất QR thành công! Mã: TC-CHE-20261128-001')).toBeInTheDocument()
})

test('a certificate that lapsed in the meantime is refused by the server message', async () => {
  exportResponse = () => ({ ok: false, status: 422, json: async () => ({ error: { code: 'CERTIFICATE_NOT_VALID', message: 'Chứng nhận VG-c1 đã hết hạn.' } }) })
  render(<ExportQrDialog lotId="l1" lotCode="TC-CHE-20261128-001" onCancel={() => undefined} onExported={() => undefined} />)
  await screen.findByRole('checkbox', { name: /VietGAP/ })
  fireEvent.click(screen.getByRole('button', { name: 'Xuất QR' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Chứng nhận VG-c1 đã hết hạn.')
})

test('a lot without a batch source gets the text for its code', async () => {
  exportResponse = () => ({ ok: false, status: 422, json: async () => ({ error: { code: 'LOT_WITHOUT_BATCH' } }) })
  render(<ExportQrDialog lotId="l1" lotCode="TC-CHE-20261128-001" onCancel={() => undefined} onExported={() => undefined} />)
  await screen.findByRole('checkbox', { name: /VietGAP/ })
  fireEvent.click(screen.getByRole('button', { name: 'Xuất QR' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Lô chưa có nguồn từ mẻ sao sấy nên chưa xuất được QR.')
})

test('with no certificates the dialog says the lot exports without them', async () => {
  certificates = []
  render(<ExportQrDialog lotId="l1" lotCode="TC-CHE-20261128-001" onCancel={() => undefined} onExported={() => undefined} />)
  expect(await screen.findByText('HTX chưa có chứng nhận nào. Lô vẫn xuất QR, không kèm chứng nhận.')).toBeInTheDocument()
})
