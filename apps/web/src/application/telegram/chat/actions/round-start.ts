// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import { StartHarvestRoundUseCase } from '@/application/farm/start-harvest-round.usecase'
import { PrismaCropCycleRepository } from '@/infrastructure/db/farm/PrismaCropCycleRepository'
import { prisma } from '@/infrastructure/db/prisma.client'
import { TenantGuard } from '@/lib/api/tenant-guard'
import type { ChatAction } from '../types'
import { parcelChoices, parcelCode } from './common'
import { MAX_CHOICES, inCooperative } from './scope'

type RoundStartPayload = { parcel_id: string }

/** Routes: `POST /api/parcels/[id]/start-round`, which admits officers only. */
export const roundStartAction: ChatAction<RoundStartPayload> = {
  name: 'round.start',
  titleVi: 'Bắt đầu lứa mới',
  risk: 'medium',
  roles: ['officer'],
  routes: ['POST /api/parcels/[id]/start-round'],
  args: [{ name: 'parcel_id', type: 'string', descriptionVi: 'Mã thửa đã thu hoạch xong' }],
  steps: [
    {
      kind: 'choice',
      slot: 'parcel_id',
      promptVi: 'Chọn thửa đã thu hoạch để bắt đầu lứa mới:',
      choices: async (user) => (await parcelChoices(user, (parcel) => parcel.status === 'HARVESTED')).slice(0, MAX_CHOICES),
    },
  ],
  payloadSchema: z.object({ parcel_id: z.string().min(1) }),
  consequenceVi: null,
  async preview(payload, user) {
    return [`Thửa: ${await parcelCode(user, payload.parcel_id)}`]
  },
  async execute(payload, user) {
    await inCooperative(new TenantGuard(user.tenant).parcel(payload.parcel_id))
    const round = await new StartHarvestRoundUseCase(new PrismaCropCycleRepository(prisma)).execute(payload.parcel_id, user.tenant.userId)
    return `Đã bắt đầu ${round.season} cho thửa ${await parcelCode(user, payload.parcel_id)}.`
  },
}
