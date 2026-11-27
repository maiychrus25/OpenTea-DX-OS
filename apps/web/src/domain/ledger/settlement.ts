// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

export interface SettleInput {
  /** Leaf money of the period. */
  leafVnd: bigint
  /** Input advances of the period. */
  advancesVnd: bigint
  /** Ledger balance before closing minus the unpaid payables of older lines; negative is a debt of the household. */
  outstandingVnd: bigint
}

export interface SettleResult {
  payableVnd: bigint
  /** Debt that stays after this period; it is already in the ledger balance. */
  debtOutVnd: bigint
  /** Debt brought in from earlier periods; shown on the slip only. */
  debtInVnd: bigint
}

/** Spec §7.2: net = leaf − advances + outstanding; the payable is never negative. */
export function settleHousehold({ leafVnd, advancesVnd, outstandingVnd }: SettleInput): SettleResult {
  const net = leafVnd - advancesVnd + outstandingVnd
  return {
    payableVnd: net > BigInt(0) ? net : BigInt(0),
    debtOutVnd: net < BigInt(0) ? -net : BigInt(0),
    debtInVnd: outstandingVnd < BigInt(0) ? -outstandingVnd : BigInt(0),
  }
}
