// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { OfficerJournalApproval, type JournalEntry } from './_components/officer-journal-approval'
import { prisma } from '@/infrastructure/db/prisma.client'
import { requireTenant } from '@/lib/api/tenant'

interface PageProps {
  searchParams: Promise<{ householdId?: string; entryId?: string; create?: string }>
}

export default async function OfficerJournalPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session || session.user?.role !== 'officer') {
    redirect('/login')
  }

  const params = await searchParams
  let selectedEntry: JournalEntry | undefined
  // A dashboard link can point beyond the client list's 1,000-entry limit.
  if (params.entryId) {
    const { htxProfileId } = await requireTenant()
    const entry = await prisma.journalEntry.findFirst({
      where: { id: params.entryId, parcel: { household: { htx_profile_id: htxProfileId }, ...(params.householdId ? { household_id: params.householdId } : {}) } },
      include: { parcel: { select: { parcel_code: true } }, activities: true },
    })
    if (entry) {
      selectedEntry = {
        id: entry.id, parcel_code: entry.parcel.parcel_code, parcel_id: entry.parcel_id,
        activity_type: entry.activity_type, entry_date: entry.entry_date.toISOString(),
        status: entry.status as JournalEntry['status'], performed_by: entry.performed_by,
        notes: entry.notes ?? undefined, weather_temperature: entry.weather_temperature ?? undefined,
        weather_condition: entry.weather_condition ?? undefined, photo_url: entry.photo_url ?? undefined,
        activities: entry.activities.map(activity => ({ activity_detail: activity.activity_detail, product_name: activity.product_name, dosage: activity.dosage, withdrawal_days: activity.withdrawal_days })),
      }
    }
  }
  return <OfficerJournalApproval householdId={params.householdId} selectedEntry={selectedEntry} createOnOpen={params.create === '1'} />
}
