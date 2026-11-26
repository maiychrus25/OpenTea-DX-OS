// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { formatVnDate } from '@/application/agent/actions/journal-labels'
import { ListLotsUseCase } from '@/application/lot/ListLotsUseCase'
import { GatewayLotReader } from '@/infrastructure/core/gateway-lot-reader'
import type { ChatTool } from '../types'
import { coreClient, reply } from './common'

/** Routes: `GET /api/lots` with no visibility filter, for officers and managers. */
export const lotsTool: ChatTool = {
  name: 'lots',
  titleVi: 'Lô hàng',
  roles: ['officer', 'manager'],
  routes: ['GET /api/lots'],
  args: [],
  async run(user) {
    const lots = await new ListLotsUseCase(new GatewayLotReader(coreClient(user))).execute({})
    return reply(
      'Lô hàng',
      lots.map((lot) => `${lot.lot_code} · ${lot.commodity} · ${lot.status} · ${formatVnDate(lot.harvest_date) ?? '—'}`)
    )
  },
}
