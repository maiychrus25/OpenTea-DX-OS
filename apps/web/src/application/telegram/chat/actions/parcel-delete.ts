// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import { DeleteParcelUseCase } from '@/application/farm/DeleteParcelUseCase'
import { PrismaParcelRepository } from '@/infrastructure/db/farm/PrismaParcelRepository'
import { TenantGuard } from '@/lib/api/tenant-guard'
import type { ChatAction } from '../types'
import { parcelChoices, parcelCode } from './common'
import { MAX_CHOICES, inCooperative, notFound } from './scope'

type ParcelDeletePayload = { parcel_id: string }

/** Routes: `DELETE /api/farm/parcels/[id]`, for officers and managers; the use case refuses a parcel in an active lot. */
export const parcelDeleteAction: ChatAction<ParcelDeletePayload> = {
  name: 'parcel.delete',
  titleVi: 'Xoá thửa đất',
  risk: 'high',
  roles: ['officer', 'manager'],
  routes: ['DELETE /api/farm/parcels/[id]'],
  args: [],
  steps: [
    {
      kind: 'choice',
      slot: 'parcel_id',
      promptVi: 'Chọn thửa cần xoá:',
      choices: async (user) => (await parcelChoices(user)).slice(0, MAX_CHOICES),
    },
  ],
  payloadSchema: z.object({ parcel_id: z.string().min(1) }),
  consequenceVi: 'Thửa đất sẽ bị xoá và không thể khôi phục. Thửa đang gắn với lô hàng sẽ không xoá được.',
  async preview(payload, user) {
    return [`Thửa: ${await parcelCode(user, payload.parcel_id)}`]
  },
  async execute(payload, user) {
    await inCooperative(new TenantGuard(user.tenant).parcel(payload.parcel_id))
    const repo = new PrismaParcelRepository()
    const parcel = await repo.findById(payload.parcel_id)
    if (!parcel) throw notFound()
    await new DeleteParcelUseCase(repo).execute(payload.parcel_id)
    return `Đã xoá thửa ${parcel.parcel_code}.`
  },
}
