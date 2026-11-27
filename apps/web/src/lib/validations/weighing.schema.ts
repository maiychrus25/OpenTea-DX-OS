// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import { isRealDay } from '@/application/agent/campaign/vn-day'

const id = z.string().trim().min(1).max(100)
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isRealDay, 'Ngày không hợp lệ')
const oneDecimal = (value: number) => Math.abs(value * 10 - Math.round(value * 10)) < 1e-6

export const leafGradeCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  sort_order: z.number().int().min(0).max(1000).optional(),
}).strict()

export const leafGradeUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  sort_order: z.number().int().min(0).max(1000).optional(),
  active: z.boolean().optional(),
}).strict().refine((v) => Object.keys(v).length > 0, 'Cần ít nhất một trường để sửa')

export const leafPricesPutSchema = z.object({
  prices: z.array(z.object({ grade_id: id, price_vnd_per_kg: z.number().int().min(1).max(10_000_000) }).strict()).min(1).max(50),
}).strict().refine((v) => new Set(v.prices.map((p) => p.grade_id)).size === v.prices.length, 'Mỗi phẩm cấp chỉ một giá')

// No flag, date or "as of" field exists: an unknown key is a 400, so nothing can reach the withdrawal check sideways.
export const leafTicketCreateSchema = z.object({
  household_id: id,
  parcel_id: id,
  grade_id: id,
  gross_kg: z.number().gt(0).max(5000).refine(oneDecimal, 'Tối đa một chữ số thập phân'),
  deduction_pct: z.number().min(0).max(30).refine(oneDecimal, 'Tối đa một chữ số thập phân'),
  client_id: z.string().uuid().optional(),
}).strict()

export const leafTicketVoidSchema = z.object({ reason: z.string().trim().min(3).max(200) }).strict()

export const leafTicketListQuerySchema = z.object({
  date: day.optional(),
  household_id: id.optional(),
  status: z.enum(['VALID', 'VOIDED']).optional(),
  cursor: id.optional(),
})

const MAX_EXPORT_DAYS = 366
export const leafTicketExportQuerySchema = z.object({ from: day, to: day })
  .refine((v) => v.from <= v.to, 'Ngày bắt đầu phải trước ngày kết thúc')
  .refine((v) => (Date.parse(v.to) - Date.parse(v.from)) / 86_400_000 < MAX_EXPORT_DAYS, 'Khoảng ngày tối đa một năm')

/** `at` only moves the light of the weighing screen; it is not an input of the ticket. */
export const withdrawalStatusQuerySchema = z.object({ at: day.optional() })
