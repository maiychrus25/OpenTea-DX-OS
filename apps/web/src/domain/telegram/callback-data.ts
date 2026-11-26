// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * `a` and `r` act on a proposal; `A`, `L` and `D` (M7) act on a campaign: approve all, list items, drop.
 * `b` and `v` (M12) act on a proposal that will run on its own: block it, or view it for a normal decision.
 */
export type CallbackOp = 'a' | 'r' | 'A' | 'L' | 'D' | 'b' | 'v'

/** `proposalId` holds the campaign id for the campaign ops `A`, `L` and `D`. */
export interface ParsedCallbackData {
  proposalId: string
  op: CallbackOp
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const ID_RE = /^[A-Za-z0-9_-]{22}$/
const SIG_RE = /^[A-Za-z0-9_-]{16}$/
const OPS: readonly CallbackOp[] = ['a', 'r', 'A', 'L', 'D', 'b', 'v']

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

// v2 (M5 chat): `v2|<c>|<s>|<sig>`. `c` is the step token of the message (or `menu`), `s` the button step, and the
// signature covers both. The total stays at most 48 bytes: 3 + 11 + 1 + 16 + 1 + 16.
export interface ParsedCallbackDataV2 {
  c: string
  s: string
}

const V2_TOKEN_RE = /^(menu|[A-Za-z0-9_-]{11})$/
const V2_STEP_RE = /^[A-Za-z0-9_.-]{1,16}$/
const V2_SIG_RE = /^[A-Za-z0-9_-]{16}$/

function signatureV2(key: string, c: string, s: string): string {
  return createHmac('sha256', key)
    .update(`v2|${c}|${s}`)
    .digest()
    .subarray(0, 12)
    .toString('base64url')
}

export function signCallbackDataV2(key: string, c: string, s: string): string {
  if (!V2_TOKEN_RE.test(c)) throw new Error('INVALID_CALLBACK_TOKEN')
  if (!V2_STEP_RE.test(s)) throw new Error('INVALID_CALLBACK_STEP')
  return `v2|${c}|${s}|${signatureV2(key, c, s)}`
}

/** Returns the token and step only when the signature matches. Anything else is refused by the caller. */
export function verifyCallbackDataV2(key: string, data: string): ParsedCallbackDataV2 | null {
  const parts = data.split('|')
  if (parts.length !== 4 || parts[0] !== 'v2') return null
  const [, c, s, sig] = parts
  if (!V2_TOKEN_RE.test(c) || !V2_STEP_RE.test(s) || !V2_SIG_RE.test(sig)) return null

  const expected = Buffer.from(signatureV2(key, c, s))
  const actual = Buffer.from(sig)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null

  return { c, s }
}
