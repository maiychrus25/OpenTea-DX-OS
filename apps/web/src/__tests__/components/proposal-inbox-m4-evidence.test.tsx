// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ProposalInbox, type ProposalInboxItem } from '@/components/features/agent/ProposalInbox'

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}))

jest.mock('@/lib/api/redirect-to-login', () => ({
  redirectToLogin: jest.fn(),
}))

// An M4 proposal: its evidence covers the five new tables, shown in Vietnamese with no raw ids or ISO timestamps.
const m4Item: ProposalInboxItem = {
  id: '00000000-0000-0000-0000-000000000042',
  agent: 'disease-watch',
  kind: 'disease.inspection',
  titleVi: 'Đề nghị kiểm tra dịch bệnh',
  reasonVi: 'Ba báo cáo Bọ xít muỗi gần nhau',
  risk: 'medium',
  status: 'proposed',
  createdAt: '2026-11-24T01:00:00.000Z',
  expiresAt: '2026-11-27T01:00:00.000Z',
  preview: [],
  canDecide: true,
  editableFields: [],
  payload: { disease: 'helopeltis', report_ids: ['cmdrA1', 'cmdrA2'], parcel_codes: ['P-TC-003'], radius_m: 2000, days: 7 },
  evidence: {
    rows: [
      {
        table: 'sensor_readings',
        id: 'P-TC-003|soil_moisture|2026-11-24T02:00:00.000Z',
        sha256: 'a',
        values: {
          id: 'P-TC-003|soil_moisture|2026-11-24T02:00:00.000Z',
          parcel_code: 'P-TC-003',
          sensor: 'soil_moisture',
          ts: '2026-11-24T02:00:00.000Z',
          value_milli: 16021,
        },
      },
      {
        table: 'disease_reports',
        id: 'cmdrA1',
        sha256: 'b',
        values: {
          id: 'cmdrA1',
          parcel_id: 'cmpaTC_A3',
          status: 'PENDING',
          detection_date: '2026-11-23T03:20:00.000Z',
          ai_disease_name: 'helopeltis',
          confirmed_diagnosis: null,
          updated_at: '2026-11-23T03:20:01.700Z',
        },
      },
      {
        table: 'parcels',
        id: 'cmpaTC_A3',
        sha256: 'c',
        values: {
          id: 'cmpaTC_A3',
          parcel_code: 'P-TC-003',
          status: 'TENDING',
          harvest_approved_at: null,
          updated_at: '2026-11-24T09:15:30.500Z',
        },
      },
      {
        table: 'weather_cache',
        id: '6f1d0c9e-0000-4000-8000-00000000a001',
        sha256: 'd',
        values: {
          id: '6f1d0c9e-0000-4000-8000-00000000a001',
          parcel_id: 'cmpaTC_A3',
          recorded_at: '2026-11-24T08:00:00.000Z',
          precipitation_milli: 1200,
          forecast_days: ['2026-11-25'],
          forecast_precipitation_milli: [23700],
        },
      },
      {
        table: 'market_data',
        id: '0b4e9f8a-0000-4000-8000-0000000000b1',
        sha256: 'e',
        values: {
          id: '0b4e9f8a-0000-4000-8000-0000000000b1',
          source: 'FAOSTAT',
          commodity: 'Tea',
          metric: 'export_price',
          value_milli: 2350,
          unit: 'USD/kg',
          period: '2026-10',
          fetched_at: '2026-11-24T21:00:05.004Z',
        },
      },
    ],
    sha256: 'f',
  },
}

describe('ProposalInbox evidence of the M4 tables', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [m4Item] }) }) as unknown as typeof fetch
  })

  test('shows each row in Vietnamese with *_milli in its unit', async () => {
    render(<ProposalInbox role="manager" />)

    expect(await screen.findByText('Độ ẩm đất · thửa P-TC-003')).toBeInTheDocument()
    expect(screen.getByText('Giá trị: 16,021 %')).toBeInTheDocument()
    expect(screen.getByText('Báo cáo bệnh · 23/11/2026')).toBeInTheDocument()
    expect(screen.getByText('Bệnh: Bọ xít muỗi')).toBeInTheDocument()
    expect(screen.getByText('Trạng thái: Chờ xác nhận')).toBeInTheDocument()
    expect(screen.getByText('Thửa P-TC-003')).toBeInTheDocument()
    expect(screen.getByText('Trạng thái: Đang chăm sóc')).toBeInTheDocument()
    expect(screen.getByText('Lượng mưa: 1,2 mm')).toBeInTheDocument()
    expect(screen.getByText('Giá xuất khẩu: 2,35 USD/kg')).toBeInTheDocument()
  })

  test('never shows a raw milli integer, a raw ISO timestamp or an internal id', async () => {
    render(<ProposalInbox role="manager" />)
    await screen.findByText('Độ ẩm đất · thửa P-TC-003')

    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/_milli|16021|23700/)
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)
    expect(text).not.toContain('cmdrA1')
    expect(text).not.toContain('cmpaTC_A3')
  })
})
