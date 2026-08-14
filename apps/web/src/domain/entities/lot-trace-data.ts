// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

export interface LotJournalSummary {
  entry_date: Date
  activity_type: string
  performed_by: string
  approved_by_id: string | null
  withdrawal_days: number | null
}

export interface LotParcelInfo {
  parcel_code: string
  area_ha: number
  household_name: string
  crop_type: string
}

export interface LotTraceData {
  lot_code: string
  commodity: string
  quality_grade: string | null
  status: string
  packaging_date: Date | null
  total_weight_kg: number | null
  created_at: Date
  // Computed safety
  is_harvest_safe: boolean
  latest_safe_harvest_date: Date | null
  // Related data
  parcels: LotParcelInfo[]
  journal_summaries: LotJournalSummary[]
  certificate_keys: string[]
  htx_name: string | null
}
