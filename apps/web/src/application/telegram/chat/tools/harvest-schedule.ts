// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { formatVnDayMonth } from '@/application/agent/actions/journal-labels'
import { GetHarvestScheduleUseCase } from '@/application/farm/get-harvest-schedule-use-case'
import type { HarvestEvent } from '@/domain/farm/entities/HarvestEvent'
import { PrismaCropCycleRepository } from '@/infrastructure/db/farm/PrismaCropCycleRepository'
import { prisma } from '@/infrastructure/db/prisma.client'
import type { ChatTool, ChatUser } from '../types'
import { reply, visibleParcels } from './common'

const DAY_MS = 24 * 60 * 60 * 1000

/** Harvest events of the cooperative in the next `days`, narrowed to the parcels the user may see. */
export async function upcomingHarvests(user: ChatUser, now: Date, days: number): Promise<HarvestEvent[]> {
  const events = await new GetHarvestScheduleUseCase(new PrismaCropCycleRepository(prisma)).execute(
    user.tenant.htxProfileId,
    now.toISOString(),
    new Date(now.getTime() + days * DAY_MS).toISOString()
  )
  if (user.tenant.role !== 'farmer') return events
  const visible = new Set((await visibleParcels(user)).map((parcel) => parcel.id))
  return events.filter((event) => visible.has(event.parcelId))
}

/** Routes: `GET /api/schedule/harvest`, for the next 60 days, earliest first. */
export const harvestScheduleTool: ChatTool = {
  name: 'harvest_schedule',
  titleVi: 'Lịch thu hoạch',
  roles: ['farmer', 'officer', 'manager'],
  routes: ['GET /api/schedule/harvest'],
  args: [],
  async run(user, _args, now) {
    const events = (await upcomingHarvests(user, now, 60)).sort((a, b) =>
      (a.estimatedHarvestDate ?? '').localeCompare(b.estimatedHarvestDate ?? '')
    )
    return reply(
      'Lịch thu hoạch',
      events.map((event) => `${formatVnDayMonth(event.estimatedHarvestDate) ?? '—'} · ${event.parcelName ?? event.parcelId} · ${event.cropType}`)
    )
  },
}
