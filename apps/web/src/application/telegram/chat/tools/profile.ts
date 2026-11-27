// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { prisma } from '@/infrastructure/db/prisma.client'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/repositories/PrismaHtxProfileRepository'
import type { ChatTool } from '../types'
import { reply } from './common'

const ROLE_LABEL = { farmer: 'Nông dân', officer: 'Cán bộ', manager: 'Quản lý' } as const

/** Routes: `GET /api/profile`: who the person is and their cooperative; no ids, tokens or account data. */
export const profileTool: ChatTool = {
  name: 'profile',
  titleVi: 'Hồ sơ',
  roles: ['farmer', 'officer', 'manager'],
  routes: ['GET /api/profile'],
  args: [],
  async run(user) {
    const htx = await new PrismaHtxProfileRepository(prisma).getProfile(user.tenant.htxCode)
    const household = user.householdId
      ? await prisma.household.findFirst({
          where: { id: user.householdId, htx_profile_id: user.tenant.htxProfileId },
          select: { name: true, phone: true, address: true },
        })
      : null
    return reply('Hồ sơ', [
      `${user.userName} · ${ROLE_LABEL[user.tenant.role]}`,
      ...(household ? [`Hộ: ${household.name} · ${household.phone}`, ...(household.address ? [household.address] : [])] : []),
      ...(htx ? [`HTX: ${htx.name} (${htx.htx_code})`, htx.address, ...(htx.contact_phone ? [`Liên hệ: ${htx.contact_phone}`] : [])] : []),
    ])
  },
}
