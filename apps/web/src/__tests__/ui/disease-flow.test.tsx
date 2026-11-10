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

describe('officer review form', () => {
  function renderWith(aiName: string) {
    const fetchMock = jest.fn().mockResolvedValueOnce(respond({ data: [report(aiName)] }))
    global.fetch = fetchMock as unknown as typeof fetch
    render(<OfficerDiseaseDetailPage params={{ id: 'd1' }} />)
    return fetchMock
  }

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
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('sends the confirmed name with the approval', async () => {
    const fetchMock = renderWith('Thán thư')
    const input = await screen.findByLabelText(/^Tên bệnh đã xác nhận/)
    fireEvent.change(input, { target: { value: 'Đốm nâu' } })
    fireEvent.change(screen.getByLabelText(/Nhập hướng dẫn/), { target: { value: 'Cắt lá bệnh' } })
    fetchMock.mockResolvedValueOnce(respond({ success: true }))

    fireEvent.click(screen.getByRole('button', { name: 'Phê duyệt' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/api/officer/diseases/d1/review')
    expect(JSON.parse(init.body)).toEqual({
      status: 'CONFIRMED',
      treatment_recommendation: 'Cắt lá bệnh',
      confirmed_diagnosis: 'Đốm nâu',
    })
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
