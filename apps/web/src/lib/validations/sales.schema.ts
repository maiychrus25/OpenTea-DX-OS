// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import { isRealDay } from '@/application/agent/campaign/vn-day'

const id = z.string().trim().min(1).max(100)
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isRealDay, 'Ngày không hợp lệ')
const oneDecimal = (value: number) => Math.abs(value * 10 - Math.round(value * 10)) < 1e-6
const text = (max: number) => z.string().trim().min(1).max(max)

export const wholesaleOrderSchema = z.object({
  partner_id: id,
  ordered_on: day.optional(),
  due_on: day.optional(),
  note: text(500).optional(),
  lines: z.array(z.object({
    lot_id: id,
    kg: z.number().gt(0).max(1_000_000).refine(oneDecimal, 'Tối đa một chữ số thập phân'),
    price_vnd_per_kg: z.number().int().min(1).max(10_000_000),
  }).strict()).min(1).max(50),
}).strict()
  .refine((v) => !v.ordered_on || !v.due_on || v.due_on >= v.ordered_on, 'Hạn thanh toán không được trước ngày đặt')

export const salesDueSchema = z.object({ due_on: day }).strict()

export const salesPaymentSchema = z.object({
  // Money travels as a decimal string (the order screen sends one); a plain integer is accepted too.
  amount_vnd: z.union([z.string().regex(/^[1-9]\d{0,12}$/), z.number().int().min(1).max(1_000_000_000_000)]),
  paid_on: day.optional(),
  method: z.enum(['TRANSFER', 'CASH']),
  ref: text(100).optional(),
}).strict()

export const salesCancelSchema = z.object({ reason: z.string().trim().min(3).max(200) }).strict()

export const salesListQuerySchema = z.object({
  kind: z.enum(['WHOLESALE', 'RETAIL']).optional(),
  status: z.enum(['CONFIRMED', 'CANCELLED']).optional(),
  overdue: z.literal('1').optional(),
  partner_id: id.optional(),
  cursor: id.optional(),
})

const money = z.union([z.number().int().min(0).max(1_000_000_000_000), z.string().regex(/^\d{1,13}$/)]).transform((v) => BigInt(v))

export const retailOrderSchema = z.object({
  external_ref: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  ordered_on: day.optional(),
  customer_name: text(100).optional(),
  lines: z.array(z.object({
    lot_id: id,
    pack_count: z.number().int().min(1).max(999),
    pack_net_g: z.number().int().min(1).max(100_000),
    amount_vnd: money,
  }).strict()).min(1).max(50),
}).strict()

export const retailCancelSchema = z.object({ reason: z.string().trim().min(3).max(200).optional() }).strict()

export type WholesaleOrderInput = z.infer<typeof wholesaleOrderSchema>
export type RetailOrderInput = z.infer<typeof retailOrderSchema>
