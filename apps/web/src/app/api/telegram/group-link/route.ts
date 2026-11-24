// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { telegramLinkService } from '@/application/telegram/telegram-services'
import { isTelegramConfigured } from '@/application/telegram/telegram-config'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

/** Manager only: a code to send as `/nhom <code>` inside the cooperative's Telegram group. */
async function postTelegramGroupLink() {
  if (!isTelegramConfigured()) {
    return NextResponse.json(
      { error: { code: 'TELEGRAM_NOT_CONFIGURED', message: 'Telegram chưa được cấu hình cho hệ thống này.' } },
      { status: 409 }
    )
  }
  const tenant = await requireTenant()
  if (tenant.role !== 'manager') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, { status: 403 })
  }
  const session = await auth()
  const { code, expiresAt } = await telegramLinkService().createGroupCode({
    userId: tenant.userId,
    userName: session?.user?.name ?? null,
    role: tenant.role,
    htxCode: tenant.htxCode,
  })
  return NextResponse.json(
    { data: { command: `/nhom ${code}`, expires_at: expiresAt.toISOString() } },
    { status: 201 }
  )
}

export const POST = withErrorHandler(postTelegramGroupLink)
