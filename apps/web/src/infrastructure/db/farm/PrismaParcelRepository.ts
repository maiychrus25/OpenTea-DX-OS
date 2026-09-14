// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { ParcelPort, ParcelSummary, CreateParcelData, ParcelFilters } from '@/domain/farm/ports/ParcelPort'
import { prisma } from '@/infrastructure/db/prisma.client'

// Type for the crop_cycles relation included via CROP_CYCLE_INCLUDE
interface CropCycleRow {
  id: string
  season: string | null
  sowed_at: Date | null
  harvested_at: Date | null
  created_at: Date
}

const CROP_CYCLE_INCLUDE = {
  crop_cycles: {
    orderBy: { created_at: 'desc' as const },
    take: 1,
  },
}

export class PrismaParcelRepository implements ParcelPort {
  async findById(id: string): Promise<ParcelSummary | null> {
    const parcel = await prisma.parcel.findUnique({
      where: { id },
      include: {
        household: {
          select: { id: true, name: true, keycloak_user_id: true },
        },
        ...CROP_CYCLE_INCLUDE,
      },
    })
    if (!parcel) return null

    const latestCycle = (parcel as unknown as { crop_cycles: CropCycleRow[] }).crop_cycles?.[0]
    return {
      id: parcel.id,
      parcel_code: parcel.parcel_code,
      household_id: parcel.household_id,
      name: parcel.parcel_code,
      area_ha: parcel.area_ha,
      centroid_lat: parcel.centroid_lat,
      centroid_lng: parcel.centroid_lng,
      polygon_geojson: parcel.polygon_geojson,
      status: parcel.status,
      crop_type: parcel.crop_type,
      household: parcel.household,
      season: latestCycle?.season ?? null,
      sowed_at: latestCycle?.sowed_at?.toISOString() ?? null,
      harvested_at: latestCycle?.harvested_at?.toISOString() ?? null,
    }
  }

  async findAll(filters: ParcelFilters): Promise<ParcelSummary[]> {
    const where: Record<string, unknown> = {}
    if (filters.household_id) where.household_id = filters.household_id
    if (filters.status) where.status = filters.status

    const parcels = await prisma.parcel.findMany({
      where,
      include: {
        household: {
          select: { id: true, name: true, keycloak_user_id: true },
        },
        ...CROP_CYCLE_INCLUDE,
      },
      orderBy: { created_at: 'desc' },
    })

    return parcels.map(p => {
      const latestCycle = (p as unknown as { crop_cycles: CropCycleRow[] }).crop_cycles?.[0]
      return {
        id: p.id,
        parcel_code: p.parcel_code,
        household_id: p.household_id,
        name: p.parcel_code,
        area_ha: p.area_ha,
        centroid_lat: p.centroid_lat,
        centroid_lng: p.centroid_lng,
        polygon_geojson: p.polygon_geojson,
        status: p.status,
        crop_type: p.crop_type,
        household: p.household,
        season: latestCycle?.season ?? null,
        sowed_at: latestCycle?.sowed_at?.toISOString() ?? null,
        harvested_at: latestCycle?.harvested_at?.toISOString() ?? null,
      }
    })
  }

  async create(data: CreateParcelData): Promise<ParcelSummary> {
    const htx = await prisma.htxProfile.findFirst()
    const season = htx?.season_label ?? 'Vụ mùa mới'

    const parcel = await prisma.parcel.create({
      data: {
        household_id: data.household_id,
        parcel_code: data.parcel_code,
        crop_type: data.current_crop ?? '',
        area_ha: data.area_ha,
        centroid_lat: data.centroid_lat,
        centroid_lng: data.centroid_lng,
        polygon_geojson: data.geojson as any,
        crop_cycles: data.current_crop ? {
          create: [{
            season: season,
            sowed_at: new Date()
          }]
        } : undefined
      },
      include: {
        household: {
          select: { id: true, name: true, keycloak_user_id: true },
        },
      },
    })

    return {
      id: parcel.id,
      parcel_code: parcel.parcel_code,
      household_id: parcel.household_id,
      name: parcel.parcel_code,
      area_ha: parcel.area_ha,
      centroid_lat: parcel.centroid_lat,
      centroid_lng: parcel.centroid_lng,
      polygon_geojson: parcel.polygon_geojson,
      status: parcel.status,
      crop_type: parcel.crop_type,
      household: parcel.household,
    }
  }

  async update(id: string, data: Partial<CreateParcelData>): Promise<ParcelSummary> {
    const updateData: Record<string, unknown> = {}
    if (data.geojson !== undefined) updateData.polygon_geojson = data.geojson
    if (data.area_ha !== undefined) updateData.area_ha = data.area_ha
    if (data.centroid_lat !== undefined) updateData.centroid_lat = data.centroid_lat
    if (data.centroid_lng !== undefined) updateData.centroid_lng = data.centroid_lng
    if (data.current_crop !== undefined) updateData.crop_type = data.current_crop
    if (data.name !== undefined) updateData.parcel_code = data.name

    const parcel = await prisma.parcel.update({
      where: { id },
      data: updateData,
      include: {
        household: {
          select: { id: true, name: true, keycloak_user_id: true },
        },
      },
    })

    return {
      id: parcel.id,
      parcel_code: parcel.parcel_code,
      household_id: parcel.household_id,
      name: parcel.parcel_code,
      area_ha: parcel.area_ha,
      centroid_lat: parcel.centroid_lat,
      centroid_lng: parcel.centroid_lng,
      polygon_geojson: parcel.polygon_geojson,
      status: parcel.status,
      crop_type: parcel.crop_type,
      household: parcel.household,
    }
  }

  async countActiveLotLinks(parcelId: string): Promise<number> {
    return prisma.lotParcel.count({
      where: {
        parcel_id: parcelId,
        lot: { status: { in: ['READY', 'QR_EXPORTED'] as const } },
      },
    })
  }

  async delete(id: string): Promise<void> {
    await prisma.parcel.delete({ where: { id } })
  }

  async approveHarvest(id: string, officerId: string): Promise<ParcelSummary> {
    const parcel = await prisma.parcel.update({
      where: { id },
      data: {
        status: 'HARVEST_APPROVED',
        harvest_approved_by: officerId,
        harvest_approved_at: new Date(),
      },
      include: {
        household: {
          select: { id: true, name: true, keycloak_user_id: true },
        },
      },
    })

    return {
      id: parcel.id,
      parcel_code: parcel.parcel_code,
      household_id: parcel.household_id,
      name: parcel.parcel_code,
      area_ha: parcel.area_ha,
      centroid_lat: parcel.centroid_lat,
      centroid_lng: parcel.centroid_lng,
      polygon_geojson: parcel.polygon_geojson,
      status: parcel.status,
      crop_type: parcel.crop_type,
      household: parcel.household,
    }
  }
}
