// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { PrismaClient } from '@prisma/client'
import { CropCyclePort } from '../../../domain/farm/ports/CropCyclePort'
import { HarvestEvent } from '../../../domain/farm/entities/HarvestEvent'

export class PrismaCropCycleRepository implements CropCyclePort {
  constructor(private readonly prisma: PrismaClient) {}

  async getHarvestSchedule(htxProfileId: string, startDate: string, endDate: string): Promise<HarvestEvent[]> {
    const start = new Date(startDate)
    const end = new Date(endDate)

    const cycles = await this.prisma.parcelCropCycle.findMany({
      where: {
        parcel: { household: { htx_profile_id: htxProfileId } },
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
              include: {
                activities: true,
              },
            },
          },
        },
      },
    })

    return cycles.map((cycle) => {
      // Find the latest safe_harvest_date from journal activities for this parcel
      // Note: we only consider journals that happened during this cycle. 
      // If cycle.sowed_at exists, entry_date >= cycle.sowed_at
      let latestSafeHarvestDate: Date | null = null
      
      for (const entry of cycle.parcel.journal_entries) {
        if (cycle.sowed_at && entry.entry_date < cycle.sowed_at) {
          continue // skip entries before sowing
        }
        
        for (const activity of entry.activities) {
          if (activity.safe_harvest_date) {
            if (!latestSafeHarvestDate || activity.safe_harvest_date > latestSafeHarvestDate) {
              latestSafeHarvestDate = activity.safe_harvest_date
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
        estimatedYieldKg: cycle.parcel.estimated_yield_per_ha ? (cycle.parcel.estimated_yield_per_ha * cycle.parcel.area_ha) : null,
        estimatedHarvestDate: cycle.estimated_harvest_date ? cycle.estimated_harvest_date.toISOString() : null,
        safeHarvestDate: latestSafeHarvestDate ? latestSafeHarvestDate.toISOString() : null,
        status,
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
}
