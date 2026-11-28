// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { prisma } from '@/infrastructure/db/prisma.client'
import FarmerDashboard from '@/app/farmer/dashboard/page'

jest.mock('next/navigation', () => ({ redirect: jest.fn() }))
jest.mock('@/auth', () => ({ auth: jest.fn().mockResolvedValue({ user: { id: 'u1', role: 'farmer', name: 'Hộ A' } }) }))
jest.mock('@/lib/api/tenant', () => ({
  requireTenant: jest.fn().mockResolvedValue({ userId: 'u1', role: 'farmer', htxCode: 'TC', htxProfileId: 'htx-tc' }),
}))
jest.mock('@/infrastructure/db/prisma.client', () => ({
  prisma: {
    household: { findFirst: jest.fn() },
    weatherCache: { findFirst: jest.fn() },
    journalActivity: { findMany: jest.fn() },
    journalEntry: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    parcelCropCycle: { findMany: jest.fn().mockResolvedValue([]) },
    htxProfile: { findUnique: jest.fn().mockResolvedValue({ name: 'HTX Chè' }) },
  },
}))

const db = prisma as any
const NOW = new Date('2026-11-10T03:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const safeOn = (parcel_code: string, at: Date) => ({ safe_harvest_date: at, journal_entry: { parcel: { parcel_code } } })

beforeEach(() => {
  jest.clearAllMocks()
  db.journalEntry.findMany.mockResolvedValue([])
  db.journalEntry.count.mockResolvedValue(0)
  db.parcelCropCycle.findMany.mockResolvedValue([])
  db.htxProfile.findUnique.mockResolvedValue({ name: 'HTX Chè' })
  jest.useFakeTimers().setSystemTime(NOW)
  db.household.findFirst.mockResolvedValue({
    id: 'hh1',
    parcels: [{ id: 'p1', parcel_code: 'A3', crop_type: 'Chè Trung du', area_ha: 0.5, status: 'TENDING' }],
  })
  db.weatherCache.findFirst.mockResolvedValue(null)
})
afterEach(() => jest.useRealTimers())

test('shows the days left of the latest withdrawal period of a parcel', async () => {
  db.journalActivity.findMany.mockResolvedValue([
    safeOn('A3', new Date(NOW.getTime() + 2 * DAY)),
    safeOn('A3', new Date(NOW.getTime() + 6 * DAY + 60 * 60 * 1000)),
  ])
  render(await FarmerDashboard())

  expect(screen.getByText('Thửa A3 còn 7 ngày cách ly')).toBeInTheDocument()
  const { where } = db.journalActivity.findMany.mock.calls[0][0]
  expect(where.safe_harvest_date).toEqual({ gt: NOW })
  expect(where.journal_entry.parcel.household).toEqual({ id: 'hh1', htx_profile_id: 'htx-tc' })
  expect(where.journal_entry.status).toEqual({ notIn: ['DRAFT', 'REJECTED'] })
})

test('shows nothing when no safe harvest date is in the future', async () => {
  db.journalActivity.findMany.mockResolvedValue([])
  render(await FarmerDashboard())

  expect(screen.getByText('A3')).toBeInTheDocument()
  expect(screen.queryByText(/ngày cách ly/)).not.toBeInTheDocument()
})

test('the reading order puts weather, warning, prices and parcels first then the recent journal', async () => {
  db.journalActivity.findMany.mockResolvedValue([safeOn('A3', new Date(NOW.getTime() + 2 * DAY))])
  render(await FarmerDashboard())
  const blocks = [
    screen.getByRole('region', { name: 'Thời tiết hiện tại' }),
    screen.getByRole('status'),
    screen.getByRole('region', { name: 'Giá búp hôm nay' }),
    screen.getByRole('region', { name: 'Tình trạng thửa đất' }),
    screen.getByRole('region', { name: 'Nhật ký gần đây' }),
  ]
  blocks.slice(1).forEach((block, index) => {
    expect(blocks[index].compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
  expect(screen.getByRole('link', { name: 'Ghi nhật ký mới' })).toHaveAttribute('href', '/farmer/journal/new')
  expect(screen.getByRole('link', { name: 'Xem lịch thu hái' })).toHaveAttribute('href', '/farmer/schedule')
  expect(screen.getByRole('link', { name: 'Xem dự báo' })).toBeInTheDocument()
})

test('reads no withdrawal when the farmer has no household', async () => {
  db.household.findFirst.mockResolvedValue(null)
  render(await FarmerDashboard())

  expect(db.journalActivity.findMany).not.toHaveBeenCalled()
  expect(screen.queryByText(/ngày cách ly/)).not.toBeInTheDocument()
})

test('names the weather in Vietnamese instead of printing its WMO code', async () => {
  db.journalActivity.findMany.mockResolvedValue([])
  db.weatherCache.findFirst.mockResolvedValue({ temperature_c: 24.5, condition: '3', humidity_pct: 80, rainfall_mm: 0 })
  render(await FarmerDashboard())

  expect(screen.getByText('U ám')).toBeInTheDocument()
  expect(screen.queryByText('3')).not.toBeInTheDocument()
})

test('keeps a weather condition that is already text', async () => {
  db.journalActivity.findMany.mockResolvedValue([])
  db.weatherCache.findFirst.mockResolvedValue({ temperature_c: 24.5, condition: 'Trời nắng', humidity_pct: 80, rainfall_mm: 0 })
  render(await FarmerDashboard())

  expect(screen.getByText('Trời nắng')).toBeInTheDocument()
})
