// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { formatVnDate } from '@/application/agent/actions/journal-labels'
import { PrismaDiseaseReportRepository } from '@/infrastructure/db/farm/PrismaDiseaseReportRepository'
import type { ChatTool } from '../types'
import { miniAppBaseUrl } from '../mini-app'
import { reply } from './common'
import { findParcelByCode, notFoundReply, textArg } from './scoped'

/** Routes: `GET /api/parcels/[id]/latest-photo`; chat never carries a signed photo URL, only the date and the app link. */
export const photoTool: ChatTool = {
  name: 'photo',
  titleVi: 'Ảnh thửa',
  roles: ['farmer', 'officer', 'manager'],
  routes: ['GET /api/parcels/[id]/latest-photo'],
  args: [{ name: 'parcel_code', type: 'string', descriptionVi: 'Mã thửa' }],
  async run(user, args) {
    const code = textArg(args, 'parcel_code')
    if (!code) return reply('Ảnh thửa', ['Nhắn "ảnh thửa <mã thửa>".'])
    const parcel = await findParcelByCode(user, code)
    if (!parcel) return notFoundReply('Ảnh thửa', 'thửa')
    const latest = await new PrismaDiseaseReportRepository().findLatestByParcelId(parcel.id)
    if (!latest) return reply('Ảnh thửa', [`Thửa ${parcel.parcel_code} chưa có ảnh.`])
    const base = miniAppBaseUrl()
    return reply('Ảnh thửa', [
      `Thửa ${parcel.parcel_code}`,
      `Ảnh mới nhất: ${formatVnDate(latest.detection_date) ?? '—'}`,
      'Nguồn ảnh: báo cáo bệnh',
      ...(base ? [`Xem ảnh trong ứng dụng: ${base}/telegram/open`] : []),
    ])
  },
}
