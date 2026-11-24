// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { budgetLevel, vnMonth, vnMonthBounds } from '@/domain/agent/budget'

describe('Vietnam calendar month budget rules', () => {
  test('a month starts at midnight in Vietnam, which is 17:00 UTC the day before', () => {
    expect(vnMonth(new Date('2026-10-31T16:59:59.000Z'))).toBe('2026-10')
    expect(vnMonth(new Date('2026-10-31T17:00:00.000Z'))).toBe('2026-11')
  })

  test('month bounds are [start, end) as instants', () => {
    const { start, end } = vnMonthBounds('2026-11')
    expect(start.toISOString()).toBe('2026-10-31T17:00:00.000Z')
    expect(end.toISOString()).toBe('2026-11-30T17:00:00.000Z')
  })

  test('December rolls over to the next year', () => {
    const { end } = vnMonthBounds('2026-12')
    expect(end.toISOString()).toBe('2026-12-31T17:00:00.000Z')
    expect(vnMonth(end)).toBe('2027-01')
  })

  test('no budget, under 80%, from 80% (warn) and from 100% (exhausted)', () => {
    expect(budgetLevel(null, 999)).toBe('none')
    expect(budgetLevel(10, 7.99)).toBe('ok')
    expect(budgetLevel(10, 8)).toBe('warn')
    expect(budgetLevel(10, 9.99)).toBe('warn')
    expect(budgetLevel(10, 10)).toBe('exhausted')
  })
})
