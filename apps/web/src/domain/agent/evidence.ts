// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { createHash } from 'node:crypto'
import type { EvidenceRow } from './proposal'

/**
 * Deterministic JSON serialization for cross-language evidence hashing.
 * Python `json.dumps(v, sort_keys=True, separators=(',', ':'), ensure_ascii=False)`
 * produces the same string; M1c's agent must use exactly that.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error('Non-integer number in canonicalJson')
    return JSON.stringify(value)
  }
  if (value instanceof Date) return JSON.stringify(value.toISOString())
  if (Array.isArray(value)) {
    return '[' + value.map((item) => (item === undefined ? 'null' : canonicalJson(item))).join(',') + ']'
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj).sort()
    const parts: string[] = []
    for (const key of keys) {
      const prop = obj[key]
      if (prop === undefined) continue
      parts.push(`${JSON.stringify(key)}:${canonicalJson(prop)}`)
    }
    return `{${parts.join(',')}}`
  }
  throw new Error(`Unsupported value type in canonicalJson: ${typeof value}`)
}

/** UTC with milliseconds; a value without an offset (as Hasura returns it) is already UTC. */
export function utcTimestamp(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  const hasOffset = /(Z|[+-]\d{2}:?\d{2})$/i.test(value)
  return new Date(hasOffset ? value : `${value}Z`).toISOString()
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

export function evidenceDigest(rows: readonly EvidenceRow[]): string {
  return sha256Hex(canonicalJson(rows.map((r) => ({ table: r.table, id: r.id, sha256: r.sha256 }))))
}
