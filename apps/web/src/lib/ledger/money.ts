// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/**
 * A VND amount as the server sends it (a decimal string, BigInt on the server), grouped for Vietnam.
 * The string goes straight into BigInt, so nothing passes through a float.
 */
export function formatVnd(value: string | bigint): string {
  return new Intl.NumberFormat('vi-VN').format(typeof value === 'string' ? BigInt(value) : value)
}

/** Live amount of an advance: quantity (at most two decimals) × unit price, whole VND, half up. */
export function advanceAmount(quantity: number, unitPriceVnd: number): number {
  const quantity100 = Math.round(quantity * 100)
  return Math.floor((quantity100 * unitPriceVnd + 50) / 100)
}

export const QUANTITY_PATTERN = /^\d{1,7}(\.\d{1,2})?$/

/** A typed quantity, or null when it is not a positive number with at most two decimals. */
export function parseQuantity(text: string): number | null {
  const value = Number(text)
  return QUANTITY_PATTERN.test(text) && value > 0 ? value : null
}
