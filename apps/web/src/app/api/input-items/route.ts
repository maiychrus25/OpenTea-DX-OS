// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { jsonBody } from '@/lib/api/route-helpers'
import { inputItemCreateSchema } from '@/lib/validations/ledger.schema'
import { ManageInputItemsUseCase } from '@/application/ledger/ManageInputItemsUseCase'
import { PrismaInputRepository } from '@/infrastructure/db/ledger/PrismaInputRepository'

const manage = () => new ManageInputItemsUseCase(new PrismaInputRepository())

async function listItems() {
  const tenant = await requireTenant()
  return NextResponse.json({ data: await manage().list(tenant) })
}

async function createItem(request: Request) {
  const tenant = await requireTenant()
  const body = inputItemCreateSchema.parse(await jsonBody(request))
  return NextResponse.json({ data: await manage().create(tenant, body) }, { status: 201 })
}

export const GET = withErrorHandler(listItems)
export const POST = withErrorHandler(createItem)
