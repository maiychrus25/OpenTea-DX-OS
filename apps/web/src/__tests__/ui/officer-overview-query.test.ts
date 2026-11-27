// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { loadOverview } from '@/app/officer/dashboard/overview-query'
import { prisma } from '@/infrastructure/db/prisma.client'
import { MinioStorageAdapter } from '@/infrastructure/storage/minio-storage.adapter'
import OfficerJournalPage from '@/app/officer/journal/page'
import { auth } from '@/auth'
import { requireTenant } from '@/lib/api/tenant'

jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/api/tenant', () => ({ requireTenant: jest.fn() }))
jest.mock('next/navigation', () => ({ redirect: jest.fn(() => { throw new Error('redirect') }) }))

jest.mock('@/infrastructure/db/prisma.client', () => ({ prisma: {
  journalEntry: { count: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() }, household: { findMany: jest.fn() },
  diseaseReport: { findMany: jest.fn() }, parcelCropCycle: { findMany: jest.fn() }, journalActivity: { findMany: jest.fn() },
  htxProfile: { findUnique: jest.fn() },
} }))
jest.mock('@/infrastructure/storage/minio-storage.adapter', () => ({ MinioStorageAdapter: jest.fn() }))
const db = prisma as unknown as {
  journalEntry: { count: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock }; household: { findMany: jest.Mock };
  diseaseReport: { findMany: jest.Mock }; parcelCropCycle: { findMany: jest.Mock }; journalActivity: { findMany: jest.Mock };
  htxProfile: { findUnique: jest.Mock };
}
const now = new Date('2026-11-27T08:00:00Z')
beforeEach(() => {
  jest.clearAllMocks()
  db.journalEntry.count.mockResolvedValue(13)
  for (const model of [db.journalEntry, db.household, db.diseaseReport, db.parcelCropCycle, db.journalActivity]) model.findMany.mockResolvedValue([])
  db.htxProfile.findUnique.mockResolvedValue({ name: 'HTX', address: 'Vùng chè' })
})

describe('journal dashboard deep link tenant scope', () => {
  it('loads a selected entry only within the current tenant and optional household', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { role: 'officer' } })
    ;(requireTenant as jest.Mock).mockResolvedValue({ htxProfileId: 'tenant-a' })
    db.journalEntry.findFirst.mockResolvedValue({ id: 'older', parcel_id: 'p1', parcel: { parcel_code: 'P1' }, activity_type: 'OTHER', entry_date: now, status: 'APPROVED', activities: [], notes: 'Detail' })
    const page = await OfficerJournalPage({ searchParams: Promise.resolve({ entryId: 'older', householdId: 'household-a' }) })
    expect(db.journalEntry.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'older', parcel: { household: { htx_profile_id: 'tenant-a' }, household_id: 'household-a' } } }))
    expect(page.props.selectedEntry).toMatchObject({ id: 'older', entry_date: now.toISOString(), notes: 'Detail' })
  })
  it('never passes a foreign or deleted selected entry to the client', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { role: 'officer' } })
    ;(requireTenant as jest.Mock).mockResolvedValue({ htxProfileId: 'tenant-a' })
    db.journalEntry.findFirst.mockResolvedValue(null)
    const page = await OfficerJournalPage({ searchParams: Promise.resolve({ entryId: 'foreign' }) })
    expect(page.props.selectedEntry).toBeUndefined()
  })
})

describe('officer overview tenant data', () => {
  it('scopes every query and pages six entries with stable ordering and clamped page', async () => {
    const result = await loadOverview('tenant-a', now, 99)
    expect(result).toMatchObject({ page: 3, pageCount: 3, total: 13 })
    expect(db.journalEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 6, skip: 12, orderBy: [{ entry_date: 'desc' }, { id: 'desc' }] }))
    for (const model of [db.journalEntry, db.household, db.diseaseReport, db.parcelCropCycle, db.journalActivity]) {
      for (const [query] of model.findMany.mock.calls) expect(JSON.stringify(query.where)).toContain('tenant-a')
    }
    expect(db.journalEntry.count).toHaveBeenCalledWith({ where: { parcel: { household: { htx_profile_id: 'tenant-a' } } } })
    expect(db.htxProfile.findUnique).toHaveBeenCalledWith({ where: { id: 'tenant-a' }, select: { name: true, address: true } })
  })
  it.each([NaN, -1, Infinity, 0, 1.2])('normalizes invalid page %s', async page => {
    expect((await loadOverview('tenant-a', now, page)).page).toBe(1)
  })
  it('keeps overdue outstanding plans available for safety comparison and excludes harvested cycles', async () => {
    await loadOverview('tenant-a', now, 1)
    expect(db.parcelCropCycle.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      parcel: { household: { htx_profile_id: 'tenant-a' } }, harvested_at: null, estimated_harvest_date: { not: null },
    } }))
  })
  it('refreshes stored photo keys and tolerates unavailable storage', async () => {
    const sign = jest.fn().mockResolvedValueOnce('/signed-photo').mockRejectedValueOnce(new Error('offline'))
    ;(MinioStorageAdapter as jest.Mock).mockImplementation(() => ({ getPresignedUrl: sign }))
    db.diseaseReport.findMany.mockImplementation(query => query.take ? Promise.resolve([
      { id: 'a', photo_minio_key: 'key-a', photo_url: '/old-a' },
      { id: 'b', photo_minio_key: 'key-b', photo_url: '/old-b' },
    ]) : Promise.resolve([]))
    const result = await loadOverview('tenant-a', now, 1)
    expect(result.diseases.map(report => report.photo_url)).toEqual(['/signed-photo', '/old-b'])
  })
})
