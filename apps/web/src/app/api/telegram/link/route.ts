// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { telegramLinkService } from '@/application/telegram/telegram-services'
import { isTelegramConfigured, telegramBotUsername } from '@/application/telegram/telegram-config'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

function notConfigured() {
  return NextResponse.json(
    { error: { code: 'TELEGRAM_NOT_CONFIGURED', message: 'Telegram chưa được cấu hình cho hệ thống này.' } },
    { status: 409 }
  )
}

/** Creates a single-use code for the signed-in user. The code is shown once; only its hash is stored. */
async function postTelegramLink() {
  if (!isTelegramConfigured()) return notConfigured()
  const tenant = await requireTenant()
  const session = await auth()
  const { code, expiresAt } = await telegramLinkService().createUserCode({
    userId: tenant.userId,
    userName: session?.user?.name ?? null,
    role: tenant.role,
    htxCode: tenant.htxCode,
  })
  const url = `https://t.me/${telegramBotUsername()}?start=${code}`
  return NextResponse.json({ data: { url, expires_at: expiresAt.toISOString() } }, { status: 201 })
}

async function deleteTelegramLink() {
  const tenant = await requireTenant()
  await telegramLinkService().unlink(tenant.userId)
  return NextResponse.json({ data: { unlinked: true } })
}

export const POST = withErrorHandler(postTelegramLink)
export const DELETE = withErrorHandler(deleteTelegramLink)
