// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { withdrawalEndedScan } from '@/application/zalo/zalo-services'
import { requireZaloCaller } from '@/lib/api/internal-zalo-auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

/** The relay calls this every five minutes. The scan's event key is parcel and day, so a repeat the same day queues nothing. */
async function postZaloTick(request: Request) {
  await requireZaloCaller(request)
  return NextResponse.json({ data: { queued: await withdrawalEndedScan().run() } })
}

export const POST = withErrorHandler(postZaloTick)
