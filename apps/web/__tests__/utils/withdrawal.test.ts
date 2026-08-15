// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { isHarvestSafe } from '@/utils/withdrawal'

describe('isHarvestSafe()', () => {
  it('returns true when safe_harvest_date is in the past', () => {
    const pastDate = new Date('2020-01-01')
    expect(isHarvestSafe(pastDate)).toBe(true)
  })

  it('returns false when safe_harvest_date is in the future', () => {
    const futureDate = new Date(Date.now() + 86400000 * 30)
    expect(isHarvestSafe(futureDate)).toBe(false)
  })

  it('returns false when null', () => {
    expect(isHarvestSafe(null)).toBe(false)
  })
})
