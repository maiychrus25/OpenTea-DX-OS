// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ValidationError } from '@/domain/errors'

export const MAX_GROSS_KG = 5000
export const MAX_DEDUCTION_PCT = 30
export const MAX_PRICE_VND_PER_KG = 10_000_000

/**
 * Net weight and amount of a fresh-leaf ticket. Works in whole tenths so no float rounding can move a dong:
 * net kg = gross x (1 - deduction/100) to one decimal, half up; amount = net kg x price to a whole dong, half up.
 */
export function computeTicket(input: { grossKg: number; deductionPct: number; priceVndPerKg: number }): { netKg: number; amountVnd: bigint } {
  const { grossKg, deductionPct, priceVndPerKg } = input
  if (!Number.isFinite(grossKg) || grossKg <= 0 || grossKg > MAX_GROSS_KG) throw new ValidationError('Số kg cân phải trong khoảng 0,1 đến 5000.')
  if (!Number.isFinite(deductionPct) || deductionPct < 0 || deductionPct > MAX_DEDUCTION_PCT) throw new ValidationError('Phần trăm trừ phải từ 0 đến 30.')
  if (!Number.isInteger(priceVndPerKg) || priceVndPerKg < 1 || priceVndPerKg > MAX_PRICE_VND_PER_KG) throw new ValidationError('Giá phải là số nguyên đồng từ 1 đến 10.000.000.')

  const grossTenths = BigInt(Math.round(grossKg * 10))
  const deductionTenthsPct = BigInt(Math.round(deductionPct * 10))
  const netTenths = (grossTenths * (BigInt(1000) - deductionTenthsPct) + BigInt(500)) / BigInt(1000)
  const amountVnd = (netTenths * BigInt(priceVndPerKg) + BigInt(5)) / BigInt(10)
  return { netKg: Number(netTenths) / 10, amountVnd }
}
