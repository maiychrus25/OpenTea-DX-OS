// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { ParcelFilters, ParcelPort, ParcelSummary } from '@/domain/farm/ports/ParcelPort'
import { CoreGatewayClient, parseCoreTimestamp } from './core-gateway.client'

const PARCEL_FIELDS = `
  id parcel_code household_id area_ha centroid_lat centroid_lng polygon_geojson status crop_type
  household { id name keycloak_user_id }
  crop_cycles(order_by: { created_at: desc }, limit: 1) { season sowed_at harvested_at }
`

interface ParcelRow {
  id: string
  parcel_code: string
  household_id: string
  area_ha: number
  centroid_lat: number | null
  centroid_lng: number | null
  polygon_geojson: unknown | null
  status: string
  crop_type: string
  household: { id: string; name: string; keycloak_user_id: string | null } | null
  crop_cycles: { season: string | null; sowed_at: string | null; harvested_at: string | null }[]
}

function toParcelSummary(row: ParcelRow): ParcelSummary {
  const latestCycle = row.crop_cycles[0]
  return {
    id: row.id,
    parcel_code: row.parcel_code,
    household_id: row.household_id,
    name: row.parcel_code,
    area_ha: row.area_ha,
    centroid_lat: row.centroid_lat,
    centroid_lng: row.centroid_lng,
    polygon_geojson: row.polygon_geojson,
    status: row.status,
    crop_type: row.crop_type,
    household: row.household,
    season: latestCycle?.season ?? null,
    sowed_at: latestCycle?.sowed_at ? parseCoreTimestamp(latestCycle.sowed_at).toISOString() : null,
    harvested_at: latestCycle?.harvested_at ? parseCoreTimestamp(latestCycle.harvested_at).toISOString() : null,
  }
}

export class GatewayParcelReader implements Pick<ParcelPort, 'findAll' | 'findById'> {
  constructor(private readonly client: CoreGatewayClient) {}

  async findById(id: string): Promise<ParcelSummary | null> {
    const data = await this.client.graphql<{ parcels_by_pk: ParcelRow | null }>(
      `query ($id: String!) { parcels_by_pk(id: $id) { ${PARCEL_FIELDS} } }`,
      { id }
    )
    return data.parcels_by_pk ? toParcelSummary(data.parcels_by_pk) : null
  }

  async findAll(filters: ParcelFilters): Promise<ParcelSummary[]> {
    const where: Record<string, unknown> = {}
    if (filters.household_id) where.household_id = { _eq: filters.household_id }
    if (filters.status) where.status = { _eq: filters.status }

    const data = await this.client.graphql<{ parcels: ParcelRow[] }>(
      `query ($where: parcels_bool_exp!) { parcels(where: $where, order_by: { created_at: desc }) { ${PARCEL_FIELDS} } }`,
      { where }
    )
    return data.parcels.map(toParcelSummary)
  }
}
