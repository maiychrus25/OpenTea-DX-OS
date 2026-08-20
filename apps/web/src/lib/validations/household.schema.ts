// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { z } from 'zod'

export const householdCreateSchema = z.object({
  household_code: z.string().min(1, 'Mã nông hộ không được trống').max(50),
  owner_name: z.string().min(1, 'Tên chủ hộ không được trống').max(200),
  phone: z.string().min(1, 'Số điện thoại không được trống').max(20),
  address: z.string().max(500).optional(),
})

export type HouseholdCreateInput = z.infer<typeof householdCreateSchema>
export const householdUpdateSchema = householdCreateSchema.partial()
export type HouseholdUpdateInput = z.infer<typeof householdUpdateSchema>
