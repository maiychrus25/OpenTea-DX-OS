// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/** One decimal kg typed by the user, as whole grams (×1000); null when it is not a positive kg with one decimal. */
export function kgTextToG(text: string): number | null {
  if (!/^\d{1,6}(\.\d)?$/.test(text.trim())) return null
  const tenths = Math.round(Number(text.trim()) * 10)
  return tenths > 0 ? tenths * 100 : null
}

/** Grams to kg text with one decimal: 12500 → "12,5 kg". */
export const gramsText = (g: number) => `${(g / 1000).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`

/**
 * Line amount in whole dong, half up: grams × price per kg / 1000, in BigInt (mirrors domain/sales/math.ts lineAmount).
 * 12500 g × 180000 → "2250000".
 */
export function lineAmountText(netG: number, pricePerKg: number): string {
  const numerator = BigInt(netG) * BigInt(pricePerKg) + BigInt(500)
  return (numerator / BigInt(1000)).toString()
}

/** Sum of decimal money strings, exact. */
export function sumVnd(values: string[]): string {
  return values.reduce((sum, v) => sum + BigInt(v), BigInt(0)).toString()
}

/** Whole VND price typed by the user, 1 to 10,000,000; null otherwise. */
export function parsePrice(text: string): number | null {
  if (!/^\d{1,8}$/.test(text.trim())) return null
  const value = Number(text.trim())
  return value >= 1 && value <= 10_000_000 ? value : null
}
