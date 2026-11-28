/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { readFileSync } from 'node:fs'
import path from 'node:path'

jest.mock('@/infrastructure/db/agent/PrismaEvidenceReader', () => ({
  findJournalEntryForEvidence: jest.fn(),
  findCropCycleForEvidence: jest.fn(),
  findParcelForEvidence: jest.fn(),
  findDiseaseReportForEvidence: jest.fn(),
  findMarketDataForEvidence: jest.fn(),
  findSensorReadingForEvidence: jest.fn(),
  findWeatherCacheForEvidence: jest.fn(),
  findInputAdvanceForEvidence: jest.fn(),
  findFreshLeafTicketForEvidence: jest.fn(),
}))

import { advanceValues, ticketValues } from '@/application/agent/actions/cross-check-evidence'
import { EVIDENCE_LOADERS } from '@/application/agent/actions/journal-evidence'
import { renderNotification, templatePayloadSchema } from '@/application/agent/actions/message-templates'
import { canonicalJson, sha256Hex } from '@/domain/agent/evidence'
import { KNOWN_AGENTS } from '@/domain/agent/proposal'
import {
  findFreshLeafTicketForEvidence,
  findInputAdvanceForEvidence,
} from '@/infrastructure/db/agent/PrismaEvidenceReader'

// Shared contract with the Python agent (evidence contract version 2).
const vectorsPath = path.resolve(__dirname, '../../../../../../platform/agent/tests/fixtures/evidence-vectors-cross-check.json')
const vectors = JSON.parse(readFileSync(vectorsPath, 'utf8')) as {
  version: number
  cases: { name: string; table: string; source: any; values: unknown; canonical: string; sha256: string }[]
}
const builders: Record<string, (source: any) => Record<string, unknown>> = {
  input_advances: advanceValues,
  fresh_leaf_tickets: ticketValues,
}

describe('evidence contract: cross-check tables (shared vectors)', () => {
  test('the fixture covers both tables', () => {
    expect(vectors.version).toBe(2)
    expect(new Set(vectors.cases.map((c) => c.table))).toEqual(new Set(Object.keys(builders)))
  })

  test.each(vectors.cases.map((c) => [c.name, c] as const))('%s', (_name, vector) => {
    const values = builders[vector.table](vector.source)
    expect(values).toEqual(vector.values)
    expect(canonicalJson(values)).toBe(vector.canonical)
    expect(sha256Hex(vector.canonical)).toBe(vector.sha256)
  })

  test('a Prisma Decimal reads like the number the agent hashed', () => {
    const decimal = { toString: () => '12.3' }
    expect(ticketValues({ ...vectors.cases[2].source, net_kg: decimal })).toEqual(vectors.cases[2].values)
  })
})

describe('evidence loaders', () => {
  test('the cooperative scoped loaders return the contract values, or null when the row is missing', async () => {
    const advance = vectors.cases[0].source
    const ticket = vectors.cases[2].source
    ;(findInputAdvanceForEvidence as jest.Mock).mockResolvedValueOnce(advance).mockResolvedValueOnce(null)
    ;(findFreshLeafTicketForEvidence as jest.Mock).mockResolvedValueOnce(ticket).mockResolvedValueOnce(null)

    expect(await EVIDENCE_LOADERS.input_advances('TC', 'adv_1')).toEqual(vectors.cases[0].values)
    expect(await EVIDENCE_LOADERS.input_advances('LB', 'adv_1')).toBeNull()
    expect(await EVIDENCE_LOADERS.fresh_leaf_tickets('TC', 'tk_1')).toEqual(vectors.cases[2].values)
    expect(await EVIDENCE_LOADERS.fresh_leaf_tickets('LB', 'tk_1')).toBeNull()
    expect(findInputAdvanceForEvidence).toHaveBeenCalledWith('TC', 'adv_1')
  })
})

describe('the cross-check agent and its two templates', () => {
  const schema = templatePayloadSchema('internal')
  const r1 = {
    template: 'advance_without_spraying',
    slots: { household_id: 'hh1', parcel_codes: ['TC-A1', 'TC-A2'], advanced_on: '2026-11-10', grace_days: 10 },
    subjects: ['cross-check:advance:adv1'],
  }
  const r2 = {
    template: 'weighing_over_norm',
    slots: { parcel_code: 'TC-A1', area_ha: 1, kg: 2500, norm_kg: 2430 },
    subjects: ['cross-check:norm:pa1:cy1:0'],
  }

  test('cross-check is a known agent', () => {
    expect(KNOWN_AGENTS).toContain('cross-check')
  })

  test('R1 renders the advance notice, by parcel codes when the household has parcels', () => {
    expect(schema.parse(r1)).toEqual(r1)
    expect(renderNotification(r1.template, r1.slots)).toEqual({
      title: 'Ứng thuốc chưa ghi nhật ký phun',
      body: 'Hộ có thửa TC-A1, TC-A2 nhận vật tư thuốc ngày 10/11/2026 nhưng chưa ghi nhật ký phun sau 10 ngày. Cán bộ kiểm tra giúp.',
    })
    expect(renderNotification(r1.template, { ...r1.slots, parcel_codes: [] }).body).toContain('Hộ mã hh1 nhận')
  })

  test('R2 renders the over-norm notice', () => {
    expect(schema.parse(r2)).toEqual(r2)
    expect(renderNotification(r2.template, r2.slots)).toEqual({
      title: 'Cân búp vượt định mức',
      body: 'Thửa TC-A1 (1 ha) đã cân 2500 kg trong lứa này, vượt định mức 2430 kg. Kiểm tra búp gom từ thửa khác.',
    })
  })

  test.each([
    ['R1 with free text in a slot', { ...r1, slots: { ...r1.slots, household_id: '' } }],
    ['R1 with an extra slot', { ...r1, slots: { ...r1.slots, body: 'x' } }],
    ['R1 with an unsorted parcel list', { ...r1, slots: { ...r1.slots, parcel_codes: ['TC-A2', 'TC-A1'] } }],
    ['R2 with a negative weight', { ...r2, slots: { ...r2.slots, kg: -1 } }],
    ['R2 with a sentence as the parcel code', { ...r2, slots: { ...r2.slots, parcel_code: 'thửa này' } }],
  ])('refuses %s', (_name, payload) => {
    expect(schema.safeParse(payload).success).toBe(false)
  })

  test('the household audience does not accept them', () => {
    expect(templatePayloadSchema('households').safeParse(r1).success).toBe(false)
  })
})
