// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

export interface HouseholdSummary {
  id: string
  household_code: string
  name: string
  phone: string
  address: string | null
  parcel_count: number
  total_area_ha: number
  keycloak_user_id?: string | null
}

export interface CreateHouseholdData {
  household_code: string
  owner_name: string
  phone: string
  address?: string
  htx_profile_id: string
}

export interface UpdateHouseholdData {
  owner_name?: string
  phone?: string
  address?: string
}

export interface HouseholdPort {
  findAll(htxProfileId: string): Promise<HouseholdSummary[]>
  findById(id: string): Promise<HouseholdSummary | null>
  findByKeycloakUserId(userId: string): Promise<HouseholdSummary | null>
  findOrphanedByPhone(phone: string): Promise<HouseholdSummary | null>
  create(data: CreateHouseholdData): Promise<HouseholdSummary>
  update(id: string, data: UpdateHouseholdData): Promise<HouseholdSummary>
  linkToKeycloak(id: string, keycloakUserId: string): Promise<void>
  unlinkFromKeycloak(keycloakUserId: string): Promise<void>
}
