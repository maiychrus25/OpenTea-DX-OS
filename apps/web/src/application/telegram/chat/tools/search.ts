// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { GlobalSearchUseCase } from '@/application/search/GlobalSearchUseCase'
import type { ChatTool } from '../types'
import { reply, visibleParcels } from './common'
import { textArg } from './scoped'

const TYPE_LABEL = { HOUSEHOLD: 'Nông hộ', PARCEL: 'Thửa', LOT: 'Lô' } as const

/** Routes: `GET /api/search`, over the user's cooperative; a farmer's hits are cut to their household and parcels. */
export const searchTool: ChatTool = {
  name: 'search',
  titleVi: 'Tìm kiếm',
  roles: ['farmer', 'officer', 'manager'],
  routes: ['GET /api/search'],
  args: [{ name: 'query', type: 'string', descriptionVi: 'Từ khóa cần tìm, ít nhất 2 ký tự' }],
  async run(user, args) {
    const query = textArg(args, 'query')
    if (query.length < 2) return reply('Tìm kiếm', ['Nhắn "tìm <từ khóa>", ít nhất 2 ký tự.'])
    let hits = await new GlobalSearchUseCase().execute(query, user.tenant.htxProfileId)
    if (user.tenant.role === 'farmer') {
      const own = new Set((await visibleParcels(user)).map((parcel) => parcel.id))
      hits = hits.filter((hit) => hit.type === 'LOT' || (hit.type === 'PARCEL' ? own.has(hit.id) : hit.id === user.householdId))
    }
    if (!hits.length) return reply('Tìm kiếm', [`Không có kết quả cho "${query}".`])
    return reply('Tìm kiếm', hits.map((hit) => `${TYPE_LABEL[hit.type]} ${hit.title}${hit.subtitle ? ` · ${hit.subtitle}` : ''}`))
  },
}
