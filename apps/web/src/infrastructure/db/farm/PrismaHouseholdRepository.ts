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
      keycloak_user_id: h.keycloak_user_id,
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
      keycloak_user_id: h.keycloak_user_id,
    }
  }

  async findByKeycloakUserId(userId: string): Promise<HouseholdSummary | null> {
    const h = await prisma.household.findFirst({
      where: { keycloak_user_id: userId },
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
      keycloak_user_id: h.keycloak_user_id,
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
      keycloak_user_id: h.keycloak_user_id,
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
      keycloak_user_id: h.keycloak_user_id,
    }
  }
  async isPhoneTaken(phone: string, htxProfileId: string): Promise<boolean> {
    const h = await prisma.household.findUnique({
      where: { phone },
      select: { htx_profile_id: true, keycloak_user_id: true },
    })
    return h != null && (h.htx_profile_id !== htxProfileId || h.keycloak_user_id !== null)
  }

  async findOrphanedByPhone(phone: string, htxProfileId: string): Promise<HouseholdSummary | null> {
    const h = await prisma.household.findFirst({
      where: {
        phone: phone,
        keycloak_user_id: null,
        htx_profile_id: htxProfileId,
      },
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
      keycloak_user_id: h.keycloak_user_id,
    }
  }

  async linkToKeycloak(id: string, keycloakUserId: string): Promise<void> {
    await prisma.household.update({
      where: { id },
      data: { keycloak_user_id: keycloakUserId },
    })
  }

  async unlinkFromKeycloak(keycloakUserId: string): Promise<void> {
    await prisma.household.updateMany({
      where: { keycloak_user_id: keycloakUserId },
      data: { keycloak_user_id: null },
    })
  }
}
