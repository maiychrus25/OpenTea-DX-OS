// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { kgToG, lineAmount, lotCapacityG } from '@/domain/sales/math'

describe('sales maths', () => {
  it('prices a line in whole dong, half up', () => {
    expect(lineAmount(12500, 180000)).toBe(BigInt(2250000))
    expect(lineAmount(333, 1001)).toBe(BigInt(333)) // 333.333
    expect(lineAmount(500, 1001)).toBe(BigInt(501)) // 500.5
    expect(lineAmount(1, 1)).toBe(BigInt(0)) // 0.001
    expect(lineAmount(1000, 10_000_000)).toBe(BigInt(10_000_000))
  })

  it('takes the first known lot weight and rounds it to whole grams', () => {
    expect(lotCapacityG({ total_weight_kg: 12.5, actual_weight_kg: 9, estimated_weight_kg: 8 })).toBe(12500)
    expect(lotCapacityG({ total_weight_kg: null, actual_weight_kg: 9.1, estimated_weight_kg: 8 })).toBe(9100)
    expect(lotCapacityG({ total_weight_kg: null, actual_weight_kg: null, estimated_weight_kg: 0.0005 })).toBe(1)
    expect(lotCapacityG({ total_weight_kg: null, actual_weight_kg: null, estimated_weight_kg: null })).toBeNull()
  })

  it('converts kg with one decimal to grams without float drift', () => {
    expect(kgToG(12.5)).toBe(12500)
    expect(kgToG(0.3)).toBe(300)
    expect(kgToG(1.1)).toBe(1100)
    expect(kgToG(999.9)).toBe(999900)
    expect(kgToG(0)).toBe(0)
  })
})
