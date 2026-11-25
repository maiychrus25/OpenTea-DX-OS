/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  diseaseReportValues,
  marketDataValues,
  parcelValues,
  sensorReadingValues,
  weatherCacheValues,
} from '@/application/agent/actions/field-evidence'
import { canonicalJson, sha256Hex } from '@/domain/agent/evidence'

// Shared contract with the Python agent (evidence contract version 2 plus the M4 rules and cases).
const vectorsPath = path.resolve(__dirname, '../../../../../../platform/agent/tests/fixtures/evidence-vectors-m4.json')
const vectors = JSON.parse(readFileSync(vectorsPath, 'utf8')) as {
  version: number
  cases: { name: string; table: string; source: any; values: unknown; canonical: string; sha256: string }[]
}

const builders: Record<string, (source: any) => Record<string, unknown>> = {
  parcels: parcelValues,
  disease_reports: diseaseReportValues,
  sensor_readings: sensorReadingValues,
  weather_cache: weatherCacheValues,
  market_data: marketDataValues,
}

describe('evidence contract M4 (shared vectors)', () => {
  test('the fixture is version 2 and covers the five M4 tables', () => {
    expect(vectors.version).toBe(2)
    expect(new Set(vectors.cases.map((c) => c.table))).toEqual(new Set(Object.keys(builders)))
  })

  test.each(vectors.cases.map((c) => [c.name, c] as const))('%s', (_name, vector) => {
    const values = builders[vector.table](vector.source)

    expect(values).toEqual(vector.values)
    expect(canonicalJson(values)).toBe(vector.canonical)
    expect(sha256Hex(vector.canonical)).toBe(vector.sha256)
  })
})
