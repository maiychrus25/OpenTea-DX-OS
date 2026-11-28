// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

export const ZALO_TOKEN_KEY_ENV = 'DXOS_ZALO_TOKEN_KEY'

/** The 32-byte key from the environment (64 hex characters or base64). Throws when it is missing or the wrong size, so nothing is stored in clear. */
function loadKey(): Buffer {
  const raw = process.env[ZALO_TOKEN_KEY_ENV]?.trim()
  if (!raw) throw new Error(`${ZALO_TOKEN_KEY_ENV} is not set`)
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error(`${ZALO_TOKEN_KEY_ENV} must be 32 bytes (64 hex characters or base64)`)
  return key
}

/** AES-256-GCM, stored as `v1:<iv>:<tag>:<ciphertext>` in base64. A fresh random IV per value. */
export function encryptToken(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', loadKey(), iv)
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), body.toString('base64')].join(':')
}

export function decryptToken(stored: string): string {
  const [version, iv, tag, body] = stored.split(':')
  if (version !== 'v1' || !iv || !tag || !body) throw new Error('Unreadable Zalo token')
  const decipher = createDecipheriv('aes-256-gcm', loadKey(), Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8')
}
