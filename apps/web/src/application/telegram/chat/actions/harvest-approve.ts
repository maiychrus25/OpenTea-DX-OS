// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import { ApproveHarvestUseCase } from '@/application/farm/approve-harvest-usecase'
import { PrismaJournalRepository } from '@/infrastructure/db/journal/PrismaJournalRepository'
import { PrismaParcelRepository } from '@/infrastructure/db/farm/PrismaParcelRepository'
import { PrismaNotificationRepository } from '@/infrastructure/db/notification/prisma-notification-repository'
import { TenantGuard } from '@/lib/api/tenant-guard'
import type { ChatAction } from '../types'
import { parcelChoices, parcelCode } from './common'

type HarvestApprovePayload = { parcel_id: string }

const payloadSchema = z.object({ parcel_id: z.string().min(1) })

/**
 * Routes: `POST /api/parcels/[id]/approve-harvest`. The route and its use case admit officers as well as managers,
 * so the action follows the route; the manager-only role of contract C6 is not applied.
 */
export const harvestApproveAction: ChatAction<HarvestApprovePayload> = {
  name: 'harvest.approve',
  titleVi: 'Duyệt thu hoạch',
  risk: 'high',
  roles: ['officer', 'manager'],
  routes: ['POST /api/parcels/[id]/approve-harvest'],
  args: [{ name: 'parcel_id', type: 'string', descriptionVi: 'Mã thửa đang chờ duyệt thu hoạch' }],
  steps: [
    {
      kind: 'choice',
      slot: 'parcel_id',
      promptVi: 'Chọn thửa cần duyệt thu hoạch:',
      choices: (user) => parcelChoices(user, (parcel) => parcel.status === 'TENDING'),
    },
  ],
  payloadSchema,
  consequenceVi: 'Thửa sẽ được phép thu hái. Hệ thống kiểm tra lại thời gian cách ly trước khi duyệt.',
  async preview(payload, user) {
    return [`Thửa: ${await parcelCode(user, payload.parcel_id)}`]
  },
  async execute(payload, user) {
    await new TenantGuard(user.tenant).parcel(payload.parcel_id)
    const parcel = await new ApproveHarvestUseCase(
      new PrismaParcelRepository(),
      new PrismaJournalRepository(),
      new PrismaNotificationRepository()
    ).execute(payload.parcel_id, user.tenant.userId, user.tenant.role)
    return `Đã duyệt thu hoạch thửa ${parcel.parcel_code}.`
  },
}
