// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { jsonBody, requireRole } from '@/lib/api/route-helpers'
import { leafGradeCreateSchema } from '@/lib/validations/weighing.schema'
import { PrismaLeafPriceRepository } from '@/infrastructure/db/weighing/PrismaLeafPriceRepository'

async function listGrades() {
  const tenant = await requireTenant()
  return NextResponse.json({ data: await new PrismaLeafPriceRepository().listGrades(tenant.htxProfileId) })
}

async function createGrade(request: Request) {
  const tenant = await requireTenant()
  requireRole(tenant, 'manager')
  const body = leafGradeCreateSchema.parse(await jsonBody(request))
  return NextResponse.json({ data: await new PrismaLeafPriceRepository().createGrade(tenant.htxProfileId, body) }, { status: 201 })
}

export const GET = withErrorHandler(listGrades)
export const POST = withErrorHandler(createGrade)
