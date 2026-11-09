// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { JournalEntryData, JournalFilters, JournalPort } from '@/domain/journal/ports/JournalPort'
import { CoreGatewayClient, parseCoreTimestamp } from './core-gateway.client'

const ENTRY_FIELDS = `
  id parcel_id entry_date activity_type performed_by submitted_by_id submitted_role status approved_by_id approved_at
  notes weather_temperature weather_precipitation weather_humidity weather_condition photo_url photo_minio_key created_at
  activities { id activity_detail product_name dosage withdrawal_days safe_harvest_date }
  parcel { household_id parcel_code household { keycloak_user_id } }
`

interface EntryRow {
  id: string
  parcel_id: string
  entry_date: string
  activity_type: string
  performed_by: string
  submitted_by_id: string | null
  submitted_role: string
  status: string
  approved_by_id: string | null
  approved_at: string | null
  notes: string | null
  weather_temperature: number | null
  weather_precipitation: number | null
  weather_humidity: number | null
  weather_condition: string | null
  photo_url: string | null
  photo_minio_key: string | null
  created_at: string
  activities: {
    id: string
    activity_detail: string
    product_name: string | null
    dosage: string | null
    withdrawal_days: number | null
    safe_harvest_date: string | null
  }[]
  parcel: { household_id: string; parcel_code: string; household: { keycloak_user_id: string | null } | null } | null
}

function toJournalEntry(row: EntryRow): JournalEntryData {
  return {
    id: row.id,
    parcel_id: row.parcel_id,
    household_id: row.parcel?.household_id,
    parcel_code: row.parcel?.parcel_code,
    household_keycloak_user_id: row.parcel?.household?.keycloak_user_id,
    entry_date: parseCoreTimestamp(row.entry_date),
    activity_type: row.activity_type,
    performed_by: row.performed_by,
    submitted_by_id: row.submitted_by_id,
    submitted_role: row.submitted_role,
    status: row.status,
    approved_by_id: row.approved_by_id,
    approved_at: row.approved_at ? parseCoreTimestamp(row.approved_at) : null,
    notes: row.notes,
    weather_temperature: row.weather_temperature,
    weather_precipitation: row.weather_precipitation,
    weather_humidity: row.weather_humidity,
    weather_condition: row.weather_condition,
    photo_url: row.photo_url,
    photo_minio_key: row.photo_minio_key,
    created_at: parseCoreTimestamp(row.created_at),
    activities: row.activities.map((activity) => ({
      id: activity.id,
      activity_detail: activity.activity_detail,
      product_name: activity.product_name,
      dosage: activity.dosage,
      withdrawal_days: activity.withdrawal_days,
      safe_harvest_date: activity.safe_harvest_date ? parseCoreTimestamp(activity.safe_harvest_date) : null,
    })),
  }
}

export class GatewayJournalReader implements Pick<JournalPort, 'findAll' | 'findById'> {
  constructor(private readonly client: CoreGatewayClient) {}

  async findAll(filters: JournalFilters): Promise<{ entries: JournalEntryData[]; total: number }> {
    const where: Record<string, unknown> = {}
    if (filters.parcel_id) where.parcel_id = { _eq: filters.parcel_id }
    if (filters.status) where.status = { _eq: filters.status }
    if (filters.household_id) where.parcel = { household_id: { _eq: filters.household_id } }

    const page = filters.page ?? 1
    const limit = filters.limit ?? 20

    const data = await this.client.graphql<{
      journal_entries: EntryRow[]
      journal_entries_aggregate: { aggregate: { count: number } }
    }>(
      `query ($where: journal_entries_bool_exp!, $limit: Int!, $offset: Int!) {
        journal_entries(where: $where, order_by: { entry_date: desc }, limit: $limit, offset: $offset) { ${ENTRY_FIELDS} }
        journal_entries_aggregate(where: $where) { aggregate { count } }
      }`,
      { where, limit, offset: (page - 1) * limit }
    )
    return {
      entries: data.journal_entries.map(toJournalEntry),
      total: data.journal_entries_aggregate.aggregate.count,
    }
  }

  async findById(id: string): Promise<JournalEntryData | null> {
    const data = await this.client.graphql<{ journal_entries_by_pk: EntryRow | null }>(
      `query ($id: String!) { journal_entries_by_pk(id: $id) { ${ENTRY_FIELDS} } }`,
      { id }
    )
    return data.journal_entries_by_pk ? toJournalEntry(data.journal_entries_by_pk) : null
  }
}
