// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { BANKS } from '@/domain/payment/vietqr'

async function listBanks() {
  await requireTenant()
  return NextResponse.json({ data: BANKS })
}

export const GET = withErrorHandler(listBanks)
