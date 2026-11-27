// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import { DomainError } from '@/domain/errors'
import { isLabsEnabled } from '@/lib/labs'
import { CreateLotUseCase } from '@/application/lot/CreateLotUseCase'
import { localDay } from '@/domain/shared/local-day'
import { PrismaParcelRepository } from '@/infrastructure/db/farm/PrismaParcelRepository'
import { PrismaJournalRepository } from '@/infrastructure/db/journal/PrismaJournalRepository'
import { PrismaLotRepository } from '@/infrastructure/db/lot/PrismaLotRepository'
import { TenantGuard } from '@/lib/api/tenant-guard'
import type { ChatAction } from '../types'
import { parcelChoices, parcelCode } from './common'
import { MAX_CHOICES, inCooperative, notFound } from './scope'

/** The parcel states `CreateLotUseCase` accepts. */
const LOT_STATUSES = ['TENDING', 'HARVEST_APPROVED', 'HARVESTED']

type LotCreatePayload = { parcel_id: string; weight_kg: number }

/**
 * Routes: `POST /api/lots`, which admits officers only. A lot from chat has one parcel, its crop and today as the
 * harvest date; the packaging, destination, buyer and certificates stay on the web form.
 */
export const lotCreateAction: ChatAction<LotCreatePayload> = {
  name: 'lot.create',
  titleVi: 'Tạo lô hàng',
  risk: 'medium',
  roles: ['officer'],
  routes: ['POST /api/lots'],
  args: [
    { name: 'parcel_id', type: 'string', descriptionVi: 'Mã thửa của lô' },
    { name: 'weight_kg', type: 'integer', descriptionVi: 'Khối lượng ước tính, kg' },
  ],
  steps: [
    {
      kind: 'choice',
      slot: 'parcel_id',
      promptVi: 'Chọn thửa của lô:',
      choices: async (user) => (await parcelChoices(user, (parcel) => LOT_STATUSES.includes(parcel.status))).slice(0, MAX_CHOICES),
    },
    { kind: 'integer', slot: 'weight_kg', promptVi: 'Khối lượng ước tính (kg):', min: 1, max: 1_000_000 },
  ],
  payloadSchema: z.object({ parcel_id: z.string().min(1), weight_kg: z.number().int().min(1).max(1_000_000) }),
  consequenceVi: null,
  async preview(payload, user) {
    return [`Thửa: ${await parcelCode(user, payload.parcel_id)}`, `Khối lượng ước tính: ${payload.weight_kg} kg`, 'Ngày thu hoạch: hôm nay']
  },
  async execute(payload, user, _deps, now) {
    // Frozen with POST /api/lots: a lot is closed from dry tea stock on the web.
    if (!isLabsEnabled()) throw new DomainError('Tạo lô từ thửa đã chuyển sang Đóng lô từ mẻ.')
    await inCooperative(new TenantGuard(user.tenant).parcel(payload.parcel_id))
    const parcel = await new PrismaParcelRepository().findById(payload.parcel_id)
    if (!parcel) throw notFound()
    const lot = await new CreateLotUseCase(new PrismaLotRepository(), new PrismaParcelRepository(), new PrismaJournalRepository()).execute({
      commodity: parcel.crop_type,
      harvest_date: new Date(localDay(now)),
      estimated_weight_kg: payload.weight_kg,
      parcel_ids: [payload.parcel_id],
      htx_profile_id: user.tenant.htxProfileId,
      created_by_id: user.tenant.userId,
    })
    return `Đã tạo lô ${lot.lot_code}.`
  },
}
