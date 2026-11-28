// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { Prisma, PrismaClient } from '@prisma/client'
import { CropCyclePort } from '../../../domain/farm/ports/CropCyclePort'
import { WITHDRAWAL_EXCLUDED_STATUSES } from '../../../domain/journal/withdrawal-status'
import { belongsToLotLine, openParcelBlock } from '../../../domain/journal/blocking-sprays'
import { HarvestEvent } from '../../../domain/farm/entities/HarvestEvent'
import { nextHarvestRoundSeason } from '../../../domain/farm/harvest-round'

type Tx = Prisma.TransactionClient

const startOf = (c: { sowed_at: Date | null; created_at: Date }) => (c.sowed_at ?? c.created_at).getTime()

/**
 * The open plucking flush of a parcel; when every flush is closed, opens the next one.
 * Only creates the flush: the parcel status changes when the journal entry is approved.
 * A parcel without any flush returns null (legacy parcels keep the parcel-wide withdrawal check).
 */
export async function ensureOpenCycle(tx: Tx, parcelId: string, now: Date): Promise<string | null> {
  // The parcel row lock serializes two writers, so only one of them opens the next flush.
  await tx.$queryRaw`SELECT id FROM parcels WHERE id = ${parcelId} FOR UPDATE`
  const cycles = await tx.parcelCropCycle.findMany({ where: { parcel_id: parcelId }, select: { id: true, harvested_at: true, created_at: true } })
  if (cycles.length === 0) return null
  const open = cycles.filter((c) => !c.harvested_at).sort((a, b) => b.created_at.getTime() - a.created_at.getTime())[0]
  if (open) return open.id
  const season = nextHarvestRoundSeason(cycles.map((c) => c.created_at), now)
  const created = await tx.parcelCropCycle.create({ data: { parcel_id: parcelId, season, sowed_at: now, created_at: now }, select: { id: true } })
  return created.id
}

/**
 * The flush a care entry of `entryDate` belongs to: the latest flush started by then; if that one closed before
 * the date, the open flush. An entry on the harvest day itself stays in the closed flush.
 */
export async function cycleForEntryDate(tx: Tx, parcelId: string, entryDate: Date, now: Date = new Date()): Promise<string | null> {
  const cycles = await tx.parcelCropCycle.findMany({
    where: { parcel_id: parcelId },
    select: { id: true, sowed_at: true, harvested_at: true, created_at: true },
  })
  if (cycles.length === 0) return null
  const sorted = [...cycles].sort((a, b) => startOf(b) - startOf(a) || b.created_at.getTime() - a.created_at.getTime())
  const started = sorted.find((c) => startOf(c) <= entryDate.getTime())
  if (!started) return sorted[sorted.length - 1].id
  if (started.harvested_at && entryDate.getTime() > started.harvested_at.getTime()) return ensureOpenCycle(tx, parcelId, now)
  return started.id
}

/** The flush a HARVEST entry closes: the newest open flush, else the newest one. */
export async function cycleForHarvest(tx: Tx, parcelId: string): Promise<string | null> {
  const cycles = await tx.parcelCropCycle.findMany({ where: { parcel_id: parcelId }, select: { id: true, harvested_at: true, created_at: true } })
  const newest = [...cycles].sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
  return (newest.find((c) => !c.harvested_at) ?? newest[0])?.id ?? null
}

/** The flush of a lot line: the latest one harvested on or before the lot's harvest date, else the open flush. */
export async function cycleForLotLine(tx: Pick<Tx, 'parcelCropCycle'>, parcelId: string, harvestDate: Date): Promise<string | null> {
  const cycles = await tx.parcelCropCycle.findMany({ where: { parcel_id: parcelId }, select: { id: true, harvested_at: true, created_at: true } })
  const closed = cycles
    .filter((c) => c.harvested_at && c.harvested_at.getTime() <= harvestDate.getTime())
    .sort((a, b) => b.harvested_at!.getTime() - a.harvested_at!.getTime())[0]
  if (closed) return closed.id
  return cycles.filter((c) => !c.harvested_at).sort((a, b) => b.created_at.getTime() - a.created_at.getTime())[0]?.id ?? null
}

export class PrismaCropCycleRepository implements CropCyclePort {
  constructor(private readonly prisma: PrismaClient) {}

  async getHarvestSchedule(htxProfileId: string, startDate: string, endDate: string, farmerUserId?: string): Promise<HarvestEvent[]> {
    const start = new Date(startDate)
    const end = new Date(endDate)

    const cycles = await this.prisma.parcelCropCycle.findMany({
      where: {
        // A farmer gets only their own household: the rows carry the products it sprayed.
        parcel: { household: { htx_profile_id: htxProfileId, ...(farmerUserId !== undefined && { keycloak_user_id: farmerUserId }) } },
        estimated_harvest_date: {
          gte: start,
          lte: end,
        },
      },
      include: {
        parcel: {
          include: {
            household: true,
            journal_entries: {
              where: { status: { notIn: [...WITHDRAWAL_EXCLUDED_STATUSES] } },
              include: {
                activities: true,
              },
            },
          },
        },
      },
    })

    return cycles.map((cycle) => {
      // Open flush: residue stays in the plant, so every spraying of the parcel done by the check date counts.
      // Harvested flush: the lot-line rule with the harvest date.
      const isOpen = !cycle.harvested_at
      const checkDate = cycle.harvested_at ?? cycle.estimated_harvest_date ?? new Date()
      const counted = cycle.parcel.journal_entries.filter((e) =>
        isOpen ? e.entry_date <= checkDate : belongsToLotLine(e, checkDate, cycle.id)
      )
      let latestSafeHarvestDate: Date | null = null
      let treatment: HarvestEvent['treatment'] = null

      for (const entry of counted) {
        for (const activity of entry.activities) {
          if (activity.safe_harvest_date) {
            if (!latestSafeHarvestDate || activity.safe_harvest_date > latestSafeHarvestDate) {
              latestSafeHarvestDate = activity.safe_harvest_date
              treatment = {
                activity: entry.activity_type,
                product: activity.product_name ?? null,
                date: entry.entry_date?.toISOString() ?? '',
                withdrawalDays: activity.withdrawal_days ?? null,
              }
            }
          }
        }
      }

      // Determine status
      let status: 'SAFE' | 'WARNING' | 'DANGER' = 'SAFE'
      const estimated = cycle.estimated_harvest_date
      
      if (estimated && latestSafeHarvestDate) {
        if (estimated < latestSafeHarvestDate) {
          status = 'DANGER' // thu hoạch trước ngày an toàn
        } else if (estimated.getTime() - latestSafeHarvestDate.getTime() < 3 * 24 * 60 * 60 * 1000) {
          status = 'WARNING' // thu hoạch sát ngày an toàn (trong vòng 3 ngày)
        }
      }

      return {
        cycleId: cycle.id,
        parcelId: cycle.parcel.id,
        parcelName: cycle.parcel.parcel_code,
        householdName: cycle.parcel.household.name,
        cropType: cycle.parcel.crop_type,
        areaHa: cycle.parcel.area_ha,
        estimatedYieldKg: cycle.parcel.estimated_yield_per_ha ? (cycle.parcel.estimated_yield_per_ha * cycle.parcel.area_ha) : null,
        estimatedHarvestDate: cycle.estimated_harvest_date ? cycle.estimated_harvest_date.toISOString() : null,
        safeHarvestDate: latestSafeHarvestDate ? latestSafeHarvestDate.toISOString() : null,
        status,
        treatment,
        harvestedAt: cycle.harvested_at ? cycle.harvested_at.toISOString() : null,
        parcelStatus: cycle.parcel.status,
        // Approval is offered for the open flush of a parcel in TENDING once the withdrawal is over.
        canApprove: cycle.parcel.status === 'TENDING' && isOpen && openParcelBlock(cycle.parcel.journal_entries, new Date()) === null,
      }
    })
  }

  async updateEstimatedHarvestDate(cycleId: string, newDate: string): Promise<void> {
    await this.prisma.parcelCropCycle.update({
      where: { id: cycleId },
      data: { estimated_harvest_date: new Date(newDate) },
    })
  }

  async getUnscheduledActiveCycles(htxProfileId: string): Promise<HarvestEvent[]> {
    const cycles = await this.prisma.parcelCropCycle.findMany({
      where: {
        parcel: { household: { htx_profile_id: htxProfileId } },
        harvested_at: null,
        estimated_harvest_date: null,
      },
      include: {
        parcel: {
          include: {
            household: true,
          },
        },
      },
    })

    return cycles.map((cycle) => ({
      cycleId: cycle.id,
      parcelId: cycle.parcel.id,
      parcelName: cycle.parcel.parcel_code,
      householdName: cycle.parcel.household.name,
      cropType: cycle.parcel.crop_type,
      estimatedYieldKg: cycle.parcel.estimated_yield_per_ha ? (cycle.parcel.estimated_yield_per_ha * cycle.parcel.area_ha) : null,
      estimatedHarvestDate: null,
      safeHarvestDate: null,
      status: 'SAFE', // default for unscheduled
    }))
  }

  async startNextRound(parcelId: string): Promise<{ cycleId: string; season: string } | null> {
    return this.prisma.$transaction(async (tx) => {
      // The conditional update locks the parcel row, so a second start waits and then finds it TENDING.
      const { count } = await tx.parcel.updateMany({ where: { id: parcelId, status: 'HARVESTED' }, data: { status: 'TENDING' } })
      if (count !== 1) return null

      const now = new Date()
      const cycles = await tx.parcelCropCycle.findMany({ where: { parcel_id: parcelId }, select: { id: true, season: true, harvested_at: true, created_at: true } })
      // A flush opened earlier by a care entry is the next round: do not open a second one.
      const open = cycles.filter((c) => !c.harvested_at).sort((a, b) => b.created_at.getTime() - a.created_at.getTime())[0]
      if (open) return { cycleId: open.id, season: open.season ?? '' }
      const season = nextHarvestRoundSeason(cycles.map((c) => c.created_at), now)
      const cycle = await tx.parcelCropCycle.create({ data: { parcel_id: parcelId, season, created_at: now }, select: { id: true } })
      return { cycleId: cycle.id, season }
    })
  }
}
