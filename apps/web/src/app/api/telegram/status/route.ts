// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { telegramLinkService } from '@/application/telegram/telegram-services'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

async function getTelegramStatus() {
  const tenant = await requireTenant()
  const status = await telegramLinkService().status({
    userId: tenant.userId,
    userName: null,
    role: tenant.role,
    htxCode: tenant.htxCode,
  })
  return NextResponse.json({ data: status })
}

export const GET = withErrorHandler(getTelegramStatus)
