// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { fireEvent, render, screen, within } from '@testing-library/react'
import { HarvestCalendar } from '@/components/features/schedule/HarvestCalendar'

jest.mock('swr', () => ({
  __esModule: true,
  default: (key: string | null) => ({
    data: { data: key?.startsWith('/api/schedule/harvest?') ? [{
      cycleId: 'cycle-1', parcelId: 'parcel-1', parcelName: 'T-01', householdName: 'Nông hộ A', cropType: 'Chè',
      estimatedHarvestDate: '2026-11-28T00:00:00', safeHarvestDate: '2026-11-30T00:00:00',
      treatment: { activity: 'SPRAYING', date: '2026-11-27T00:00:00', withdrawalDays: 3 },
      parcelStatus: 'TENDING', canApprove: false,
    }] : [] },
    mutate: jest.fn(),
  }),
}))

beforeEach(() => {
  jest.useFakeTimers()
  jest.setSystemTime(new Date('2026-11-28T12:00:00'))
})
afterEach(() => jest.useRealTimers())

test('farmer markers occupy individual days and open that day with the selected parcel', () => {
  const { container } = render(<HarvestCalendar userRole="FARMER" />)
  expect(container.firstChild).toHaveClass('farmer')
  expect(Array.from(container.querySelectorAll('.weekdays span')).map(day => day.textContent))
    .toEqual(['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'])
  expect(Array.from(container.querySelectorAll('.stats dd')).map(stat => stat.textContent)).toEqual(['1', '1', '0'])
  const markers = Array.from(container.querySelectorAll<HTMLButtonElement>('.bar'))
  expect(markers).toHaveLength(4)
  expect(markers.every(marker => marker.style.gridColumn.endsWith('/ span 1'))).toBe(true)
  expect(markers.every(marker => marker.getAttribute('aria-label') === 'T-01')).toBe(true)
  fireEvent.click(markers.find(marker => marker.style.gridColumn === '7 / span 1')!)
  const detail = within(screen.getByRole('region', { name: 'Chi tiết ngày' }))
  expect(detail.getByRole('heading', { name: 'Chi tiết ngày 29/11/2026' })).toBeInTheDocument()
  expect(detail.getByText('Có thửa đang trong thời gian cách ly, không được thu hái.')).toBeInTheDocument()
  expect(detail.getByText('Nông hộ A')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Đổi ngày' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Nghiệm thu đạt cách ly' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Tháng sau' }))
  expect(screen.getByRole('heading', { name: 'Tháng 12, 2026' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Hôm nay' }))
  expect(screen.getByRole('button', { name: 'Ngày 28/11' })).toHaveAttribute('aria-pressed', 'true')
})

test.each(['OFFICER', 'MANAGER'] as const)('%s retains spanning bars, full weekdays and existing actions', role => {
  const { container } = render(<HarvestCalendar userRole={role} />)
  expect(container.firstChild).not.toHaveClass('farmer')
  expect(screen.getByText('Thứ Hai')).toBeInTheDocument()
  const bars = container.querySelectorAll<HTMLButtonElement>('.bar')
  expect(bars).toHaveLength(2)
  expect(bars[0].style.gridColumn).toBe('5 / span 3')
  expect(bars[0]).toHaveAccessibleName('T-01')
  expect(screen.getByRole('button', { name: 'Nghiệm thu đạt cách ly' })).toBeDisabled()
  if (role === 'MANAGER') {
    expect(screen.getByRole('button', { name: 'Đổi ngày' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Thêm lứa hái' })).toBeInTheDocument()
  } else {
    expect(screen.queryByRole('button', { name: 'Đổi ngày' })).not.toBeInTheDocument()
  }
})
