// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { prisma } from '@/infrastructure/db/prisma.client'
import type { ChatTool } from '../types'
import { reply } from './common'
import { textArg } from './scoped'

/** Routes: `GET /api/farm/households` and `GET /api/farm/households/[id]`, found by name inside the user's cooperative. */
export const householdsTool: ChatTool = {
  name: 'households',
  titleVi: 'Nông hộ',
  roles: ['officer', 'manager'],
  routes: ['GET /api/farm/households', 'GET /api/farm/households/[id]'],
  args: [{ name: 'name', type: 'string', descriptionVi: 'Tên chủ hộ, để xem một nông hộ' }],
  async run(user, args) {
    const name = textArg(args, 'name')
    const rows = await prisma.household.findMany({
      where: {
        htx_profile_id: user.tenant.htxProfileId,
        ...(name ? { name: { contains: name, mode: 'insensitive' } } : {}),
      },
      orderBy: { created_at: 'desc' },
      take: name ? 8 : 10,
      select: { name: true, phone: true, address: true, parcels: { select: { parcel_code: true, area_ha: true } } },
    })
    if (name && !rows.length) return reply('Nông hộ', [`Không tìm thấy nông hộ "${name}".`])
    if (name && rows.length === 1) {
      const [household] = rows
      const area = household.parcels.reduce((sum, parcel) => sum + parcel.area_ha, 0)
      return reply('Nông hộ', [
        `${household.name} · ${household.phone}`,
        ...(household.address ? [household.address] : []),
        `${household.parcels.length} thửa, ${area.toFixed(2)} ha`,
        ...household.parcels.slice(0, 4).map((parcel) => `${parcel.parcel_code} · ${parcel.area_ha} ha`),
      ])
    }
    return reply('Nông hộ', rows.map((household) => `${household.name} · ${household.phone} · ${household.parcels.length} thửa`))
  },
}
