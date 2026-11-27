// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

export interface JournalActivityData {
  activity_type: string
  product_name?: string
  dosage?: string
  withdrawal_days?: number
  pesticide_product_id?: string
  fresh_leaf_kg?: number
}

export type JournalReviewDecision = 'REJECTED' | 'REQUEST_CHANGES'

export interface JournalEntryData {
  id: string
  parcel_id: string
  household_id?: string
  parcel_code?: string
  household_keycloak_user_id?: string | null
  cycle_id?: string | null
  client_id?: string | null
  entry_date: Date
  activity_type: string
  performed_by: string
  submitted_by_id: string | null
  submitted_role: string
  status: string
  approved_by_id: string | null
  approved_at: Date | null
  review_note?: string | null
  notes: string | null
  weather_temperature: number | null
  weather_precipitation: number | null
  weather_humidity: number | null
  weather_condition: string | null
  photo_url: string | null
  photo_minio_key: string | null
  created_at: Date
  activities: {
    id: string
    activity_detail: string
    product_name: string | null
    dosage: string | null
    withdrawal_days: number | null
    safe_harvest_date: Date | null
    pesticide_product_id?: string | null
    fresh_leaf_kg?: number | null
  }[]
}

export interface CreateJournalData {
  parcel_id: string
  entry_date: Date
  activity_type: string
  performed_by: string
  submitted_by_id: string
  submitted_role: 'OFFICER' | 'FARMER'
  activities: JournalActivityData[]
  observation?: string
  photo_url?: string
  photo_minio_key?: string
  /** Client-generated uuid; a replay by the same sender returns the first entry. */
  client_id?: string
}

export interface JournalFilters {
  parcel_id?: string
  status?: string
  page?: number
  limit?: number
  household_id?: string // for farmer scope filtering
  /** The cooperative the entries belong to; set by chat reads, which have no session to scope them. */
  htx_profile_id?: string
}

export interface JournalPort {
  findAll(filters: JournalFilters): Promise<{ entries: JournalEntryData[]; total: number }>
  findById(id: string): Promise<JournalEntryData | null>
  create(data: CreateJournalData): Promise<JournalEntryData>
  findByClientId(submittedById: string, clientId: string): Promise<JournalEntryData | null>
  /** `activities` replaces all of them; `resubmit` sends the entry back to the review queue. */
  update(id: string, data: Partial<CreateJournalData>, resubmit?: boolean): Promise<JournalEntryData>
  delete(id: string): Promise<void>
  batchApprove(entryIds: string[], approvedById: string): Promise<{ approved: number; failed: string[] }>
  review(entryId: string, decision: JournalReviewDecision, reason: string, reviewerId: string): Promise<{ status: JournalReviewDecision }>
}
