// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { prisma } from '@/infrastructure/db/prisma.client'

// Scoped by cooperative: a record of another HTX reads as missing, which makes the evidence stale.
export function findJournalEntryForEvidence(htxCode: string, id: string) {
  return prisma.journalEntry.findFirst({
    where: { id, parcel: { household: { htx_profile: { htx_code: htxCode } } } },
    include: { activities: true },
  })
}

export function findCropCycleForEvidence(htxCode: string, id: string) {
  return prisma.parcelCropCycle.findFirst({
    where: { id, parcel: { household: { htx_profile: { htx_code: htxCode } } } },
  })
}
