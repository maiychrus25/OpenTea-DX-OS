// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { settleHousehold } from '@/domain/ledger/settlement'

describe('settleHousehold', () => {
  it('pays leaf money minus the advances', () => {
    expect(settleHousehold({ leafVnd: 1_000_000n, advancesVnd: 300_000n, outstandingVnd: 0n })).toEqual({ payableVnd: 700_000n, debtOutVnd: 0n, debtInVnd: 0n })
  })

  it('never pays a negative amount: the surplus debt stays as debt', () => {
    expect(settleHousehold({ leafVnd: 200_000n, advancesVnd: 500_000n, outstandingVnd: 0n })).toEqual({ payableVnd: 0n, debtOutVnd: 300_000n, debtInVnd: 0n })
  })

  it('subtracts the debt of earlier periods', () => {
    expect(settleHousehold({ leafVnd: 1_000_000n, advancesVnd: 0n, outstandingVnd: -300_000n })).toEqual({ payableVnd: 700_000n, debtOutVnd: 0n, debtInVnd: 300_000n })
  })

  it('keeps the old debt when the period brings nothing', () => {
    expect(settleHousehold({ leafVnd: 0n, advancesVnd: 0n, outstandingVnd: -100_000n })).toEqual({ payableVnd: 0n, debtOutVnd: 100_000n, debtInVnd: 100_000n })
  })

  it('adds a positive outstanding amount (a credit adjustment) to the payable', () => {
    expect(settleHousehold({ leafVnd: 500_000n, advancesVnd: 100_000n, outstandingVnd: 50_000n })).toEqual({ payableVnd: 450_000n, debtOutVnd: 0n, debtInVnd: 0n })
  })

  it('is exact above the safe integer range', () => {
    const big = 9_007_199_254_740_993n
    expect(settleHousehold({ leafVnd: big, advancesVnd: 1n, outstandingVnd: 0n }).payableVnd).toBe(big - 1n)
  })
})
