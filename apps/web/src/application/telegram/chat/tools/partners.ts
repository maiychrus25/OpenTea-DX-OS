// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { prisma } from '@/infrastructure/db/prisma.client'
import type { ChatTool } from '../types'
import { reply } from './common'

/** Routes: `GET /api/partners`. Partners belong to one cooperative; officers and managers read those of their own. */
export const partnersTool: ChatTool = {
  name: 'partners',
  titleVi: 'Đối tác',
  roles: ['officer', 'manager'],
  routes: ['GET /api/partners'],
  args: [],
  async run(user) {
    const partners = await prisma.partner.findMany({
      where: { htx_profile_id: user.tenant.htxProfileId },
      orderBy: { created_at: 'desc' },
      take: 10,
      select: { name: true, partner_type: true, contact_phone: true, address: true },
    })
    return reply(
      'Đối tác',
      partners.map((partner) => [partner.name, partner.partner_type, partner.contact_phone ?? partner.address].filter(Boolean).join(' · '))
    )
  },
}
