// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { formatVnDate } from '@/application/agent/actions/journal-labels'
import { PrismaLotRepository } from '@/infrastructure/db/lot/PrismaLotRepository'
import type { ChatTool } from '../types'
import { reply } from './common'

/** Routes: `GET /api/lots` with no visibility filter, for officers and managers; the cooperative's lots only. */
export const lotsTool: ChatTool = {
  name: 'lots',
  titleVi: 'Lô hàng',
  roles: ['officer', 'manager'],
  routes: ['GET /api/lots'],
  args: [],
  async run(user) {
    const lots = await new PrismaLotRepository().findAll({ htx_profile_id: user.tenant.htxProfileId })
    return reply(
      'Lô hàng',
      lots.map((lot) => `${lot.lot_code} · ${lot.commodity} · ${lot.status} · ${formatVnDate(lot.harvest_date) ?? '—'}`)
    )
  },
}
