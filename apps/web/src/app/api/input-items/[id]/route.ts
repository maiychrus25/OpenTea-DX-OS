// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { jsonBody, paramOf } from '@/lib/api/route-helpers'
import { inputItemUpdateSchema } from '@/lib/validations/ledger.schema'
import { ManageInputItemsUseCase } from '@/application/ledger/ManageInputItemsUseCase'
import { PrismaInputRepository } from '@/infrastructure/db/ledger/PrismaInputRepository'

async function updateItem(request: Request, context: unknown) {
  const tenant = await requireTenant()
  const body = inputItemUpdateSchema.parse(await jsonBody(request))
  return NextResponse.json({ data: await new ManageInputItemsUseCase(new PrismaInputRepository()).update(tenant, await paramOf(context), body) })
}

export const PUT = withErrorHandler(updateItem)
