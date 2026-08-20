// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

export interface JournalActivityData {
  activity_type: string
  product_name?: string
  dosage?: string
  withdrawal_days?: number
}

export interface JournalEntryData {
  id: string
  parcel_id: string
  entry_date: Date
  activity_type: string
  performed_by: string
  submitted_by_id: string | null
  submitted_role: string
  status: string
  approved_by_id: string | null
  approved_at: Date | null
  notes: string | null
  weather_temperature: number | null
  weather_precipitation: number | null
  weather_humidity: number | null
  weather_condition: string | null
  created_at: Date
  activities: {
    id: string
    activity_detail: string
    product_name: string | null
    dosage: string | null
    withdrawal_days: number | null
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
}

export interface JournalFilters {
  parcel_id?: string
  status?: string
  page?: number
  limit?: number
  household_id?: string // for farmer scope filtering
}

export interface JournalPort {
  findAll(filters: JournalFilters): Promise<{ entries: JournalEntryData[]; total: number }>
  findById(id: string): Promise<JournalEntryData | null>
  create(data: CreateJournalData): Promise<JournalEntryData>
  update(id: string, data: Partial<CreateJournalData>): Promise<JournalEntryData>
  delete(id: string): Promise<void>
  batchApprove(entryIds: string[], approvedById: string): Promise<{ approved: number; failed: string[] }>
}
