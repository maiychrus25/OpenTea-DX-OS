// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { settleHousehold } from '@/domain/ledger/settlement'

describe('settleHousehold', () => {
  it('pays leaf money minus the advances', () => {
    expect(settleHousehold({ leafVnd: BigInt(1000000), advancesVnd: BigInt(300000), outstandingVnd: BigInt(0) })).toEqual({ payableVnd: BigInt(700000), debtOutVnd: BigInt(0), debtInVnd: BigInt(0) })
  })

  it('never pays a negative amount: the surplus debt stays as debt', () => {
    expect(settleHousehold({ leafVnd: BigInt(200000), advancesVnd: BigInt(500000), outstandingVnd: BigInt(0) })).toEqual({ payableVnd: BigInt(0), debtOutVnd: BigInt(300000), debtInVnd: BigInt(0) })
  })

  it('subtracts the debt of earlier periods', () => {
    expect(settleHousehold({ leafVnd: BigInt(1000000), advancesVnd: BigInt(0), outstandingVnd: -BigInt(300000) })).toEqual({ payableVnd: BigInt(700000), debtOutVnd: BigInt(0), debtInVnd: BigInt(300000) })
  })

  it('keeps the old debt when the period brings nothing', () => {
    expect(settleHousehold({ leafVnd: BigInt(0), advancesVnd: BigInt(0), outstandingVnd: -BigInt(100000) })).toEqual({ payableVnd: BigInt(0), debtOutVnd: BigInt(100000), debtInVnd: BigInt(100000) })
  })

  it('adds a positive outstanding amount (a credit adjustment) to the payable', () => {
    expect(settleHousehold({ leafVnd: BigInt(500000), advancesVnd: BigInt(100000), outstandingVnd: BigInt(50000) })).toEqual({ payableVnd: BigInt(450000), debtOutVnd: BigInt(0), debtInVnd: BigInt(0) })
  })

  it('is exact above the safe integer range', () => {
    const big = BigInt('9007199254740993')
    expect(settleHousehold({ leafVnd: big, advancesVnd: BigInt(1), outstandingVnd: BigInt(0) }).payableVnd).toBe(big - BigInt(1))
  })
})
