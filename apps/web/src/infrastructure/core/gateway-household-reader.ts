// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { HouseholdPort, HouseholdSummary } from '@/domain/farm/ports/HouseholdPort'
import type { CoreGatewayClient } from './core-gateway.client'

const HOUSEHOLD_FIELDS = 'id name phone address keycloak_user_id parcels { area_ha }'

interface HouseholdRow {
  id: string
  name: string
  phone: string
  address: string | null
  keycloak_user_id: string | null
  parcels: { area_ha: number }[]
}

function toHouseholdSummary(row: HouseholdRow): HouseholdSummary {
  return {
    id: row.id,
    household_code: row.phone,
    name: row.name,
    phone: row.phone,
    address: row.address,
    parcel_count: row.parcels.length,
    total_area_ha: row.parcels.reduce((sum, parcel) => sum + parcel.area_ha, 0),
    keycloak_user_id: row.keycloak_user_id,
  }
}

export class GatewayHouseholdReader implements Pick<HouseholdPort, 'findAll' | 'findById'> {
  constructor(private readonly client: CoreGatewayClient) {}

  // The parameter only satisfies the port: Hasura scopes the rows to the HTX in the token.
  async findAll(_htxProfileId: string): Promise<HouseholdSummary[]> {
    const data = await this.client.graphql<{ households: HouseholdRow[] }>(
      `query { households(order_by: { created_at: desc }) { ${HOUSEHOLD_FIELDS} } }`
    )
    return data.households.map(toHouseholdSummary)
  }

  async findById(id: string): Promise<HouseholdSummary | null> {
    const data = await this.client.graphql<{ households_by_pk: HouseholdRow | null }>(
      `query ($id: String!) { households_by_pk(id: $id) { ${HOUSEHOLD_FIELDS} } }`,
      { id }
    )
    return data.households_by_pk ? toHouseholdSummary(data.households_by_pk) : null
  }
}
