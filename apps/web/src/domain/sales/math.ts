// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/** Whole dong of `netG` grams at `priceVndPerKg`, rounded half up (price × grams / 1000, all in integers). */
export function lineAmount(netG: number, priceVndPerKg: number): bigint {
  return (BigInt(netG) * BigInt(priceVndPerKg) + BigInt(500)) / BigInt(1000)
}

/** The lot weight that can be sold, in whole grams: the first of total, actual and estimated weight that is known. */
export function lotCapacityG(lot: { total_weight_kg: number | null; actual_weight_kg: number | null; estimated_weight_kg: number | null }): number | null {
  const kg = lot.total_weight_kg ?? lot.actual_weight_kg ?? lot.estimated_weight_kg
  return kg === null ? null : Math.round(kg * 1000)
}

/** A kg figure with one decimal as whole grams; it works in tenths so 1.1 is exactly 1100. */
export function kgToG(kg: number): number {
  return Math.round(kg * 10) * 100
}
