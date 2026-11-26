// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { readFile } from 'node:fs/promises'
import { parseEnvFile, ROLES_ENV_FILE } from '@/infrastructure/auth/dxos-web-roles.client'

/** Telegram is optional: without the bot username and the callback key the web behaves as before. */
export function telegramBotUsername(): string | null {
  return process.env.TELEGRAM_BOT_USERNAME?.trim() || null
}

export function telegramCallbackKey(): string | null {
  return process.env.DXOS_TELEGRAM_CALLBACK_KEY || null
}

export function isTelegramConfigured(): boolean {
  return Boolean(telegramBotUsername() && telegramCallbackKey())
}

/**
 * The derived Mini App key (hex): the environment first, else the roles file `./dxos telegram enable` writes
 * (cached 60 s, so a later `enable` works without a restart). The bot token itself never reaches the web.
 */
let cachedKey: { value: string | null; at: number } | null = null

export async function telegramWebAppKey(now: () => number = Date.now): Promise<string | null> {
  const fromEnv = process.env.DXOS_TELEGRAM_WEBAPP_KEY
  if (fromEnv) return fromEnv
  if (cachedKey && now() - cachedKey.at < 60_000) return cachedKey.value
  let value: string | null = null
  try {
    value = parseEnvFile(await readFile(ROLES_ENV_FILE, 'utf8')).DXOS_TELEGRAM_WEBAPP_KEY || null
  } catch {
    // Missing or unreadable file: Telegram is not enabled.
  }
  cachedKey = { value, at: now() }
  return value
}

/** Test seam: forget the cached file read. */
export function resetTelegramWebAppKeyCache(): void {
  cachedKey = null
}
