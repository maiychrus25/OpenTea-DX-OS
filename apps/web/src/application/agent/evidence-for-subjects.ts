// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { canonicalJson, evidenceDigest, sha256Hex } from '@/domain/agent/evidence'
import type { Evidence, EvidenceRow } from '@/domain/agent/proposal'
import { ValidationError } from '@/domain/errors'
import { getAction } from './action-catalog'
import { EVIDENCE_LOADERS, type EvidenceLoaders } from './actions/journal-evidence'

/**
 * Evidence the web builds itself for a payload a person sent (M14 contract C1): one row per subject of the kind's
 * subject table, hashed the way `isStale` hashes it. A subject outside the cooperative is refused.
 */
export async function evidenceForSubjects(
  kind: string,
  payload: Record<string, unknown>,
  htxCode: string,
  loaders: EvidenceLoaders = EVIDENCE_LOADERS
): Promise<Evidence> {
  const definition = getAction(kind)
  if (!definition) throw new ValidationError('UNKNOWN_KIND')
  const parsed = definition.payloadSchema.safeParse(payload)
  if (!parsed.success) throw new ValidationError('INVALID_PAYLOAD')

  const table = definition.subjectTable
  const rows: EvidenceRow[] = []
  if (table !== null) {
    if (!Object.prototype.hasOwnProperty.call(loaders, table)) throw new ValidationError('INVALID_EVIDENCE_TABLE')
    for (const id of Array.from(new Set(definition.subjects(parsed.data)))) {
      const values = await loaders[table](htxCode, id)
      if (!values) throw new ValidationError('EVIDENCE_NOT_IN_HTX')
      rows.push({ table, id, sha256: sha256Hex(canonicalJson(values)), values })
    }
  }
  return { rows, sha256: evidenceDigest(rows) }
}
