// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ForecastBlock, textBar } from '@/components/features/forecast/ForecastBlock'
import type { ForecastView } from '@/lib/forecast/types'

const forecast: ForecastView = {
  weeks: [
    { week_start: '2026-11-30', fresh_kg: 400, dry_kg: 84.2 },
    { week_start: '2026-12-07', fresh_kg: 200, dry_kg: 42.1 },
  ],
  parcels: [
    { parcel_id: 'p1', parcel_code: 'T-01', harvest_on: '2026-12-02', fresh_kg: 400, dry_kg: 84.2, source: 'HISTORY' },
    { parcel_id: 'p2', parcel_code: 'T-02', harvest_on: '2026-12-09', fresh_kg: 200, dry_kg: 42.1, source: 'NORM' },
  ],
  total_fresh_kg: 600,
  total_dry_kg: 126.3,
}

test('the bar is scaled to the biggest week and is empty for zero', () => {
  expect(textBar(84.2, 84.2)).toHaveLength(12)
  expect(textBar(42.1, 84.2)).toHaveLength(6)
  expect(textBar(0, 84.2)).toBe('')
  expect(textBar(10, 0)).toBe('')
})

test('the totals, the weeks and every parcel with its source are shown', () => {
  render(<ForecastBlock forecast={forecast} />)
  expect(screen.getByText('600,0 kg')).toBeInTheDocument()
  expect(screen.getByText('126,3 kg')).toBeInTheDocument()
  const table = screen.getByRole('table')
  expect(within(table).getAllByRole('row')).toHaveLength(3)
  expect(within(table).getByText('30/11')).toBeInTheDocument()
  const parcels = screen.getByRole('list', { name: 'Dự báo từng thửa' })
  expect(within(parcels).getByText('T-01').closest('li')).toHaveTextContent('Theo lịch sử')
  expect(within(parcels).getByText('T-02').closest('li')).toHaveTextContent('Theo định mức')
})

test('an estimate from the area norm carries its badge; history does not', () => {
  render(<ForecastBlock forecast={forecast} />)
  expect(screen.getAllByText('Theo định mức')).toHaveLength(1)
  expect(screen.getAllByText('Theo lịch sử')).toHaveLength(1)
})

test('no forecast from the server shows its failure state', () => {
  render(<ForecastBlock forecast={null} />)
  expect(screen.getByRole('status')).toHaveTextContent('Chưa tải được dự báo.')
})

test('a forecast with no parcel due in the window says so', () => {
  render(<ForecastBlock forecast={{ weeks: [], parcels: [], total_fresh_kg: 0, total_dry_kg: 0 }} />)
  expect(screen.getByText('Không có lứa nào dự kiến hái trong 14 ngày tới.')).toBeInTheDocument()
})
