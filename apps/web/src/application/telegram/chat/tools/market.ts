// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { prisma } from '@/infrastructure/db/prisma.client'
import { toVietnameseCommodity } from '@/lib/translations'
import type { ChatTool } from '../types'
import { reply } from './common'

// shortcut: tea only, the commodity `GET /api/market-data` defaults to; its other commodities stay on the web for now.
const TEA_METRICS = ['export_value_to_world', 'export_volume_to_world']

/** Routes: `GET /api/market-data` (the tea rows) and `GET /api/market-data/fx` (the latest rates). */
export const marketTool: ChatTool = {
  name: 'market',
  titleVi: 'Giá thị trường',
  roles: ['farmer', 'officer', 'manager'],
  routes: ['GET /api/market-data', 'GET /api/market-data/fx'],
  args: [],
  async run() {
    const lines: string[] = []
    let row = null
    for (const metric of TEA_METRICS) {
      row = await prisma.marketData.findFirst({ where: { commodity: 'Tea', metric }, orderBy: { fetched_at: 'desc' } })
      if (row) break
    }
    if (!row) row = await prisma.marketData.findFirst({ where: { commodity: 'Tea' }, orderBy: { fetched_at: 'desc' } })
    if (row) lines.push(`${toVietnameseCommodity(row.commodity)}: ${row.value} ${row.unit} (${row.period})`)

    const [fx] = await prisma.fxRate.findMany({ orderBy: { fetched_at: 'desc' }, take: 1 })
    const vnd = (fx?.rates as Record<string, unknown> | undefined)?.VND
    if (typeof vnd === 'number') lines.push(`Tỷ giá USD/VND: ${vnd}`)
    return reply('Giá thị trường', lines)
  },
}
