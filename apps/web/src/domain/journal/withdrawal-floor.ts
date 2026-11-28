// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/** Floor for a spraying whose product is not in the catalogue ("Thuốc khác"). */
export const CUSTOM_PRODUCT_FLOOR_DAYS = 14

/** null = a product outside the catalogue. */
export type ProductFloor = { productId: string; floorDays: number } | null

export type WithdrawalResolution =
  | { ok: true; days: number }
  | { ok: false; code: 'WITHDRAWAL_BELOW_FLOOR'; floorDays: number }

/** The one rule behind every spraying write: days are never blank and never below the floor. */
export function resolveWithdrawal(input: { floor: ProductFloor; requestedDays: number | null }): WithdrawalResolution {
  const floorDays = input.floor?.floorDays ?? CUSTOM_PRODUCT_FLOOR_DAYS
  if (input.requestedDays === null) return { ok: true, days: floorDays }
  if (input.requestedDays < floorDays) return { ok: false, code: 'WITHDRAWAL_BELOW_FLOOR', floorDays }
  return { ok: true, days: input.requestedDays }
}
