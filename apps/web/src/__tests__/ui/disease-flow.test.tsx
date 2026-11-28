// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import OfficerDiseaseDetailPage from '@/app/officer/diseases/[id]/page'
import { DiagnosisClient } from '@/app/farmer/diagnosis/_components/DiagnosisClient'
import type { DiagnosisHistoryItem } from '@/domain/disease/ports/disease-report.port'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }))
jest.mock('@/lib/api/redirect-to-login', () => ({ redirectToLogin: jest.fn() }))
jest.mock('@/app/farmer/diagnosis/actions', () => ({ getDiagnosisHistory: jest.fn().mockResolvedValue([]) }))
jest.mock('@/lib/hooks/useOfflineSync', () => ({
  useOfflineSync: () => ({ isOnline: true, queueCount: 0, isSyncing: false, saveToQueue: jest.fn() }),
}))

const respond = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body })

const report = (ai_disease_name: string) => ({
  id: 'd1',
  ai_disease_name,
  ai_confidence: 0.41,
  confirmed_diagnosis: null,
  farmer_name: 'Hộ A',
  parcel_code: 'P-1',
  detection_date: '2026-11-10T00:00:00Z',
})

const LABELS = [
  { code: 'green_leafhopper', name_vi: 'Rầy xanh', scientific_name: 'Empoasca', group: 'PEST', is_target: true, sort_order: 1 },
  { code: 'healthy', name_vi: 'Lá khoẻ', scientific_name: null, group: 'HEALTHY', is_target: false, sort_order: 50 },
]

// Answers each URL by its own mock, so the order of calls does not matter.
function routedFetch(aiName: string, labelsResponse: unknown = respond({ data: LABELS })) {
  return jest.fn(async (url: string) => {
    if (url === '/api/officer/diseases') return respond({ data: [report(aiName)] })
    if (url === '/api/disease-labels') return labelsResponse
    return respond({ success: true })
  })
}

const reviewCalls = (fetchMock: jest.Mock) => fetchMock.mock.calls.filter(c => c[0] === '/api/officer/diseases/d1/review')

function renderWith(aiName: string, labelsResponse?: unknown) {
  const fetchMock = routedFetch(aiName, labelsResponse)
  global.fetch = fetchMock as unknown as typeof fetch
  render(<OfficerDiseaseDetailPage params={{ id: 'd1' }} />)
  return fetchMock
}

describe('officer review form', () => {
  test('labels the confirmed name as required to approve', async () => {
    renderWith('Thán thư')
    expect(await screen.findByLabelText('Tên bệnh đã xác nhận (Bắt buộc khi Duyệt)')).toBeInTheDocument()
  })

  test('pre-fills the confirmed name with the AI name', async () => {
    renderWith('Thán thư')
    expect(await screen.findByLabelText(/^Tên bệnh đã xác nhận/)).toHaveValue('Thán thư')
  })

  test('leaves the confirmed name empty when the AI was uncertain', async () => {
    renderWith('Không xác định')
    expect(await screen.findByLabelText(/^Tên bệnh đã xác nhận/)).toHaveValue('')
  })

  test('refuses to approve without a confirmed name, in Vietnamese, and sends nothing', async () => {
    const fetchMock = renderWith('Không xác định')
    const input = await screen.findByLabelText(/^Tên bệnh đã xác nhận/)
    fireEvent.change(screen.getByLabelText(/Nhập hướng dẫn/), { target: { value: 'Cắt lá bệnh' } })

    fireEvent.click(screen.getByRole('button', { name: 'Phê duyệt' }))

    expect(await screen.findByText('Vui lòng nhập tên bệnh đã xác nhận trước khi duyệt.')).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(reviewCalls(fetchMock)).toHaveLength(0)
  })

  test('the label select is grouped: the five targets first, the rest under Khác', async () => {
    renderWith('Thán thư')
    const select = await screen.findByLabelText('Nhãn bệnh/sâu (Bắt buộc khi Duyệt)')
    const groups = Array.from(select.querySelectorAll('optgroup')).map(g => g.label)
    expect(groups).toEqual(['5 dịch hại chủ lực', 'Khác'])
    expect(select.querySelector('optgroup[label="5 dịch hại chủ lực"] option')).toHaveTextContent('Rầy xanh')
    expect(select.querySelector('optgroup[label="Khác"] option')).toHaveTextContent('Lá khoẻ')
  })

  test('approve without a label shows the Vietnamese message and sends nothing', async () => {
    const fetchMock = renderWith('Thán thư')
    await screen.findByLabelText(/^Tên bệnh đã xác nhận/)
    fireEvent.change(screen.getByLabelText(/Nhập hướng dẫn/), { target: { value: 'Cắt lá bệnh' } })

    fireEvent.click(screen.getByRole('button', { name: 'Phê duyệt' }))

    expect(await screen.findByText('Chọn nhãn bệnh/sâu trước khi xác nhận.')).toBeInTheDocument()
    expect(reviewCalls(fetchMock)).toHaveLength(0)
  })

  test('sends the confirmed name and the label code with the approval', async () => {
    const fetchMock = renderWith('Thán thư')
    fireEvent.change(await screen.findByLabelText(/^Tên bệnh đã xác nhận/), { target: { value: 'Đốm nâu' } })
    fireEvent.change(screen.getByLabelText('Nhãn bệnh/sâu (Bắt buộc khi Duyệt)'), { target: { value: 'green_leafhopper' } })
    fireEvent.change(screen.getByLabelText(/Nhập hướng dẫn/), { target: { value: 'Cắt lá bệnh' } })

    fireEvent.click(screen.getByRole('button', { name: 'Phê duyệt' }))

    await waitFor(() => expect(reviewCalls(fetchMock)).toHaveLength(1))
    expect(JSON.parse(reviewCalls(fetchMock)[0][1].body)).toEqual({
      status: 'CONFIRMED',
      treatment_recommendation: 'Cắt lá bệnh',
      confirmed_diagnosis: 'Đốm nâu',
      confirmed_label_code: 'green_leafhopper',
    })
  })

  test('a failed label load shows its message and blocks approval, but rejection still works', async () => {
    const fetchMock = renderWith('Thán thư', respond({ error: { message: 'x' } }, 500))
    expect(await screen.findByText('Không tải được danh mục nhãn.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Phê duyệt' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Từ chối' }))

    await waitFor(() => expect(reviewCalls(fetchMock)).toHaveLength(1))
    const body = JSON.parse(reviewCalls(fetchMock)[0][1].body)
    expect(body.status).toBe('REJECTED')
    expect(body).not.toHaveProperty('confirmed_label_code')
  })
})

describe('farmer diagnosis screen', () => {
  const parcels = [{ id: 'p1', parcel_code: 'P-1', name: 'Đồi chè' }]

  async function diagnose(data: Record<string, unknown>) {
    global.fetch = jest.fn().mockResolvedValue(respond({ data })) as unknown as typeof fetch
    const { container } = render(<DiagnosisClient initialParcels={parcels} initialHistory={[]} />)
    const file = new File(['x'], 'leaf.jpg', { type: 'image/jpeg' })
    fireEvent.change(container.querySelector('#fileInput')!, { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu chẩn đoán' }))
  }

  test('an uncertain result shows "Không xác định" and that an officer will look', async () => {
    await diagnose({ report_id: 'r1', disease_name: 'Không xác định', confidence_score: 0.41, uncertain: true })

    expect(await screen.findByText('Không xác định')).toBeInTheDocument()
    expect(screen.getByText('Đã gửi cán bộ kỹ thuật xem')).toBeInTheDocument()
  })

  test('a confident result is still presented as sent to an officer', async () => {
    await diagnose({ report_id: 'r1', disease_name: 'Lá khoẻ', confidence_score: 0.988, uncertain: false })

    expect(await screen.findByText('Lá khoẻ')).toBeInTheDocument()
    expect(screen.getByText('Đã gửi cán bộ kỹ thuật xem')).toBeInTheDocument()
  })

  test('a confident result shows its confidence as a percentage and no low-confidence warning', async () => {
    await diagnose({ report_id: 'r1', disease_name: 'Lá khoẻ', confidence_score: 0.988, uncertain: false })

    expect(await screen.findByText('98.8%')).toBeInTheDocument()
    expect(screen.queryByText(/Độ tự tin thấp/)).not.toBeInTheDocument()
  })

  test('a low-confidence result shows the warning', async () => {
    await diagnose({ report_id: 'r1', disease_name: 'Thán thư', confidence_score: 0.41, uncertain: false })

    expect(await screen.findByText('41.0%')).toBeInTheDocument()
    expect(screen.getByText(/Độ tự tin thấp/)).toBeInTheDocument()
  })

  test('history shows the confirmed name over the AI name', () => {
    const history: DiagnosisHistoryItem[] = [
      {
        id: 'r1',
        detection_date: new Date('2026-11-10T00:00:00Z'),
        photo_minio_key: 'k',
        ai_disease_name: 'Thán thư',
        ai_confidence: 0.8,
        confirmed_diagnosis: 'Đốm nâu',
        status: 'CONFIRMED',
        parcel_code: 'P-1',
      },
    ]
    render(<DiagnosisClient initialParcels={parcels} initialHistory={history} />)

    expect(screen.getByText('Đốm nâu (80.0%)')).toBeInTheDocument()
    expect(screen.queryByText(/Thán thư/)).not.toBeInTheDocument()
  })
})
