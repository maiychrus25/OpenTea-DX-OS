// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { prisma } from '@/infrastructure/db/prisma.client'
import { HouseholdPort, HouseholdSummary, CreateHouseholdData, UpdateHouseholdData } from '@/domain/farm/ports/HouseholdPort'

export class PrismaHouseholdRepository implements HouseholdPort {
  async findAll(htxProfileId: string): Promise<HouseholdSummary[]> {
    const households = await prisma.household.findMany({
      where: { htx_profile_id: htxProfileId },
      include: {
        parcels: { select: { area_ha: true } },
      },
      orderBy: { created_at: 'desc' },
    })

    return households.map(h => ({
      id: h.id,
      household_code: h.phone, // phone used as unique identifier in current schema
      name: h.name,
      phone: h.phone,
      address: h.address,
      parcel_count: h.parcels.length,
      total_area_ha: h.parcels.reduce((sum, p) => sum + p.area_ha, 0),
    }))
  }

  async findById(id: string): Promise<HouseholdSummary | null> {
    const h = await prisma.household.findUnique({
      where: { id },
      include: {
        parcels: { select: { area_ha: true } },
      },
    })
    if (!h) return null

    return {
      id: h.id,
      household_code: h.phone,
      name: h.name,
      phone: h.phone,
      address: h.address,
      parcel_count: h.parcels.length,
      total_area_ha: h.parcels.reduce((sum, p) => sum + p.area_ha, 0),
    }
  }

  async create(data: CreateHouseholdData): Promise<HouseholdSummary> {
    const h = await prisma.household.create({
      data: {
        name: data.owner_name,
        phone: data.phone,
        address: data.address ?? null,
        htx_profile_id: data.htx_profile_id,
      },
      include: {
        parcels: { select: { area_ha: true } },
      },
    })

    return {
      id: h.id,
      household_code: h.phone,
      name: h.name,
      phone: h.phone,
      address: h.address,
      parcel_count: h.parcels.length,
      total_area_ha: 0,
    }
  }
  async update(id: string, data: UpdateHouseholdData): Promise<HouseholdSummary> {
    const h = await prisma.household.update({
      where: { id },
      data: {
        name: data.owner_name,
        phone: data.phone,
        address: data.address,
      },
      include: {
        parcels: { select: { area_ha: true } },
      },
    })

    return {
      id: h.id,
      household_code: h.phone,
      name: h.name,
      phone: h.phone,
      address: h.address,
      parcel_count: h.parcels.length,
      total_area_ha: h.parcels.reduce((sum, p) => sum + p.area_ha, 0),
    }
  }
}
