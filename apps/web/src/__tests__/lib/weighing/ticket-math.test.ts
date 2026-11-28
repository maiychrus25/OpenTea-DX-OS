// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { computeTicketPreview } from '@/lib/weighing/ticket-math'

test('no deduction keeps the gross weight and multiplies by the price', () => {
  expect(computeTicketPreview(100, 0, 15000)).toEqual({ netKg: 100, amountVnd: 1500000 })
})

test('a 5% deduction takes 5 kg off 100 kg', () => {
  expect(computeTicketPreview(100, 5, 15000)).toEqual({ netKg: 95, amountVnd: 1425000 })
})

test('net kg rounds half up to one decimal, and the amount follows the rounded kg', () => {
  // 12.3 × 92.5% = 11.3775, which is 11.4 kg; 11.4 × 13000 = 148200.
  expect(computeTicketPreview(12.3, 7.5, 13000)).toEqual({ netKg: 11.4, amountVnd: 148200 })
})

test('a deduction at the upper bound of 30% still rounds correctly', () => {
  expect(computeTicketPreview(10, 30, 13001)).toEqual({ netKg: 7, amountVnd: 91007 })
})

test('an exact half kilogram rounds up and the amount rounds half up in whole VND', () => {
  expect(computeTicketPreview(10, 5, 13001)).toEqual({ netKg: 9.5, amountVnd: 123510 })
  expect(computeTicketPreview(0.5, 50, 13000)).toEqual({ netKg: 0.3, amountVnd: 3900 })
})
