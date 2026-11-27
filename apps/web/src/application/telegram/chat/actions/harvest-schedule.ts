// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import { formatVnDate } from '@/application/agent/actions/journal-labels'
import { UpdateHarvestDateUseCase } from '@/application/farm/update-harvest-date-use-case'
import { PrismaCropCycleRepository } from '@/infrastructure/db/farm/PrismaCropCycleRepository'
import { prisma } from '@/infrastructure/db/prisma.client'
import { TenantGuard } from '@/lib/api/tenant-guard'
import type { ChatAction, ChatUser, Choice } from '../types'
import { MAX_CHOICES, inCooperative, notFound, parseVnDate } from './scope'

type HarvestSchedulePayload = { cycle_id: string; date: string }

const payloadSchema = z.object({
  cycle_id: z.string().min(1),
  date: z.string().trim().refine((text) => parseVnDate(text) !== null, { message: 'Ngày không hợp lệ' }),
})

const open = (user: ChatUser) => ({ parcel: { household: { htx_profile_id: user.tenant.htxProfileId } }, harvested_at: null })

async function cycleChoices(user: ChatUser): Promise<Choice[]> {
  const cycles = await prisma.parcelCropCycle.findMany({
    where: open(user),
    orderBy: { created_at: 'desc' },
    take: MAX_CHOICES,
    select: { id: true, season: true, parcel: { select: { parcel_code: true } } },
  })
  return cycles.map((cycle) => ({ value: cycle.id, label: `${cycle.parcel.parcel_code}${cycle.season ? ` · ${cycle.season}` : ''}` }))
}

/** Routes: `PATCH /api/schedule/harvest/[cycle_id]`, which admits managers only. */
export const harvestScheduleAction: ChatAction<HarvestSchedulePayload> = {
  name: 'harvest.schedule',
  titleVi: 'Đặt ngày thu hoạch',
  risk: 'medium',
  roles: ['manager'],
  routes: ['PATCH /api/schedule/harvest/[cycle_id]'],
  args: [],
  steps: [
    { kind: 'choice', slot: 'cycle_id', promptVi: 'Chọn thửa và lứa:', choices: (user) => cycleChoices(user) },
    { kind: 'text', slot: 'date', promptVi: 'Nhập ngày thu hoạch dự kiến, dạng 25/12/2026:', maxLength: 10 },
  ],
  payloadSchema,
  consequenceVi: null,
  async preview(payload, user) {
    const cycle = await prisma.parcelCropCycle.findFirst({
      where: { id: payload.cycle_id, ...open(user) },
      select: { season: true, parcel: { select: { parcel_code: true } } },
    })
    if (!cycle) throw notFound()
    return [`Thửa: ${cycle.parcel.parcel_code}${cycle.season ? ` · ${cycle.season}` : ''}`, `Ngày thu hoạch dự kiến: ${formatVnDate(parseVnDate(payload.date)) ?? payload.date}`]
  },
  async execute(payload, user) {
    await inCooperative(new TenantGuard(user.tenant).cropCycle(payload.cycle_id))
    const day = parseVnDate(payload.date)!
    await new UpdateHarvestDateUseCase(new PrismaCropCycleRepository(prisma)).execute(payload.cycle_id, day.toISOString())
    return `Đã đặt ngày thu hoạch dự kiến ${formatVnDate(day)}.`
  },
}
