// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { ChatTool } from '../types'
import { reply, visibleParcels } from './common'

/** Routes: `GET /api/farm/parcels`, scoped as the route scopes it. */
export const parcelsTool: ChatTool = {
  name: 'parcels',
  titleVi: 'Vùng trồng',
  roles: ['farmer', 'officer', 'manager'],
  routes: ['GET /api/farm/parcels'],
  args: [],
  async run(user) {
    const parcels = await visibleParcels(user)
    return reply('Vùng trồng', parcels.map((parcel) => `${parcel.parcel_code} · ${parcel.crop_type} · ${parcel.area_ha} ha`))
  },
}
