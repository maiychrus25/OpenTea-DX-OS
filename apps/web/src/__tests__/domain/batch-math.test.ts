// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { batchCode, batchTotals } from '@/domain/processing/batch-math'

const TICKETS = ['95.0', '95.0', '237.5']

describe('batchTotals', () => {
  it('sums in tenths and gives the ratio', () => {
    expect(batchTotals(TICKETS, ['95.0'])).toEqual({ freshKg: 427.5, dryKg: 95, ratio: 4.5, outOfBand: false })
  })

  it.each([
    ['85.6', 4.99, false],
    ['85.5', 5.0, false],
    ['85.4', 5.01, true],
    ['95.1', 4.5, false],
    ['95.3', 4.49, true],
  ])('dry %s kg gives ratio %s (out of band: %s)', (dry, ratio, out) => {
    expect(batchTotals(TICKETS, [dry])).toMatchObject({ ratio, outOfBand: out })
  })

  it('adds several outputs', () => {
    expect(batchTotals(TICKETS, ['50.0', '45.0'])).toMatchObject({ dryKg: 95, ratio: 4.5 })
  })

  it('has no ratio and is not flagged without dry tea', () => {
    expect(batchTotals(TICKETS, [])).toEqual({ freshKg: 427.5, dryKg: 0, ratio: null, outOfBand: false })
  })
})

describe('batchCode', () => {
  it('pads to two digits and widens at 100', () => {
    expect(batchCode('TC', '2026-11-28', 1)).toBe('TC-MS-20261128-01')
    expect(batchCode('TC', '2026-11-28', 99)).toBe('TC-MS-20261128-99')
    expect(batchCode('TC', '2026-11-28', 100)).toBe('TC-MS-20261128-100')
  })
})
