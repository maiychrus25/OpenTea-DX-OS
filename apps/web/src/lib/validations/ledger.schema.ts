// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import { isRealDay } from '@/application/agent/campaign/vn-day'

const id = z.string().trim().min(1).max(100)
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isRealDay, 'Ngày không hợp lệ')
const twoDecimals = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6

const itemFields = {
  name: z.string().trim().min(1).max(80),
  unit: z.string().trim().min(1).max(20),
  unit_price_vnd: z.number().int().min(0).max(100_000_000),
  kind: z.enum(['FERTILIZER', 'PESTICIDE', 'OTHER']),
  pesticide_product_id: id.nullable().optional(),
}

export const inputItemCreateSchema = z.object(itemFields).strict()

export const inputItemUpdateSchema = z.object({ ...itemFields, active: z.boolean() }).partial().strict()
  .refine((v) => Object.keys(v).length > 0, 'Cần ít nhất một trường để sửa')

export const advanceCreateSchema = z.object({
  household_id: id,
  item_id: id,
  quantity: z.number().gt(0).max(100_000).refine(twoDecimals, 'Tối đa hai chữ số thập phân'),
  advanced_on: day.optional(),
  client_id: z.string().uuid().optional(),
}).strict()

export const advanceVoidSchema = z.object({ reason: z.string().trim().min(3).max(200) }).strict()

export const advanceListQuerySchema = z.object({
  household_id: id.optional(),
  from: day.optional(),
  to: day.optional(),
  status: z.enum(['VALID', 'VOIDED']).optional(),
  cursor: id.optional(),
})

export const householdBankSchema = z.object({
  bank_bin: z.string().regex(/^\d{6}$/),
  bank_account: z.string().regex(/^\d{6,19}$/),
  bank_account_name: z.string().trim().min(1).max(60),
}).strict()

export const settlementCreateSchema = z.object({ date_from: day, date_to: day }).strict()
  .refine((v) => v.date_from <= v.date_to, 'Ngày bắt đầu phải trước ngày kết thúc')

export const settlementCloseSchema = z.object({
  expected_household_count: z.number().int().min(0).max(100_000),
  expected_payable_total_vnd: z.string().regex(/^(0|[1-9]\d{0,17})$/),
}).strict()

export const payoutSchema = z.object({ method: z.enum(['TRANSFER', 'CASH']), ref: z.string().trim().max(60).optional() }).strict()

export const adjustmentSchema = z.object({
  household_id: id,
  amount_vnd: z.string().regex(/^-?[1-9]\d{0,14}$/, 'Số tiền phải là số nguyên khác 0'),
  reason: z.string().trim().min(5).max(200),
}).strict()
