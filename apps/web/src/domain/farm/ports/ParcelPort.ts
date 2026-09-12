// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

export interface ParcelSummary {
  id: string
  parcel_code: string
  household_id: string
  name: string | null
  area_ha: number
  centroid_lat: number | null
  centroid_lng: number | null
  polygon_geojson: unknown | null
  status: string
  crop_type: string
  household?: { id: string; name: string; keycloak_user_id: string | null } | null
  season?: string | null
  sowed_at?: string | null
  harvested_at?: string | null
}

export interface CreateParcelData {
  household_id: string
  parcel_code: string
  name?: string
  geojson: unknown
  area_ha: number
  centroid_lat: number
  centroid_lng: number
  current_crop?: string
  soil_type?: string
  irrigation_type?: string
}

export interface ParcelFilters {
  household_id?: string
  status?: string
}

export interface ParcelPort {
  findById(id: string): Promise<ParcelSummary | null>
  findAll(filters: ParcelFilters): Promise<ParcelSummary[]>
  create(data: CreateParcelData): Promise<ParcelSummary>
  update(id: string, data: Partial<CreateParcelData>): Promise<ParcelSummary>
  delete(id: string): Promise<void>
  approveHarvest(id: string, officerId: string): Promise<ParcelSummary>
}
