// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import { isRealDay } from '@/application/agent/campaign/vn-day'
import { DRY_TEA_GRADES } from '@/domain/processing/grades'

const id = z.string().trim().min(1).max(100)
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isRealDay, 'Ngày không hợp lệ')
const oneDecimal = (value: number) => Math.abs(value * 10 - Math.round(value * 10)) < 1e-6
const optionalText = (max: number) => z.string().trim().max(max).optional()

export const batchCreateSchema = z.object({
  processed_on: day,
  master_name: optionalText(80),
  shift: optionalText(40),
  notes: optionalText(500),
}).strict()

export const batchListQuerySchema = z.object({
  status: z.enum(['OPEN', 'FINISHED', 'CANCELLED']).optional(),
  from: day.optional(),
  to: day.optional(),
})

export const availableTicketsQuerySchema = z.object({ from: day.optional(), to: day.optional() })
  .refine((v) => !v.from || !v.to || v.from <= v.to, 'Ngày bắt đầu phải trước ngày kết thúc')

export const batchTicketsSchema = z.object({
  ticket_ids: z.array(id).min(1).max(200),
}).strict().refine((v) => new Set(v.ticket_ids).size === v.ticket_ids.length, 'Mỗi phiếu chỉ chọn một lần')

export const batchOutputsSchema = z.object({
  outputs: z.array(z.object({
    grade: z.enum(DRY_TEA_GRADES),
    kg: z.number().gt(0).max(100_000).refine(oneDecimal, 'Tối đa một chữ số thập phân'),
  }).strict()).max(DRY_TEA_GRADES.length),
}).strict().refine((v) => new Set(v.outputs.map((o) => o.grade)).size === v.outputs.length, 'Mỗi hạng chỉ một dòng')

export const batchFinishSchema = z.object({ deviation_note: z.string().trim().min(10).max(500).optional() }).strict()

export const batchCancelSchema = z.object({ reason: z.string().trim().min(3).max(200) }).strict()
