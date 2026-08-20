// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { z } from 'zod'

const journalActivitySchema = z.object({
  activity_type: z.enum(['SOWING', 'FERTILIZING', 'SPRAYING', 'IRRIGATION', 'HARVEST', 'OTHER']),
  product_name: z.string().max(200).optional(),
  dosage: z.string().max(100).optional(),
  withdrawal_days: z.number().int().min(0).optional(),
})

export const journalCreateSchema = z.object({
  parcel_id: z.string().min(1),
  entry_date: z.string().min(1), // ISO date string
  growth_stage: z.string().max(100).optional(),
  observation: z.string().max(2000).optional(),
  activities: z.array(journalActivitySchema).min(1, 'Cần ít nhất 1 hoạt động'),
})

export const journalUpdateSchema = journalCreateSchema.partial()

export const journalBatchApproveSchema = z.object({
  entry_ids: z.array(z.string().min(1)).min(1, 'Cần ít nhất 1 mục'),
})

export type JournalCreateInput = z.infer<typeof journalCreateSchema>
export type JournalUpdateInput = z.infer<typeof journalUpdateSchema>
export type JournalBatchApproveInput = z.infer<typeof journalBatchApproveSchema>
