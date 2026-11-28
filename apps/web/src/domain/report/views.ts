// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { CertificateKind } from '@/domain/certificate/views'
import type { DryTeaGrade } from '@/domain/processing/grades'

/** Phase 3 S9: the season or year report for the members' assembly. A section that failed to load is null. */
export interface SeasonReport {
  htx_name: string
  /** Vietnam days, inclusive. */
  from: string
  to: string
  generated_at: string
  members: { households: number; parcels: number; area_ha: number } | null
  purchases: {
    total: { net_kg: number; amount_vnd: string; tickets: number }
    months: { month: string; net_kg: number; amount_vnd: string; tickets: number }[]
    by_grade: { grade_name: string; net_kg: number; amount_vnd: string }[]
  } | null
  member_money: { periods_closed: number; paid_vnd: string; payable_open_vnd: string; advances_vnd: string } | null
  processing: {
    batches: number
    fresh_kg: number
    dry_kg: number
    avg_ratio: number | null
    out_of_band: number
    by_grade: { grade: DryTeaGrade; kg: number }[]
  } | null
  lots: {
    lots: number
    exported: number
    kg: number
    certificates_valid: { kind: CertificateKind; number: string; issuer: string; expires_on: string }[]
  } | null
  sales: {
    wholesale_vnd: string
    retail_vnd: string
    kg_sold: number
    receivable_vnd: string
    top_partners: { partner_name: string; amount_vnd: string }[]
  } | null
  safety: { sprayings_approved: number; harvests_approved: number } | null
}

export const REPORT_SECTIONS = ['members', 'purchases', 'member_money', 'processing', 'lots', 'sales', 'safety'] as const
export type ReportSection = (typeof REPORT_SECTIONS)[number]
