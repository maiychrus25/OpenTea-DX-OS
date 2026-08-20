// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { z } from 'zod'

export const lotCreateSchema = z.object({
  crop: z.string().min(1).max(100),
  harvest_date: z.string().min(1), // ISO date string
  estimated_weight_kg: z.number().positive().optional(),
  parcel_ids: z.array(z.string().min(1)).min(1, 'Cần ít nhất 1 thửa đất'),
  packaging_type: z.string().max(100).optional(),
  destination: z.string().max(200).optional(),
  buyer_name: z.string().max(200).optional(),
})

export type LotCreateInput = z.infer<typeof lotCreateSchema>
