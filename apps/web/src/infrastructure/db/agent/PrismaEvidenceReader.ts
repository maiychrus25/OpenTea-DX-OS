// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { prisma } from '@/infrastructure/db/prisma.client'

// Scoped by cooperative: a record of another HTX reads as missing, which makes the evidence stale.
export function findJournalEntryForEvidence(htxCode: string, id: string) {
  return prisma.journalEntry.findFirst({
    where: { id, parcel: { household: { htx_profile: { htx_code: htxCode } } } },
    include: { activities: true },
  })
}

export function findCropCycleForEvidence(htxCode: string, id: string) {
  return prisma.parcelCropCycle.findFirst({
    where: { id, parcel: { household: { htx_profile: { htx_code: htxCode } } } },
  })
}

export function findParcelForEvidence(htxCode: string, id: string) {
  return prisma.parcel.findFirst({
    where: { id, household: { htx_profile: { htx_code: htxCode } } },
  })
}

export function findDiseaseReportForEvidence(htxCode: string, id: string) {
  return prisma.diseaseReport.findFirst({
    where: { id, household: { htx_profile: { htx_code: htxCode } } },
  })
}

// Uuid columns reject other text, so a malformed evidence id reads as missing instead of failing the query.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function findWeatherCacheForEvidence(htxCode: string, id: string) {
  if (!UUID_PATTERN.test(id)) return Promise.resolve(null)
  return prisma.weatherCache.findFirst({
    where: { id, parcel: { household: { htx_profile: { htx_code: htxCode } } } },
  })
}

/** Market rows are shared reference data, so there is no cooperative filter. */
export function findMarketDataForEvidence(id: string) {
  if (!UUID_PATTERN.test(id)) return Promise.resolve(null)
  return prisma.marketData.findUnique({ where: { id } })
}

/** The evidence id of a reading is `<parcel_code>|<sensor>|<ts>`; the table key is (htx_code, parcel_code, sensor, ts). */
export async function findSensorReadingForEvidence(htxCode: string, id: string) {
  const parts = id.split('|')
  if (parts.length !== 3) return null
  const [parcelCode, sensor, rawTs] = parts
  const ts = new Date(rawTs)
  if (Number.isNaN(ts.getTime())) return null
  // The id names the reading to the millisecond, as evidence timestamps are; Postgres keeps microseconds.
  const until = new Date(ts.getTime() + 1)
  const rows = await prisma.$queryRaw<{ parcel_code: string; sensor: string; ts: Date; value: number }[]>`
    SELECT parcel_code, sensor, ts, value
    FROM telemetry.sensor_readings
    WHERE htx_code = ${htxCode} AND parcel_code = ${parcelCode} AND sensor = ${sensor}
      AND ts >= ${ts} AND ts < ${until}
    ORDER BY ts
    LIMIT 1
  `
  return rows[0] ?? null
}
