// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HouseholdManager } from '@/app/officer/households/_components/HouseholdManager'
import { LotList } from '@/app/officer/lots/_components/LotList'
import { OfficerJournalApproval } from '@/app/officer/journal/_components/officer-journal-approval'
import { Stats } from '@/components/features/officer-web/parts'
import { Users } from 'lucide-react'
import OfficerDiseasesPage from '@/app/officer/diseases/page'
import { auth } from '@/auth'
import { GatewayDiseaseReportReader } from '@/infrastructure/core/gateway-disease-report-reader'

jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/infrastructure/core/core-gateway.client', () => ({ CoreGatewayClient: jest.fn() }))
jest.mock('@/infrastructure/core/gateway-disease-report-reader', () => ({ GatewayDiseaseReportReader: jest.fn() }))
jest.mock('@/infrastructure/storage/minio-storage.adapter', () => ({
  MinioStorageAdapter: jest.fn(() => ({ getPresignedUrl: jest.fn().mockResolvedValue('/report-photo.jpg') })),
}))

const households = [
  { id: 'h1', name: 'Đặng Thị Hoa', phone: '090000003', address: 'Xã A', parcel_count: 2, total_area_ha: 1.4 },
  { id: 'h2', name: 'Vàng A Sử', phone: '090000002', address: null, parcel_count: 3, total_area_ha: 2.35 },
]
const response = (data: unknown, ok = true) => ({ ok, status: ok ? 200 : 503, json: async () => ({ data }) })
const metric = (label: string) => screen.getByText(label, { selector: 'dt' }).parentElement!.querySelector('dd')

beforeEach(() => { jest.clearAllMocks() })

test('household totals use loaded data and retain contacts and detail links', async () => {
  global.fetch = jest.fn().mockResolvedValue(response(households))
  render(<HouseholdManager />)
  expect(screen.queryByText('Tổng số nông hộ')).not.toBeInTheDocument()
  await screen.findByText('Đặng Thị Hoa')
  expect(metric('Tổng số nông hộ')).toHaveTextContent('2')
  expect(metric('Tổng số thửa')).toHaveTextContent('5')
  expect(metric('Tổng diện tích')).toHaveTextContent('3,75 ha')
  expect(screen.getByText('TH')).toBeInTheDocument()
  expect(screen.getByText('090000003')).toBeInTheDocument()
  expect(screen.getByText('Xã A')).toBeInTheDocument()
  expect(screen.getAllByRole('link', { name: 'Xem chi tiết' })[0]).toHaveAttribute('href', '/officer/households/h1')
  expect(global.fetch).toHaveBeenCalledTimes(1)
})

test('creating a household preserves the payload and refreshes totals', async () => {
  global.fetch = jest.fn()
    .mockResolvedValueOnce(response(households))
    .mockResolvedValueOnce(response({ id: 'h3' }))
    .mockResolvedValueOnce(response([...households, { id: 'h3', name: 'New owner', phone: '0901234567', parcel_count: 0, total_area_ha: 0 }]))
  render(<HouseholdManager />)
  await screen.findByText('Đặng Thị Hoa')
  fireEvent.click(screen.getByRole('button', { name: '+ Thêm nông hộ' }))
  fireEvent.change(screen.getByPlaceholderText('Nguyễn Văn A'), { target: { value: 'New owner' } })
  fireEvent.change(screen.getByPlaceholderText('0901234567'), { target: { value: '0901234567' } })
  fireEvent.click(screen.getByRole('button', { name: 'Tạo nông hộ' }))
  await screen.findByText('New owner')
  expect(metric('Tổng số nông hộ')).toHaveTextContent('3')
  expect(metric('Tổng số thửa')).toHaveTextContent('5')
  expect(global.fetch).toHaveBeenCalledWith('/api/farm/households', expect.objectContaining({
    method: 'POST', body: JSON.stringify({ household_code: '0901234567', owner_name: 'New owner', phone: '0901234567' }),
  }))
})

test('a failed household load is not represented as zero totals', async () => {
  global.fetch = jest.fn().mockResolvedValue(response({}, false))
  render(<HouseholdManager />)
  await screen.findByText('Không thể tải danh sách nông hộ. Vui lòng thử lại sau.')
  expect(screen.queryByText('Tổng số nông hộ')).not.toBeInTheDocument()
})

test('empty households have real zero totals', async () => {
  global.fetch = jest.fn().mockResolvedValue(response([]))
  render(<HouseholdManager />)
  await screen.findByText('Chưa có nông hộ nào. Hãy thêm nông hộ đầu tiên!')
  expect(metric('Tổng số nông hộ')).toHaveTextContent('0')
  expect(metric('Tổng diện tích')).toHaveTextContent('0 ha')
})

test('lot totals normalize statuses and preserve export and public QR actions', async () => {
  const lots = [
    { id: 'l1', lot_code: 'LOT-1', commodity: 'Chè', status: 'READY', parcel_count: 2, created_at: '2026-11-01' },
    { id: 'l2', lot_code: 'LOT-2', commodity: 'Chè', status: 'QR_EXPORTED', parcel_count: 1, created_at: '2026-11-02' },
  ]
  // Export now goes through the certificate dialog (phase 2 F2): the dialog lists certificates, then posts the choice.
  let exported = false
  global.fetch = jest.fn(async (url: string) => {
    if (url === '/api/certificates') return response([])
    if (url === '/api/lots/l1/export-qr') { exported = true; return response({ lot_code: 'LOT-1' }) }
    return response(lots.map(l => (exported ? { ...l, status: 'QR_EXPORTED' } : l)))
  }) as unknown as typeof fetch
  render(<LotList />)
  await screen.findByText('LOT-1')
  expect(metric('Tổng số lô')).toHaveTextContent('2')
  expect(metric('Lô sẵn sàng')).toHaveTextContent('1')
  expect(metric('Lô đã xuất QR')).toHaveTextContent('1')
  expect(screen.getByRole('link', { name: 'Xem trang QR' })).toHaveAttribute('href', '/lot/LOT-2')
  fireEvent.click(screen.getByRole('button', { name: 'Xuất QR' }))
  const confirm = screen.getAllByRole('button', { name: 'Xuất QR' }).pop()!
  await waitFor(() => expect(confirm).toBeEnabled())
  fireEvent.click(confirm)
  await waitFor(() => expect(metric('Lô đã xuất QR')).toHaveTextContent('2'))
  expect(global.fetch).toHaveBeenCalledWith('/api/lots/l1/export-qr', expect.objectContaining({ method: 'POST' }))
})

test('journal status totals update after approval while retaining the table', async () => {
  global.fetch = jest.fn().mockResolvedValue(response([
    { id: 'j1', parcel_code: 'P1', status: 'PENDING_APPROVAL' },
    { id: 'j2', parcel_code: 'P2', status: 'APPROVED' },
  ]))
  render(<OfficerJournalApproval householdId="h1" />)
  await screen.findByText('P1')
  expect(screen.getByRole('table')).toBeInTheDocument()
  expect(metric('Tất cả nhật ký')).toHaveTextContent('2')
  expect(metric('Chờ duyệt')).toHaveTextContent('1')
  fireEvent.click(screen.getByRole('button', { name: 'Duyệt' }))
  await waitFor(() => expect(metric('Đã duyệt')).toHaveTextContent('2'))
  expect(metric('Chờ duyệt')).toHaveTextContent('0')
  expect(global.fetch).toHaveBeenCalledWith('/api/journal?householdId=h1&limit=1000')
})

test.each([
  ['Từ chối', 'REJECTED'],
  ['Yêu cầu sửa', 'REQUEST_CHANGES'],
])('journal %s keeps its review request and updates the displayed count', async (action, decision) => {
  global.fetch = jest.fn().mockResolvedValue(response([{ id: 'j1', parcel_code: 'P1', status: 'PENDING_APPROVAL' }]))
  render(<OfficerJournalApproval />)
  await screen.findByText('P1')
  fireEvent.click(screen.getByRole('button', { name: action }))
  fireEvent.change(screen.getByPlaceholderText('Nhập lý do để nông dân biết...'), { target: { value: 'Cần kiểm tra lại' } })
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }))
  await waitFor(() => expect(metric('Chờ duyệt')).toHaveTextContent('0'))
  expect(global.fetch).toHaveBeenCalledWith('/api/journal/j1/review', expect.objectContaining({
    method: 'POST', body: JSON.stringify({ decision, reason: 'Cần kiểm tra lại' }),
  }))
  expect(screen.getByRole('button', { name: 'Xem' })).toBeInTheDocument()
})

test('household creation errors retain the form and cancel restores the add action', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce(response(households)).mockResolvedValueOnce({
    ok: false, json: async () => ({ error: { message: 'Số điện thoại đã tồn tại' } }),
  })
  render(<HouseholdManager />)
  await screen.findByText('Đặng Thị Hoa')
  fireEvent.click(screen.getByRole('button', { name: '+ Thêm nông hộ' }))
  fireEvent.change(screen.getByPlaceholderText('Nguyễn Văn A'), { target: { value: 'New owner' } })
  fireEvent.change(screen.getByPlaceholderText('0901234567'), { target: { value: '0901234567' } })
  fireEvent.click(screen.getByRole('button', { name: 'Tạo nông hộ' }))
  await screen.findByText('Số điện thoại đã tồn tại')
  expect(metric('Tổng số nông hộ')).toHaveTextContent('2')
  fireEvent.click(screen.getByRole('button', { name: 'Hủy' }))
  expect(screen.getByRole('button', { name: '+ Thêm nông hộ' })).toBeInTheDocument()
  expect(screen.queryByText('Số điện thoại đã tồn tại')).not.toBeInTheDocument()
})

test('summary figures keep semantic labels, localized numbers and decorative icons', () => {
  const { container } = render(<Stats items={[{ label: 'Nông hộ', value: 12345, icon: <Users /> }]} />)
  expect(metric('Nông hộ')).toHaveTextContent('12.345')
  expect(container.querySelector('dl > div > dt')).toHaveTextContent('Nông hộ')
  expect(container.querySelector('svg')?.closest('[aria-hidden="true"]')).not.toBeNull()
})

test('disease counts use the pending queue and preserve review buttons, links and confidence', async () => {
  ;(auth as jest.Mock).mockResolvedValue({ user: { role: 'officer' } })
  const findPendingReports = jest.fn().mockResolvedValue([
    { id: 'd1', ai_disease_name: 'Bệnh đốm lá', confirmed_diagnosis: null, ai_confidence: 0.85, farmer_name: 'Farmer A', parcel_code: 'P1', detection_date: new Date('2026-11-01'), photo_minio_key: 'photo' },
    { id: 'd2', ai_disease_name: 'Bệnh đốm lá', confirmed_diagnosis: null, ai_confidence: 0.5, farmer_name: 'Farmer B', parcel_code: 'P2', detection_date: new Date('2026-11-02'), photo_minio_key: '' },
  ])
  ;(GatewayDiseaseReportReader as jest.Mock).mockImplementation(() => ({ findPendingReports }))
  render(await OfficerDiseasesPage())
  expect(metric('Báo cáo chờ duyệt')).toHaveTextContent('2')
  expect(metric('Báo cáo có ảnh')).toHaveTextContent('1')
  expect(screen.getAllByRole('button', { name: 'Xem chi tiết & Duyệt' })).toHaveLength(2)
  expect(screen.getAllByRole('link', { name: 'Xem chi tiết & Duyệt' })[0]).toHaveAttribute('href', '/officer/diseases/d1')
  expect(screen.getByText('85.0%')).toBeInTheDocument()
  expect(screen.getByText('Nông hộ: Farmer A')).toBeInTheDocument()
  expect(findPendingReports).toHaveBeenCalledTimes(1)
})

test('an empty disease queue keeps its message and zero counts', async () => {
  ;(auth as jest.Mock).mockResolvedValue({ user: { role: 'officer' } })
  ;(GatewayDiseaseReportReader as jest.Mock).mockImplementation(() => ({ findPendingReports: async () => [] }))
  render(await OfficerDiseasesPage())
  expect(metric('Báo cáo chờ duyệt')).toHaveTextContent('0')
  expect(screen.getByText('Không có báo cáo bệnh nào đang chờ duyệt.')).toBeInTheDocument()
})

test('an empty summary does not render an empty strip', () => {
  const { container } = render(<Stats items={[]} />)
  expect(container).toBeEmptyDOMElement()
})

describe('household cards', () => {
  it('give each household its share of the cooperative area', async () => {
    const household = (id: string, name: string, area: number) => ({ id, name, phone: '0900000000', address: null, parcel_count: 1, total_area_ha: area })
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [household('a', 'Lò Thị Mai', 3), household('b', 'Vàng A Sử', 1)] }) }) as unknown as typeof fetch
    render(<HouseholdManager />)
    expect(await screen.findByText('75% diện tích HTX')).toBeInTheDocument()
    expect(screen.getByText('25% diện tích HTX')).toBeInTheDocument()
  })
})

describe('dashboard journal links', () => {
  it('opens an older tenant-loaded entry even when absent from the current list', async () => {
    global.fetch = jest.fn().mockResolvedValue(response([]))
    render(<OfficerJournalApproval selectedEntry={{ id: 'older', parcel_code: 'P-OLDER', status: 'APPROVED', notes: 'Older entry detail', performed_by: 'Recorded farmer' }} />)
    expect(await screen.findByText('Chi tiết Nhật ký')).toBeInTheDocument()
    expect(screen.getByText('Older entry detail')).toBeInTheDocument()
    expect(screen.getByText('Recorded farmer')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Duyệt' })).not.toBeInTheDocument()
  })

  it('opens and cancels the existing create form from a dashboard deep link', async () => {
    global.fetch = jest.fn().mockResolvedValue(response([]))
    render(<OfficerJournalApproval createOnOpen />)
    expect(await screen.findByRole('heading', { name: 'Ghi nhật ký mới' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }))
    expect(screen.queryByRole('heading', { name: 'Ghi nhật ký mới' })).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())
  })
})

describe('pressing a figure', () => {
  it('shows only the journal entries it counts, and everything again', async () => {
    global.fetch = jest.fn().mockResolvedValue(response([
      { id: 'j1', parcel_code: 'P1', status: 'PENDING_APPROVAL' },
      { id: 'j2', parcel_code: 'P2', status: 'APPROVED' },
    ]))
    render(<OfficerJournalApproval />)
    await screen.findByText('P1')
    fireEvent.click(screen.getByRole('button', { name: 'Xem Chờ duyệt' }))
    expect(screen.queryByText('P2')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Xem Tất cả nhật ký' }))
    expect(screen.getByText('P2')).toBeInTheDocument()
  })

  it('orders households by area', async () => {
    global.fetch = jest.fn().mockResolvedValue(response(households))
    const { container } = render(<HouseholdManager />)
    await screen.findByText('Đặng Thị Hoa')
    fireEvent.click(screen.getByRole('button', { name: 'Xem Tổng diện tích' }))
    expect(container.querySelector('article')).toHaveTextContent('Vàng A Sử')
  })
})
