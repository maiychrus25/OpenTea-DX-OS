// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { advanceAmount, formatVnd, parseQuantity } from '@/lib/ledger/money'

test('an advance amount is quantity × unit price, whole VND, half up', () => {
  expect(advanceAmount(2.5, 12000)).toBe(30000)
  expect(advanceAmount(0.01, 12345)).toBe(123)
  expect(advanceAmount(0.05, 10)).toBe(1)
})

test('a decimal money string is grouped without going through a float', () => {
  expect(formatVnd('1500000')).toBe('1.500.000')
  expect(formatVnd('9007199254740993')).toBe('9.007.199.254.740.993')
  expect(formatVnd('-300000')).toBe('-300.000')
})

test('a quantity must be positive with at most two decimals', () => {
  expect(parseQuantity('2.5')).toBe(2.5)
  expect(parseQuantity('0')).toBeNull()
  expect(parseQuantity('2.555')).toBeNull()
  expect(parseQuantity('')).toBeNull()
})
