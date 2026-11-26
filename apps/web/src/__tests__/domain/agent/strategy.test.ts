/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { goalWarnings, previousSeason, quarterRange, sameQuarterLastYear, seasonOfDay, type PlanGoal } from '@/domain/agent/strategy'

const goal = (key: PlanGoal['key'], direction: PlanGoal['direction'], baseline: number, target: number): PlanGoal => ({
  key,
  label_vi: key === 'yield_kg' ? 'Sản lượng' : 'Thửa có bệnh',
  unit_vi: key === 'yield_kg' ? 'kg' : '%',
  baseline,
  target,
  direction,
})

describe('seasons', () => {
  it('names the quarter of a Vietnam day', () => {
    expect(seasonOfDay('2026-11-27')).toBe('2026-Q4')
    expect(seasonOfDay('2026-01-01')).toBe('2026-Q1')
    expect(seasonOfDay('2026-06-30')).toBe('2026-Q2')
  })

  it('walks back one quarter and one year', () => {
    expect(previousSeason('2026-Q1')).toBe('2025-Q4')
    expect(previousSeason('2026-Q3')).toBe('2026-Q2')
    expect(sameQuarterLastYear('2026-Q4')).toBe('2025-Q4')
  })

  it('bounds a quarter at Vietnam midnight, end exclusive', () => {
    const { from, to } = quarterRange('2026-Q4')
    expect(from.toISOString()).toBe('2026-09-30T17:00:00.000Z')
    expect(to.toISOString()).toBe('2026-12-31T17:00:00.000Z')
    expect(quarterRange('2026-Q1').to.toISOString()).toBe('2026-03-31T17:00:00.000Z')
  })
})

describe('goalWarnings', () => {
  it('flags an up goal below last year and a down goal above it', () => {
    const warnings = goalWarnings([goal('yield_kg', 'up', 1000, 900), goal('diseased_parcel_rate', 'down', 10, 12)])
    expect(warnings).toEqual([
      'Mục tiêu Sản lượng thấp hơn cùng kỳ năm trước',
      'Mục tiêu Thửa có bệnh thấp hơn cùng kỳ năm trước',
    ])
  })

  it('does not flag a target equal to or better than last year', () => {
    expect(goalWarnings([goal('yield_kg', 'up', 1000, 1000), goal('diseased_parcel_rate', 'down', 10, 9)])).toEqual([])
  })
})
