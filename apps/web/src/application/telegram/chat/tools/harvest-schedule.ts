// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { formatVnDayMonth } from '@/application/agent/actions/journal-labels'
import { GetHarvestScheduleUseCase } from '@/application/farm/get-harvest-schedule-use-case'
import { GetUnscheduledCyclesUseCase } from '@/application/farm/get-unscheduled-cycles-use-case'
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

/** The cooperative's open cycles with no harvest date, in one line: the count and up to three parcels. */
async function unscheduledLine(user: ChatUser): Promise<string[]> {
  const cycles = await new GetUnscheduledCyclesUseCase(new PrismaCropCycleRepository(prisma)).execute(user.tenant.htxProfileId)
  if (!cycles.length) return []
  const names = cycles.slice(0, 3).map((cycle) => cycle.parcelName ?? cycle.parcelId)
  return [`Chưa đặt ngày: ${cycles.length} lứa · ${names.join(', ')}${cycles.length > 3 ? ', …' : ''}`]
}

/**
 * Routes: `GET /api/schedule/harvest`, for the next 60 days, earliest first. A manager, the only role
 * `GET /api/schedule/unscheduled` admits, first reads which cycles have no harvest date yet.
 */
export const harvestScheduleTool: ChatTool = {
  name: 'harvest_schedule',
  titleVi: 'Lịch thu hoạch',
  roles: ['farmer', 'officer', 'manager'],
  routes: ['GET /api/schedule/harvest', 'GET /api/schedule/unscheduled'],
  args: [],
  async run(user, _args, now) {
    const events = (await upcomingHarvests(user, now, 60)).sort((a, b) =>
      (a.estimatedHarvestDate ?? '').localeCompare(b.estimatedHarvestDate ?? '')
    )
    const unscheduled = user.tenant.role === 'manager' ? await unscheduledLine(user) : []
    return reply('Lịch thu hoạch', [
      ...unscheduled,
      ...events.map((event) => `${formatVnDayMonth(event.estimatedHarvestDate) ?? '—'} · ${event.parcelName ?? event.parcelId} · ${event.cropType}`),
    ])
  },
}
