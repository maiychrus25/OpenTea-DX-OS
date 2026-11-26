// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { rosterBodySchema, StaffSyncUseCase } from '@/application/agent/staff/StaffSyncUseCase'
import { PrismaStaffSyncRepository } from '@/infrastructure/db/agent/PrismaStaffSyncRepository'
import { requireStaffCaller } from '@/lib/api/internal-staff-auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

/** The staff app replaces its cooperative's roster; rows it no longer lists become inactive (contract C3). */
async function putStaffRoster(request: Request) {
  const caller = await requireStaffCaller(request)
  const body = rosterBodySchema.parse(await request.json().catch(() => null))
  await new StaffSyncUseCase(new PrismaStaffSyncRepository(), async () => new Map()).replaceRoster(caller.htxCode, body)
  return NextResponse.json({ data: { staff: body.staff.length } })
}

export const PUT = withErrorHandler(putStaffRoster)
