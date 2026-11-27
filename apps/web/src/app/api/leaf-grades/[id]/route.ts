// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { jsonBody, paramOf, requireRole } from '@/lib/api/route-helpers'
import { NotFoundError } from '@/domain/errors'
import { leafGradeUpdateSchema } from '@/lib/validations/weighing.schema'
import { PrismaLeafPriceRepository } from '@/infrastructure/db/weighing/PrismaLeafPriceRepository'

async function updateGrade(request: Request, context: unknown) {
  const tenant = await requireTenant()
  requireRole(tenant, 'manager')
  const body = leafGradeUpdateSchema.parse(await jsonBody(request))
  const grade = await new PrismaLeafPriceRepository().updateGrade(tenant.htxProfileId, await paramOf(context), body)
  if (!grade) throw new NotFoundError('Không tìm thấy phẩm cấp')
  return NextResponse.json({ data: grade })
}

export const PUT = withErrorHandler(updateGrade)
