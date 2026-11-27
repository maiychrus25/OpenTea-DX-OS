// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

export interface TicketPreview {
  netKg: number
  amountVnd: number
}

/**
 * Mirrors the server formula in domain/weighing/ticket-math.ts so the weighing form shows the saved numbers:
 * net kg = gross × (1 − deduction%), one decimal, half up; amount = net kg × price, whole VND, half up.
 * Kg are kept in tenths and the maths stays in integers, so no float drift at the rounding boundary.
 */
export function computeTicketPreview(grossKg: number, deductionPct: number, priceVndPerKg: number): TicketPreview {
  const gross10 = Math.round(grossKg * 10)
  const deduction10 = Math.round(deductionPct * 10)
  const net10 = Math.floor((gross10 * (1000 - deduction10) + 500) / 1000)
  const amountVnd = Math.floor((net10 * priceVndPerKg + 5) / 10)
  return { netKg: net10 / 10, amountVnd }
}
