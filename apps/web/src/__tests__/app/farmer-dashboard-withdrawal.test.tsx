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
  },
}))

const db = prisma as any
const NOW = new Date('2026-11-10T03:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const safeOn = (parcel_code: string, at: Date) => ({ safe_harvest_date: at, journal_entry: { parcel: { parcel_code } } })

beforeEach(() => {
  jest.clearAllMocks()
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
  expect(where.journal_entry.status).toEqual({ not: 'REJECTED' })
})

test('shows nothing when no safe harvest date is in the future', async () => {
  db.journalActivity.findMany.mockResolvedValue([])
  render(await FarmerDashboard())

  expect(screen.getByText('A3')).toBeInTheDocument()
  expect(screen.queryByText(/ngày cách ly/)).not.toBeInTheDocument()
})

test('reads no withdrawal when the farmer has no household', async () => {
  db.household.findFirst.mockResolvedValue(null)
  render(await FarmerDashboard())

  expect(db.journalActivity.findMany).not.toHaveBeenCalled()
  expect(screen.queryByText(/ngày cách ly/)).not.toBeInTheDocument()
})
