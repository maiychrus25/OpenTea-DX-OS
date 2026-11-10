// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { lotStatusLabel } from '@/domain/lot/lot-status-label'
import { diseaseStatusLabel } from '@/domain/disease/disease-status-label'
import { TraceView } from '@/app/lot/[lot_code]/_components/TraceView'
import type { LotTraceData } from '@/domain/entities/lot-trace-data'

describe('lotStatusLabel', () => {
  it.each([
    ['DRAFT', 'Bản nháp'],
    ['READY', 'Sẵn sàng'],
    ['QR_EXPORTED', 'Đã xuất QR'],
  ])('%s → %s', (status, label) => expect(lotStatusLabel(status)).toBe(label))

  it('keeps an unknown status as it is', () => expect(lotStatusLabel('ARCHIVED')).toBe('ARCHIVED'))
})

describe('diseaseStatusLabel', () => {
  it.each([
    ['PENDING', 'Chờ duyệt', 'amber'],
    ['CONFIRMED', 'Đã xác nhận', 'green'],
    ['REJECTED', 'Bị từ chối', 'neutral'],
  ])('%s → %s', (status, label, tone) => expect(diseaseStatusLabel(status)).toEqual({ label, tone }))

  it('keeps an unknown status as it is', () => expect(diseaseStatusLabel('OTHER')).toEqual({ label: 'OTHER', tone: 'neutral' }))
})

describe('TraceView status pill', () => {
  const data = {
    lot_code: 'TC-CHE-A3-001', commodity: 'Chè', quality_grade: 'Loại 1', status: 'QR_EXPORTED',
    packaging_date: new Date('2026-10-11'), packaging_spec: null, total_weight_kg: 24, qr_image_url: null,
    created_at: new Date('2026-10-12'), is_harvest_safe: true, latest_safe_harvest_date: null,
    parcels: [], journal_summaries: [], certificate_keys: [], htx_name: 'HTX Chè Tân Cương',
  } as unknown as LotTraceData

  it('shows the exported status in Vietnamese', () => {
    render(<TraceView data={data} />)
    expect(screen.getByText('Đã xuất QR')).toBeInTheDocument()
    expect(screen.queryByText('QR_EXPORTED')).not.toBeInTheDocument()
  })

  it('shows a lot that is not exported yet as Sẵn sàng', () => {
    render(<TraceView data={{ ...data, status: 'READY' }} />)
    expect(screen.getByText('Sẵn sàng')).toBeInTheDocument()
  })
})
