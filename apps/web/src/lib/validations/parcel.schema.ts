// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { z } from 'zod'

export const parcelCreateSchema = z.object({
  household_id: z.string().min(1),
  parcel_code: z.string().min(1).max(50),
  name: z.string().max(200).optional(),
  geojson: z.record(z.unknown()), // GeoJSON Polygon
  area_ha: z.number().positive(),
  centroid_lat: z.number().min(-90).max(90),
  centroid_lng: z.number().min(-180).max(180),
  current_crop: z.string().max(100).optional(),
  soil_type: z.string().max(100).optional(),
  irrigation_type: z.string().max(100).optional(),
})

export const parcelUpdateSchema = parcelCreateSchema.partial().omit({ household_id: true, parcel_code: true })

export type ParcelCreateInput = z.infer<typeof parcelCreateSchema>
export type ParcelUpdateInput = z.infer<typeof parcelUpdateSchema>
