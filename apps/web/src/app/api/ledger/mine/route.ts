// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { ReadLedgerUseCase } from '@/application/ledger/ReadLedgerUseCase'
import { PrismaLedgerRepository } from '@/infrastructure/db/ledger/PrismaLedgerRepository'

async function mine() {
  const tenant = await requireTenant()
  return NextResponse.json({ data: await new ReadLedgerUseCase(new PrismaLedgerRepository()).mine(tenant) })
}

export const GET = withErrorHandler(mine)
