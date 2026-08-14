// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { LotTraceRepository } from '@/domain/repositories/lot-trace-repository'
import { LotTraceData } from '@/domain/entities/lot-trace-data'
import { prisma } from '@/infrastructure/db/prisma.client'

// Export pure function for unit testing
export function computeSafeHarvestDate(
  entries: Array<{ entry_date: Date; activities: Array<{ withdrawal_days: number | null }> }>
): Date | null {
  let latestSafeDate: Date | null = null
  for (const entry of entries) {
    for (const act of entry.activities) {
      if (act.withdrawal_days !== null && act.withdrawal_days !== undefined) {
        const safeDate = new Date(entry.entry_date)
        safeDate.setDate(safeDate.getDate() + act.withdrawal_days)
        if (!latestSafeDate || safeDate > latestSafeDate) {
          latestSafeDate = safeDate
        }
      }
    }
  }
  return latestSafeDate
}

export class PrismaLotTraceRepository implements LotTraceRepository {
  async getLotByCode(lot_code: string): Promise<LotTraceData | null> {
    const lot = await prisma.lot.findUnique({
      where: { lot_code },
      include: {
        htx_profile: true,
        lot_parcels: {
          include: {
            parcel: {
              include: {
                household: true,
                journal_entries: {
                  include: { activities: true },
                  where: { status: { not: 'PENDING_APPROVAL' } },
                  orderBy: { entry_date: 'asc' },
                  take: 20,
                }
              }
            }
          }
        }
      }
    })

    if (!lot) return null

    const allEntries = lot.lot_parcels.flatMap(lp => lp.parcel.journal_entries)
    const latestSafeDate = computeSafeHarvestDate(allEntries)
    
    // Set hours to 0 to compare dates properly without time components
    const isHarvestSafe = latestSafeDate ? latestSafeDate <= new Date() : false

    return {
      lot_code: lot.lot_code,
      commodity: lot.commodity,
      quality_grade: lot.quality_grade,
      status: lot.status,
      packaging_date: lot.packaging_date,
      total_weight_kg: lot.total_weight_kg,
      created_at: lot.created_at,
      is_harvest_safe: isHarvestSafe,
      latest_safe_harvest_date: latestSafeDate,
      parcels: lot.lot_parcels.map(lp => ({
        parcel_code: lp.parcel.parcel_code,
        area_ha: lp.parcel.area_ha,
        household_name: lp.parcel.household.name,
        crop_type: lp.parcel.crop_type,
      })),
      journal_summaries: lot.lot_parcels.flatMap(lp =>
        lp.parcel.journal_entries.map(e => ({
          entry_date: e.entry_date,
          activity_type: e.activity_type,
          performed_by: e.performed_by,
          approved_by_id: e.approved_by_id,
          withdrawal_days: e.activities[0]?.withdrawal_days ?? null,
        }))
      ),
      certificate_keys: lot.certificate_keys,
      htx_name: lot.htx_profile?.name ?? null,
    }
  }
}
