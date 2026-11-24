// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { createHmac, timingSafeEqual } from 'node:crypto'

export type CallbackOp = 'a' | 'r'

export interface ParsedCallbackData {
  proposalId: string
  op: CallbackOp
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const ID_RE = /^[A-Za-z0-9_-]{22}$/
const SIG_RE = /^[A-Za-z0-9_-]{16}$/
const OPS: readonly CallbackOp[] = ['a', 'r']

function uuidToBase64Url(uuid: string): string {
  return Buffer.from(uuid.replace(/-/g, ''), 'hex').toString('base64url')
}

function base64UrlToUuid(id: string): string {
  const hex = Buffer.from(id, 'base64url').toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function signature(key: string, proposalIdB64: string, op: CallbackOp): string {
  return createHmac('sha256', key)
    .update(`v1|${proposalIdB64}|${op}`)
    .digest()
    .subarray(0, 12)
    .toString('base64url')
}

/** `v1|<proposal id, base64url>|<op>|<sig>`: 44 bytes, well under Telegram's 64-byte limit. */
export function signCallbackData(key: string, proposalId: string, op: CallbackOp): string {
  if (!UUID_RE.test(proposalId)) throw new Error('INVALID_PROPOSAL_ID')
  const idB64 = uuidToBase64Url(proposalId)
  return `v1|${idB64}|${op}|${signature(key, idB64, op)}`
}

/** Returns the proposal id only when the signature matches. Anything else is refused by the caller. */
export function verifyCallbackData(key: string, data: string): ParsedCallbackData | null {
  const parts = data.split('|')
  if (parts.length !== 4 || parts[0] !== 'v1') return null
  const [, idB64, op, sig] = parts
  if (!ID_RE.test(idB64) || !SIG_RE.test(sig) || !OPS.includes(op as CallbackOp)) return null

  const expected = Buffer.from(signature(key, idB64, op as CallbackOp))
  const actual = Buffer.from(sig)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null

  return { proposalId: base64UrlToUuid(idB64), op: op as CallbackOp }
}
