// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { createHash, randomBytes } from 'node:crypto'

export const LINK_CODE_TTL_MS = 10 * 60 * 1000

// Telegram /start payloads allow A-Z, a-z, 0-9, "_" and "-", up to 64 characters.
export function newLinkCode(): string {
  return randomBytes(12).toString('base64url')
}

/** Codes are stored only as this hash, so a database read cannot be replayed into a link. */
export function hashLinkCode(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex')
}
