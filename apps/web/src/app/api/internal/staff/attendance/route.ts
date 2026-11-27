// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { attendanceBodySchema, StaffSyncUseCase } from '@/application/agent/staff/StaffSyncUseCase'
import { PrismaStaffSyncRepository } from '@/infrastructure/db/agent/PrismaStaffSyncRepository'
import { requireStaffCaller } from '@/lib/api/internal-staff-auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { labsOnly } from '@/lib/labs'

/** The staff app reports how many people are present today (contract C3). */
async function putStaffAttendance(request: Request) {
  const caller = await requireStaffCaller(request)
  const body = attendanceBodySchema.parse(await request.json().catch(() => null))
  await new StaffSyncUseCase(new PrismaStaffSyncRepository(), async () => new Map()).saveAttendance(caller.htxCode, body)
  return NextResponse.json({ data: { day: body.day, present: body.present } })
}

export const PUT = withErrorHandler(labsOnly(putStaffAttendance))
