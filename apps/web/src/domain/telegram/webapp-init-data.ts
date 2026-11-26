// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { createHmac, timingSafeEqual } from 'node:crypto'

/** Telegram's `initData` is at most a day old when we accept it. */
export const INIT_DATA_MAX_AGE_SECONDS = 24 * 3600
/** The binding cookie lives twelve hours. */
export const WEBAPP_COOKIE_TTL_MS = 12 * 3600 * 1000
export const WEBAPP_COOKIE_NAME = 'dxos_tg_webapp'

export type InitDataResult = { ok: true; telegramUserId: string } | { ok: false; reason: 'invalid' }

/** The derived Mini App key, as `./dxos telegram enable` writes it: hex of HMAC_SHA256("WebAppData", bot token). */
export function webAppKeyFromBotToken(botToken: string): string {
  return createHmac('sha256', 'WebAppData').update(botToken).digest('hex')
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

/** Telegram's published check: sorted `key=value` lines without `hash`, HMAC-SHA256 with the derived key. */
export function validateInitData(raw: string, webAppKeyHex: string, now: Date): InitDataResult {
  const invalid = { ok: false, reason: 'invalid' } as const
  const params = new URLSearchParams(raw)
  const hash = params.get('hash')
  if (!hash) return invalid
  params.delete('hash')
  const check = Array.from(params.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  const expected = createHmac('sha256', Buffer.from(webAppKeyHex, 'hex')).update(check).digest('hex')
  if (!safeEqual(hash, expected)) return invalid

  const authDate = Number(params.get('auth_date'))
  const age = Math.floor(now.getTime() / 1000) - authDate
  if (!Number.isInteger(authDate) || age > INIT_DATA_MAX_AGE_SECONDS) return invalid

  const userJson = params.get('user')
  if (!userJson) return invalid
  try {
    const id = (JSON.parse(userJson) as { id?: unknown }).id
    return typeof id === 'number' && Number.isSafeInteger(id) ? { ok: true, telegramUserId: String(id) } : invalid
  } catch {
    return invalid
  }
}

export interface WebAppBinding {
  telegramUserId: string
  userId: string
}

function cookieSignature(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(`webapp|${payload}`).digest('base64url')
}

/** `<telegram_user_id>.<user_id>.<expires>.<sig>`; ids hold no dots (numeric Telegram id, Keycloak uuid). */
export function signWebAppCookie(binding: WebAppBinding, secret: string, now: Date): string {
  const payload = `${binding.telegramUserId}.${binding.userId}.${now.getTime() + WEBAPP_COOKIE_TTL_MS}`
  return `${payload}.${cookieSignature(secret, payload)}`
}

export function verifyWebAppCookie(value: string, secret: string, now: Date): WebAppBinding | null {
  const parts = value.split('.')
  if (parts.length !== 4) return null
  const [telegramUserId, userId, expires, sig] = parts
  if (!safeEqual(sig, cookieSignature(secret, `${telegramUserId}.${userId}.${expires}`))) return null
  if (!(Number(expires) > now.getTime())) return null
  return { telegramUserId, userId }
}
