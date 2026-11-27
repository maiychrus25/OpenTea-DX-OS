// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { prisma } from '@/infrastructure/db/prisma.client'
import type { ChatTool } from '../types'
import { reply } from './common'

/** Routes: `GET /api/partners`. The route has no tenant filter (partners are shared) and every signed-in role may read. */
export const partnersTool: ChatTool = {
  name: 'partners',
  titleVi: 'Đối tác',
  roles: ['farmer', 'officer', 'manager'],
  routes: ['GET /api/partners'],
  args: [],
  async run() {
    const partners = await prisma.partner.findMany({
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
