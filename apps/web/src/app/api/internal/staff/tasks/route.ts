// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { StaffSyncUseCase } from '@/application/agent/staff/StaffSyncUseCase'
import { PrismaCampaignCandidateSource } from '@/infrastructure/db/agent/PrismaCampaignCandidateSource'
import { PrismaStaffSyncRepository } from '@/infrastructure/db/agent/PrismaStaffSyncRepository'
import { requireStaffCaller } from '@/lib/api/internal-staff-auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

/** The approved staff tasks the staff app has not acknowledged yet (contract C3). */
async function getStaffTasks(request: Request) {
  const caller = await requireStaffCaller(request)
  const source = new PrismaCampaignCandidateSource()
  const tasks = await new StaffSyncUseCase(new PrismaStaffSyncRepository(), (htx, ids) => source.parcelCodesByIds(htx, ids)).tasks(
    caller.htxCode
  )
  return NextResponse.json({ data: { tasks } })
}

export const GET = withErrorHandler(getStaffTasks)
