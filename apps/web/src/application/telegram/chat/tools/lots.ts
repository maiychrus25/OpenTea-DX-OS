// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { formatVnDate } from '@/application/agent/actions/journal-labels'
import { PrismaLotRepository } from '@/infrastructure/db/lot/PrismaLotRepository'
import { prisma } from '@/infrastructure/db/prisma.client'
import type { ChatReply, ChatTool, ChatUser } from '../types'
import { reply } from './common'
import { notFoundReply, textArg } from './scoped'

/** One lot of the user's cooperative by its code; another cooperative's code is the same as no lot. */
async function lotDetail(user: ChatUser, code: string): Promise<ChatReply> {
  const lot = await prisma.lot.findFirst({
    where: { lot_code: { equals: code, mode: 'insensitive' }, htx_profile_id: user.tenant.htxProfileId },
    select: {
      lot_code: true,
      commodity: true,
      quality_grade: true,
      harvest_date: true,
      total_weight_kg: true,
      actual_weight_kg: true,
      estimated_weight_kg: true,
      buyer_name: true,
      status: true,
      _count: { select: { lot_parcels: true } },
    },
  })
  if (!lot) return notFoundReply('Lô hàng', 'lô hàng')
  const weight = lot.total_weight_kg ?? lot.actual_weight_kg ?? lot.estimated_weight_kg
  return reply('Lô hàng', [
    `Lô ${lot.lot_code} · ${lot.status}`,
    `Sản phẩm: ${lot.commodity}${lot.quality_grade ? ` · ${lot.quality_grade}` : ''}`,
    `Ngày thu hoạch: ${formatVnDate(lot.harvest_date) ?? '—'}`,
    ...(weight != null ? [`Khối lượng: ${weight} kg`] : []),
    `Số thửa: ${lot._count.lot_parcels}`,
    ...(lot.buyer_name ? [`Người mua: ${lot.buyer_name}`] : []),
  ])
}

/**
 * Routes: `GET /api/lots` with no visibility filter, and `GET /api/lots/[id]` when a lot code follows the phrase;
 * for officers and managers, the cooperative's lots only.
 */
export const lotsTool: ChatTool = {
  name: 'lots',
  titleVi: 'Lô hàng',
  roles: ['officer', 'manager'],
  routes: ['GET /api/lots', 'GET /api/lots/[id]'],
  args: [{ name: 'lot_code', type: 'string', descriptionVi: 'Mã lô hàng' }],
  async run(user, args) {
    const code = textArg(args, 'lot_code')
    if (code) return lotDetail(user, code)
    const lots = await new PrismaLotRepository().findAll({ htx_profile_id: user.tenant.htxProfileId })
    return reply(
      'Lô hàng',
      lots.map((lot) => `${lot.lot_code} · ${lot.commodity} · ${lot.status} · ${formatVnDate(lot.harvest_date) ?? '—'}`)
    )
  },
}
