// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/** The `source` that workflows/vietnam_market_sync.json writes for every price it simulates. */
export const SIMULATED_MARKET_SOURCE = 'Mô phỏng (Toàn quốc)'

export const SIMULATED_PRICE_LABEL = 'giá mô phỏng'

export function isSimulatedPrice(source: string): boolean {
  return source === SIMULATED_MARKET_SOURCE
}
