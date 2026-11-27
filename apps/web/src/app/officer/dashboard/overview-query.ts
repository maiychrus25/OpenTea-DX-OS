// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { prisma } from '@/infrastructure/db/prisma.client'
import { DAY, vietnamDayStart } from '@/components/features/officer-web/overview-data'
import { MinioStorageAdapter } from '@/infrastructure/storage/minio-storage.adapter'

export async function loadOverview(htxProfileId: string, now: Date, requestedPage: number) {
  const tenant = { household: { htx_profile_id: htxProfileId } }
  const journalTenant = { parcel: tenant }
  const today = vietnamDayStart(now)
  const monthStart = new Date(today.getTime() - 29 * DAY)
  const recentStart = new Date(now.getTime() - 7 * DAY)
  const total = await prisma.journalEntry.count({ where: journalTenant })
  const pageCount = Math.max(1, Math.ceil(total / 6))
  const page = Math.min(pageCount, Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1))

  const [entries, pendingEntries, households, diseases, pendingDiseases, cycles, activities, monthlyEntries, approvedEntries, htx] = await Promise.all([
    prisma.journalEntry.findMany({
      where: journalTenant, orderBy: [{ entry_date: 'desc' }, { id: 'desc' }], take: 6, skip: (page - 1) * 6,
      select: { id: true, entry_date: true, activity_type: true, status: true,
        parcel: { select: { parcel_code: true, household: { select: { name: true } } } },
        activities: { select: { product_name: true }, take: 1, orderBy: { created_at: 'asc' } },
      },
    }),
    prisma.journalEntry.findMany({ where: { ...journalTenant, status: 'PENDING_APPROVAL' }, select: { created_at: true }, orderBy: { created_at: 'asc' } }),
    prisma.household.findMany({
      where: { htx_profile_id: htxProfileId }, orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, created_at: true, parcels: {
        orderBy: { parcel_code: 'asc' },
        select: { id: true, parcel_code: true, status: true, area_ha: true, created_at: true,
          journal_entries: { where: { ...journalTenant, entry_date: { gte: recentStart, lte: now } }, select: { id: true }, take: 1 },
          disease_reports: { where: { ...tenant, status: { in: ['PENDING', 'CONFIRMED'] } }, select: { status: true }, take: 1 },
        },
      } },
    }),
    prisma.diseaseReport.findMany({ where: tenant, orderBy: [{ detection_date: 'desc' }, { id: 'desc' }], take: 3,
      select: { id: true, ai_disease_name: true, confirmed_diagnosis: true, ai_confidence: true, detection_date: true, status: true, photo_url: true, photo_minio_key: true, parcel: { select: { parcel_code: true } } },
    }),
    prisma.diseaseReport.findMany({ where: { ...tenant, status: 'PENDING' }, orderBy: { detection_date: 'asc' },
      select: { id: true, detection_date: true, ai_disease_name: true, parcel: { select: { parcel_code: true } }, household: { select: { name: true } } },
    }),
    prisma.parcelCropCycle.findMany({ where: { ...journalTenant, harvested_at: null, estimated_harvest_date: { not: null } }, orderBy: { estimated_harvest_date: 'asc' },
      select: { id: true, parcel_id: true, estimated_harvest_date: true, parcel: { select: { parcel_code: true, household: { select: { name: true } } } } },
    }),
    prisma.journalActivity.findMany({ where: { safe_harvest_date: { not: null }, journal_entry: { ...journalTenant, entry_date: { lte: now }, status: { not: 'REJECTED' } } },
      select: { safe_harvest_date: true, journal_entry: { select: { parcel_id: true } } },
    }),
    prisma.journalEntry.findMany({ where: { ...journalTenant, entry_date: { gte: monthStart, lte: now } }, select: { entry_date: true, activity_type: true } }),
    prisma.journalEntry.findMany({ where: { ...journalTenant, status: 'APPROVED', approved_at: { gte: monthStart, lte: now } }, select: { created_at: true, approved_at: true } }),
    prisma.htxProfile.findUnique({ where: { id: htxProfileId }, select: { name: true, address: true } }),
  ])
  // Reuse the same signing adapter as the disease API; a missing photo never blocks the overview.
  const storage = diseases.some(report => report.photo_minio_key) ? new MinioStorageAdapter() : null
  const reports = await Promise.all(diseases.map(async report => ({
    ...report,
    photo_url: report.photo_minio_key && storage
      ? await storage.getPresignedUrl(report.photo_minio_key).catch(() => report.photo_url)
      : report.photo_url,
  })))
  return { total, page, pageCount, entries, pendingEntries, households, diseases: reports, pendingDiseases, cycles, activities, monthlyEntries, approvedEntries, htx }
}
