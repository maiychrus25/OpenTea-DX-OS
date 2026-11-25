// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { canonicalJson, sha256Hex, utcTimestamp } from '@/domain/agent/evidence'
import type { Evidence, EvidenceRow } from '@/domain/agent/proposal'
import {
  findCropCycleForEvidence,
  findDiseaseReportForEvidence,
  findJournalEntryForEvidence,
  findMarketDataForEvidence,
  findParcelForEvidence,
  findSensorReadingForEvidence,
  findWeatherCacheForEvidence,
} from '@/infrastructure/db/agent/PrismaEvidenceReader'
import {
  diseaseReportValues,
  marketDataValues,
  parcelValues,
  sensorReadingValues,
  weatherCacheValues,
} from './field-evidence'

// Evidence contract version 2, see platform/agent/tests/fixtures/evidence-vectors.json.
export interface EvidenceJournalEntry {
  id: string
  parcel_id: string
  status: string
  entry_date: Date | string
  activity_type: string
  notes: string | null
  updated_at: Date | string
  activities: {
    id: string
    activity_detail: string
    product_name: string | null
    dosage: string | null
    withdrawal_days: number | null
    safe_harvest_date: Date | string | null
  }[]
}

export interface EvidenceCropCycle {
  id: string
  parcel_id: string
  season: string | null
  sowed_at: Date | string | null
  estimated_harvest_date: Date | string | null
  harvested_at: Date | string | null
}

/** Plain code-point order: UTF-8 bytes sort like code points, unlike the locale order of localeCompare. */
function byCodePoint(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
}

export function journalEntryValues(entry: EvidenceJournalEntry): Record<string, unknown> {
  const activities = [...entry.activities]
    .sort((a, b) => byCodePoint(a.id, b.id))
    .map((a) => ({
      id: a.id,
      activity_detail: a.activity_detail,
      product_name: a.product_name ?? null,
      dosage: a.dosage ?? null,
      withdrawal_days: a.withdrawal_days ?? null,
      safe_harvest_date: utcTimestamp(a.safe_harvest_date),
    }))
  return {
    id: entry.id,
    parcel_id: entry.parcel_id,
    status: entry.status,
    entry_date: utcTimestamp(entry.entry_date),
    activity_type: entry.activity_type,
    notes: entry.notes ?? null,
    updated_at: utcTimestamp(entry.updated_at),
    activities,
  }
}

export function cropCycleValues(cycle: EvidenceCropCycle): Record<string, unknown> {
  return {
    id: cycle.id,
    parcel_id: cycle.parcel_id,
    season: cycle.season ?? null,
    sowed_at: utcTimestamp(cycle.sowed_at),
    estimated_harvest_date: utcTimestamp(cycle.estimated_harvest_date),
    harvested_at: utcTimestamp(cycle.harvested_at),
  }
}

export function journalEntryEvidence(entry: EvidenceJournalEntry): EvidenceRow {
  const values = journalEntryValues(entry)
  return { table: 'journal_entries', id: entry.id, sha256: sha256Hex(canonicalJson(values)), values }
}

export type EvidenceLoader = (htxCode: string, id: string) => Promise<Record<string, unknown> | null>
export type EvidenceLoaders = Readonly<Record<string, EvidenceLoader>>

export const EVIDENCE_LOADERS: EvidenceLoaders = {
  journal_entries: async (htxCode, id) => {
    const entry = await findJournalEntryForEvidence(htxCode, id)
    return entry ? journalEntryValues(entry) : null
  },
  parcel_crop_cycles: async (htxCode, id) => {
    const cycle = await findCropCycleForEvidence(htxCode, id)
    return cycle ? cropCycleValues(cycle) : null
  },
  parcels: async (htxCode, id) => {
    const parcel = await findParcelForEvidence(htxCode, id)
    return parcel ? parcelValues(parcel) : null
  },
  disease_reports: async (htxCode, id) => {
    const report = await findDiseaseReportForEvidence(htxCode, id)
    return report ? diseaseReportValues(report) : null
  },
  sensor_readings: async (htxCode, id) => {
    const reading = await findSensorReadingForEvidence(htxCode, id)
    return reading ? sensorReadingValues(reading) : null
  },
  weather_cache: async (htxCode, id) => {
    const row = await findWeatherCacheForEvidence(htxCode, id)
    return row ? weatherCacheValues(row) : null
  },
  // Shared reference data: every cooperative reads the same rows, so the cooperative is not checked.
  market_data: async (_htxCode, id) => {
    const row = await findMarketDataForEvidence(id)
    return row ? marketDataValues(row) : null
  },
}

/** Stale when a row is missing in this cooperative, or its current values no longer hash to the stored sha256. */
export async function isEvidenceStale(
  evidence: Evidence,
  htxCode: string,
  loaders: EvidenceLoaders = EVIDENCE_LOADERS
): Promise<boolean> {
  for (const row of evidence.rows) {
    const load = Object.prototype.hasOwnProperty.call(loaders, row.table) ? loaders[row.table] : undefined
    if (!load) return true
    const values = await load(htxCode, row.id)
    if (!values || sha256Hex(canonicalJson(values)) !== row.sha256) return true
  }
  return false
}
