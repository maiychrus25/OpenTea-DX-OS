// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { utcTimestamp } from '@/domain/agent/evidence'

// Evidence contract version 2 plus the M4 rules, see platform/agent/tests/fixtures/evidence-vectors-m4.json.

/** `<field>_milli` of the contract: floor(value * 1000) in IEEE double arithmetic; null stays null. */
export function milli(value: number | null | undefined): number | null {
  return value === null || value === undefined ? null : Math.floor(value * 1000)
}

export interface EvidenceParcel {
  id: string
  parcel_code: string
  status: string
  harvest_approved_at: Date | string | null
  updated_at: Date | string
}

export function parcelValues(parcel: EvidenceParcel): Record<string, unknown> {
  return {
    id: parcel.id,
    parcel_code: parcel.parcel_code,
    status: parcel.status,
    harvest_approved_at: utcTimestamp(parcel.harvest_approved_at),
    updated_at: utcTimestamp(parcel.updated_at),
  }
}

export interface EvidenceDiseaseReport {
  id: string
  parcel_id: string
  status: string
  detection_date: Date | string
  ai_disease_name: string
  confirmed_diagnosis: string | null
  updated_at: Date | string
}

export function diseaseReportValues(report: EvidenceDiseaseReport): Record<string, unknown> {
  return {
    id: report.id,
    parcel_id: report.parcel_id,
    status: report.status,
    detection_date: utcTimestamp(report.detection_date),
    ai_disease_name: report.ai_disease_name,
    confirmed_diagnosis: report.confirmed_diagnosis ?? null,
    updated_at: utcTimestamp(report.updated_at),
  }
}

export interface EvidenceSensorReading {
  parcel_code: string
  sensor: string
  ts: Date | string
  value: number
}

/** The evidence id of a reading is its natural key, as the table has no id column. */
export function sensorReadingValues(reading: EvidenceSensorReading): Record<string, unknown> {
  const ts = utcTimestamp(reading.ts) as string
  return {
    id: `${reading.parcel_code}|${reading.sensor}|${ts}`,
    parcel_code: reading.parcel_code,
    sensor: reading.sensor,
    ts,
    value_milli: milli(reading.value),
  }
}

export interface EvidenceWeatherCache {
  id: string
  parcel_id: string
  recorded_at: Date | string
  precipitation_mm: number | null
  forecast_json: unknown
}

export function weatherCacheValues(row: EvidenceWeatherCache): Record<string, unknown> {
  const forecast = (row.forecast_json ?? {}) as { time?: string[]; precipitation_sum?: (number | null)[] }
  const days = forecast.time ?? []
  const sums = forecast.precipitation_sum ?? []
  return {
    id: row.id,
    parcel_id: row.parcel_id,
    recorded_at: utcTimestamp(row.recorded_at),
    precipitation_milli: milli(row.precipitation_mm),
    forecast_days: [...days],
    forecast_precipitation_milli: days.map((_, i) => milli(sums[i] ?? null)),
  }
}

export interface EvidenceMarketData {
  id: string
  source: string
  commodity: string
  metric: string
  value: number
  unit: string
  period: string
  fetched_at: Date | string
}

export function marketDataValues(row: EvidenceMarketData): Record<string, unknown> {
  return {
    id: row.id,
    source: row.source,
    commodity: row.commodity,
    metric: row.metric,
    value_milli: milli(row.value),
    unit: row.unit,
    period: row.period,
    fetched_at: utcTimestamp(row.fetched_at),
  }
}
