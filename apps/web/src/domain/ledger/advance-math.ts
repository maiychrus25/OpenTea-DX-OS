// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/** Quantity has at most two decimals; the amount is exact integer VND, rounded half up. No float ever touches money. */
export function advanceAmount(quantity: number, unitPriceVnd: number): bigint {
  const hundredths = BigInt(Math.round(quantity * 100))
  return (hundredths * BigInt(unitPriceVnd) + BigInt(50)) / BigInt(100)
}
