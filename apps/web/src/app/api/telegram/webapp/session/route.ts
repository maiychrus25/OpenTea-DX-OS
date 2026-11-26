// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { telegramRepository } from '@/application/telegram/telegram-services'
import { telegramWebAppKey } from '@/application/telegram/telegram-config'
import {
  signWebAppCookie,
  validateInitData,
  WEBAPP_COOKIE_NAME,
  WEBAPP_COOKIE_TTL_MS,
} from '@/domain/telegram/webapp-init-data'
import { UnauthorizedError } from '@/domain/errors'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

const bodySchema = z.object({ init_data: z.string().min(1).max(8192) })

function refuse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status })
}

/**
 * Binds the Telegram account of a signed `initData` to the signed-in session. `initData` is never a login:
 * it must name the account linked to this user.
 */
async function postWebAppSession(req: Request) {
  const key = await telegramWebAppKey()
  if (!key) return refuse(404, 'WEBAPP_DISABLED', 'Telegram Mini App chưa được bật.')
  const userId = (await auth())?.user?.id
  if (!userId) throw new UnauthorizedError()

  const body = bodySchema.safeParse(await req.json().catch(() => null))
  if (!body.success) return refuse(400, 'WEBAPP_INVALID', 'Dữ liệu Telegram không hợp lệ.')
  const now = new Date()
  const init = validateInitData(body.data.init_data, key, now)
  if (!init.ok) return refuse(400, 'WEBAPP_INVALID', 'Dữ liệu Telegram không hợp lệ.')

  const link = await telegramRepository().activeUserLinkByUser(userId)
  if (!link || link.telegramUserId !== init.telegramUserId) {
    return refuse(403, 'WEBAPP_NOT_LINKED', 'Tài khoản Telegram này chưa liên kết với tài khoản đang đăng nhập.')
  }

  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET is not set')
  const response = NextResponse.json({ data: { telegram_user_id: Number(init.telegramUserId) } })
  response.cookies.set(WEBAPP_COOKIE_NAME, signWebAppCookie({ telegramUserId: init.telegramUserId, userId }, secret, now), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: WEBAPP_COOKIE_TTL_MS / 1000,
  })
  return response
}

export const POST = withErrorHandler(postWebAppSession)
