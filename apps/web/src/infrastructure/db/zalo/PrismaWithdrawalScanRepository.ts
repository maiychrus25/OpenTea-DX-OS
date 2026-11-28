// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { endOfVnDay } from '@/application/weighing/withdrawal-gate'
import { vnDayStart } from '@/application/agent/campaign/vn-day'
import type { WithdrawalCandidate, WithdrawalScanPort } from '@/application/zalo/WithdrawalEndedScan'
import { WITHDRAWAL_EXCLUDED_STATUSES } from '@/domain/journal/withdrawal-status'
import { prisma } from '@/infrastructure/db/prisma.client'

const DAY_MS = 24 * 60 * 60 * 1000

/** Reads the sprayings whose safe date is the given Vietnam day, then every counted spraying of those parcels. */
export class PrismaWithdrawalScanRepository implements WithdrawalScanPort {
  async candidates(day: string): Promise<WithdrawalCandidate[]> {
    const start = vnDayStart(day)
    const end = endOfVnDay(day)
    const counted = { status: { notIn: [...WITHDRAWAL_EXCLUDED_STATUSES] }, entry_date: { lte: end } }
    const endingToday = await prisma.journalEntry.findMany({
      where: { ...counted, activities: { some: { safe_harvest_date: { gte: start, lt: new Date(start.getTime() + DAY_MS) } } } },
      select: { parcel_id: true },
      distinct: ['parcel_id'],
    })
    if (endingToday.length === 0) return []

    const parcels = await prisma.parcel.findMany({
      where: { id: { in: endingToday.map((e) => e.parcel_id) }, household: { htx_profile_id: { not: null } } },
      select: {
        id: true, parcel_code: true, household_id: true,
        household: { select: { htx_profile: { select: { htx_code: true } } } },
        journal_entries: {
          where: { ...counted, activities: { some: { safe_harvest_date: { not: null } } } },
          select: { status: true, entry_date: true, cycle_id: true, activities: { where: { safe_harvest_date: { not: null } }, select: { safe_harvest_date: true } } },
        },
      },
    })
    return parcels.flatMap((p) =>
      p.household.htx_profile
        ? [{ parcelId: p.id, parcelCode: p.parcel_code, householdId: p.household_id, htxCode: p.household.htx_profile.htx_code, entries: p.journal_entries }]
        : [],
    )
  }
}
