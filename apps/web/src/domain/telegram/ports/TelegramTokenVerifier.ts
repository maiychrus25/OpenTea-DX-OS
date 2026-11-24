// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/** Keycloak client of the Telegram relay (`dxos-telegram`). */
export const TELEGRAM_CLIENT_ID = 'dxos-telegram'

export interface VerifiedTelegramToken {
  sub: string
  azp: string
  roles: string[]
}

export interface TelegramTokenVerifier {
  verify(token: string): Promise<VerifiedTelegramToken>
}
