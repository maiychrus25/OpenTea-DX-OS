// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { computeTicket } from '@/domain/weighing/ticket-math'

describe('computeTicket', () => {
  it('keeps the whole weight with no deduction', () => {
    expect(computeTicket({ grossKg: 100, deductionPct: 0, priceVndPerKg: 15000 })).toEqual({ netKg: 100, amountVnd: BigInt(1500000) })
  })

  it('takes 5 percent off', () => {
    expect(computeTicket({ grossKg: 100, deductionPct: 5, priceVndPerKg: 15000 })).toEqual({ netKg: 95, amountVnd: BigInt(1425000) })
  })

  it('rounds net kg to one decimal, half up', () => {
    // 12.3 x 0.925 = 11.3775 -> 11.4; 11.4 x 13000 = 148200
    expect(computeTicket({ grossKg: 12.3, deductionPct: 7.5, priceVndPerKg: 13000 })).toEqual({ netKg: 11.4, amountVnd: BigInt(148200) })
    // 0.5 x 0.9 = 0.45 -> 0.5 (exact tie goes up, no float drift)
    expect(computeTicket({ grossKg: 0.5, deductionPct: 10, priceVndPerKg: 10000 }).netKg).toBe(0.5)
  })

  it('rounds the amount to a whole dong, half up', () => {
    // 0.1 kg x 15 dong = 1.5 -> 2
    expect(computeTicket({ grossKg: 0.1, deductionPct: 0, priceVndPerKg: 15 }).amountVnd).toBe(BigInt(2))
  })

  it('accepts the bounds of the deduction', () => {
    expect(computeTicket({ grossKg: 100, deductionPct: 30, priceVndPerKg: 1000 })).toEqual({ netKg: 70, amountVnd: BigInt(70000) })
    expect(computeTicket({ grossKg: 100, deductionPct: 0, priceVndPerKg: 1000 }).netKg).toBe(100)
  })

  it('does not lose a dong on a large ticket', () => {
    expect(computeTicket({ grossKg: 5000, deductionPct: 0, priceVndPerKg: 10000000 }).amountVnd).toBe(BigInt(50000000000))
  })

  it.each([30.1, -0.1, 31, Number.NaN])('rejects a deduction of %s', (deductionPct) => {
    expect(() => computeTicket({ grossKg: 10, deductionPct, priceVndPerKg: 1000 })).toThrow()
  })

  it.each([0, -1, 5000.1, Number.NaN])('rejects a gross weight of %s', (grossKg) => {
    expect(() => computeTicket({ grossKg, deductionPct: 0, priceVndPerKg: 1000 })).toThrow()
  })

  it.each([0, 1.5, 10000001])('rejects a price of %s', (priceVndPerKg) => {
    expect(() => computeTicket({ grossKg: 10, deductionPct: 0, priceVndPerKg })).toThrow()
  })
})
