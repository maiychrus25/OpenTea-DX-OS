// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { ParcelPort, ParcelSummary, CreateParcelData, ParcelFilters } from '@/domain/farm/ports/ParcelPort'
import { prisma } from '@/infrastructure/db/prisma.client'

export class PrismaParcelRepository implements ParcelPort {
  async findById(id: string): Promise<ParcelSummary | null> {
    const parcel = await prisma.parcel.findUnique({
      where: { id },
      include: {
        household: {
          select: { id: true, name: true, keycloak_user_id: true },
        },
      },
    })
    if (!parcel) return null

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
      },
      orderBy: { created_at: 'desc' },
    })

    return parcels.map(p => ({
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
    }))
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

  async delete(id: string): Promise<void> {
    await prisma.parcel.delete({ where: { id } })
  }
}
