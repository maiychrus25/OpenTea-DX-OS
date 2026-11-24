// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

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
