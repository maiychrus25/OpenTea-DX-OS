// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { LotFilters, LotPort, LotSummary } from '@/domain/lot/ports/LotPort'
import { CoreGatewayClient, parseCoreTimestamp } from './core-gateway.client'

const LOT_FIELDS = 'id lot_code commodity harvest_date estimated_weight_kg actual_weight_kg status created_at lot_parcels { id }'

interface LotRow {
  id: string
  lot_code: string
  commodity: string
  harvest_date: string
  estimated_weight_kg: number | null
  actual_weight_kg: number | null
  status: string
  created_at: string
  lot_parcels: { id: string }[]
}

function toLotSummary(row: LotRow): LotSummary {
  return {
    id: row.id,
    lot_code: row.lot_code,
    commodity: row.commodity,
    harvest_date: parseCoreTimestamp(row.harvest_date),
    estimated_weight_kg: row.estimated_weight_kg,
    actual_weight_kg: row.actual_weight_kg,
    status: row.status,
    parcel_count: row.lot_parcels.length,
    created_at: parseCoreTimestamp(row.created_at),
  }
}

export class GatewayLotReader implements Pick<LotPort, 'findAll' | 'findById'> {
  constructor(private readonly client: CoreGatewayClient) {}

  async findAll(filters: LotFilters): Promise<LotSummary[]> {
    const where: Record<string, unknown> = {}
    if (filters.statuses?.length) where.status = { _in: filters.statuses }
    else if (filters.status) where.status = { _eq: filters.status }

    const data = await this.client.graphql<{ lots: LotRow[] }>(
      `query ($where: lots_bool_exp!) { lots(where: $where, order_by: { created_at: desc }) { ${LOT_FIELDS} } }`,
      { where }
    )
    return data.lots.map(toLotSummary)
  }

  async findById(id: string): Promise<LotSummary | null> {
    const data = await this.client.graphql<{ lots_by_pk: LotRow | null }>(
      `query ($id: String!) { lots_by_pk(id: $id) { ${LOT_FIELDS} } }`,
      { id }
    )
    return data.lots_by_pk ? toLotSummary(data.lots_by_pk) : null
  }
}
