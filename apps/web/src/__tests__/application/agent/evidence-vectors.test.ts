/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { cropCycleValues, isEvidenceStale, journalEntryValues } from '@/application/agent/actions/journal-evidence'
import { canonicalJson, sha256Hex } from '@/domain/agent/evidence'

// Shared contract with the Python agent: the repository root holds platform/agent/tests/fixtures.
const vectorsPath = path.resolve(__dirname, '../../../../../../platform/agent/tests/fixtures/evidence-vectors.json')
const vectors = JSON.parse(readFileSync(vectorsPath, 'utf8')) as {
  version: number
  cases: { name: string; table: string; source: any; values: unknown; canonical: string; sha256: string }[]
}

describe('evidence contract version 2 (shared vectors)', () => {
  test('the fixture is version 2 with four cases', () => {
    expect(vectors.version).toBe(2)
    expect(vectors.cases).toHaveLength(4)
  })

  test.each(vectors.cases.map((c) => [c.name, c] as const))('%s', (_name, vector) => {
    const values =
      vector.table === 'journal_entries' ? journalEntryValues(vector.source) : cropCycleValues(vector.source)

    expect(values).toEqual(vector.values)
    expect(canonicalJson(values)).toBe(vector.canonical)
    expect(sha256Hex(vector.canonical)).toBe(vector.sha256)
  })
})

describe('isEvidenceStale', () => {
  const journal = vectors.cases[0]
  const evidence = {
    rows: [{ table: 'journal_entries', id: journal.source.id, sha256: journal.sha256 }],
    sha256: 'unused',
  }

  test('fresh when the current values still hash to the stored sha256', async () => {
    const loaders = { journal_entries: async () => journal.values as Record<string, unknown> }
    await expect(isEvidenceStale(evidence, 'TC', loaders)).resolves.toBe(false)
  })

  test('stale when the row is missing in this cooperative', async () => {
    const loaders = { journal_entries: async () => null }
    await expect(isEvidenceStale(evidence, 'TC', loaders)).resolves.toBe(true)
  })

  test('stale when the current values differ from the stored sha256', async () => {
    const loaders = { journal_entries: async () => ({ ...(journal.values as object), status: 'APPROVED' }) }
    await expect(isEvidenceStale(evidence, 'TC', loaders)).resolves.toBe(true)
  })

  test('stale when a row names a table the contract does not know', async () => {
    const loaders = { journal_entries: async () => journal.values as Record<string, unknown> }
    await expect(
      isEvidenceStale({ rows: [{ table: 'users', id: 'u1', sha256: 'x' }], sha256: 'unused' }, 'TC', loaders)
    ).resolves.toBe(true)
  })
})
