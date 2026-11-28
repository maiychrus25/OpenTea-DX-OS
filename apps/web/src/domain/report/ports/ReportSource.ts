// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { CertificateKind } from '@/domain/certificate/views'
import type { DryTeaGrade } from '@/domain/processing/grades'

/** A report period: Vietnam days `from` and `to` inclusive, and the instants [start, end) they cover. */
export interface ReportRange {
  from: string
  to: string
  start: Date
  end: Date
}

/** Raw figures of the season report. Every method is one HTX only and reads aggregates, never row lists. */
export interface ReportSource {
  htxName(htxProfileId: string): Promise<string>
  /** As of now, not of the period. */
  members(htxProfileId: string): Promise<{ households: number; parcels: number; area_ha: number }>
  /** VALID tickets weighed in the range. `month` is a Vietnam month `YYYY-MM`; months and grades are sorted. */
  purchases(htxProfileId: string, range: ReportRange): Promise<{
    months: { month: string; net_kg: number; amount_vnd: bigint; tickets: number }[]
    by_grade: { grade_name: string; net_kg: number; amount_vnd: bigint }[]
  }>
  /** CLOSED periods closed in the range; advances VALID and given in the range. */
  memberMoney(htxProfileId: string, range: ReportRange): Promise<{ periods_closed: number; paid_vnd: bigint; payable_open_vnd: bigint; advances_vnd: bigint }>
  /** FINISHED batches finished in the range. */
  processing(htxProfileId: string, range: ReportRange): Promise<{
    batches: number
    fresh_kg: number
    dry_kg: number
    out_of_band: number
    by_grade: { grade: DryTeaGrade; kg: number }[]
  }>
  /** Lots created in the range, and certificates valid (not revoked, not expired) on `range.to`. */
  lots(htxProfileId: string, range: ReportRange): Promise<{
    lots: number
    exported: number
    kg: number
    certificates_valid: { kind: CertificateKind; number: string; issuer: string; expires_on: string }[]
  }>
  safety(htxProfileId: string, range: ReportRange): Promise<{ sprayings_approved: number; harvests_approved: number }>
}
