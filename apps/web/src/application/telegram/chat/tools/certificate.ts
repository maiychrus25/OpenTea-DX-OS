// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { formatVnDate } from '@/application/agent/actions/journal-labels'
import { prisma } from '@/infrastructure/db/prisma.client'
import type { ChatTool } from '../types'
import { miniAppBaseUrl } from '../mini-app'
import { reply } from './common'
import { notFoundReply, textArg } from './scoped'

/** Routes: `GET /api/lot/[lot_code]/certificate`; chat shows the lot's facts and the public trace link, never the file. */
export const certificateTool: ChatTool = {
  name: 'certificate',
  titleVi: 'Chứng nhận lô hàng',
  roles: ['farmer', 'officer', 'manager'],
  routes: ['GET /api/lot/[lot_code]/certificate'],
  args: [{ name: 'lot_code', type: 'string', descriptionVi: 'Mã lô hàng' }],
  async run(user, args) {
    const code = textArg(args, 'lot_code')
    if (!code) return reply('Chứng nhận', ['Nhắn "chứng nhận <mã lô>".'])
    const lot = await prisma.lot.findFirst({
      where: { lot_code: { equals: code, mode: 'insensitive' }, htx_profile_id: user.tenant.htxProfileId },
      select: { lot_code: true, commodity: true, harvest_date: true, status: true, certificate_keys: true },
    })
    if (!lot) return notFoundReply('Chứng nhận', 'lô hàng')
    const base = miniAppBaseUrl()
    return reply('Chứng nhận', [
      `Lô ${lot.lot_code}`,
      `Sản phẩm: ${lot.commodity}`,
      `Ngày thu hoạch: ${formatVnDate(lot.harvest_date) ?? '—'}`,
      `Trạng thái: ${lot.status}, ${lot.certificate_keys.length} chứng nhận`,
      ...(lot.status === 'QR_EXPORTED' && base ? [`Truy xuất: ${base}/q/${lot.lot_code}`] : []),
    ])
  },
}
