// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

export interface LotJournalSummary {
  entry_date: Date
  activity_type: string
  performed_by: string
  approved_by_id: string | null
  activity_detail: string
  product_name: string | null
  dosage: string | null
  withdrawal_days: number | null
}

export interface LotParcelInfo {
  parcel_code: string
  area_ha: number
  household_name: string
  crop_type: string
  status: string
}

export interface LotTraceData {
  lot_code: string
  commodity: string
  quality_grade: string | null
  status: "DRAFT" | "READY" | "QR_EXPORTED"
  packaging_date: Date | null
  packaging_spec: string | null
  total_weight_kg: number | null
  qr_image_url: string | null
  created_at: Date
  // Computed safety
  is_harvest_safe: boolean
  latest_safe_harvest_date: Date | null
  // Related data
  parcels: LotParcelInfo[]
  journal_summaries: LotJournalSummary[]
  certificate_keys: string[]
  htx_name: string | null
  // Phase 2 (spec §4.5). Absent in snapshots stored before phase 2: read them as empty.
  dry_grade?: string | null
  batches?: LotTraceBatch[]
  intake?: LotTraceIntake[]
  certificates?: LotTraceCertificate[]
}

/** One processing batch the lot draws from. `master_name` is a person: hidden unless the cooperative allows names. */
export interface LotTraceBatch {
  batch_code: string
  processed_on: string
  master_name: string | null
  fresh_kg: number
  dry_kg: number
  recovery_ratio: number
  out_of_band: boolean
  grade: string
  kg_in_lot: number
  ticket_count: number
  parcel_codes: string[]
}

/** One fresh-leaf ticket behind the lot, without household or ticket number. Days are Vietnam days, YYYY-MM-DD. */
export interface LotTraceIntake {
  parcel_code: string
  cycle_label: string | null
  weighed_on: string
  net_kg: number
  safe_on: string | null
}

export interface LotTraceCertificate {
  id: string
  kind: 'VIETGAP' | 'OCOP' | 'ORGANIC' | 'OTHER'
  number: string
  issuer: string
  issued_on: string
  expires_on: string
  file_key: string
}
