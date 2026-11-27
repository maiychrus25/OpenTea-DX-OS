// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { CUSTOM_PRODUCT_FLOOR_DAYS, resolveWithdrawal } from '@/domain/journal/withdrawal-floor'

const catalogue = (floorDays: number) => ({ productId: 'p1', floorDays })

describe('resolveWithdrawal', () => {
  it('rejects days below the product floor', () => {
    expect(resolveWithdrawal({ floor: catalogue(14), requestedDays: 7 })).toEqual({
      ok: false,
      code: 'WITHDRAWAL_BELOW_FLOOR',
      floorDays: 14,
    })
  })

  it('rejects zero days', () => {
    expect(resolveWithdrawal({ floor: catalogue(7), requestedDays: 0 })).toMatchObject({ ok: false, floorDays: 7 })
  })

  it('fills the floor when no days are given', () => {
    expect(resolveWithdrawal({ floor: catalogue(14), requestedDays: null })).toEqual({ ok: true, days: 14 })
  })

  it('keeps days at or above the floor', () => {
    expect(resolveWithdrawal({ floor: catalogue(14), requestedDays: 14 })).toEqual({ ok: true, days: 14 })
    expect(resolveWithdrawal({ floor: catalogue(14), requestedDays: 21 })).toEqual({ ok: true, days: 21 })
  })

  it('uses 14 days for a product outside the catalogue', () => {
    expect(CUSTOM_PRODUCT_FLOOR_DAYS).toBe(14)
    expect(resolveWithdrawal({ floor: null, requestedDays: null })).toEqual({ ok: true, days: 14 })
    expect(resolveWithdrawal({ floor: null, requestedDays: 10 })).toMatchObject({ ok: false, floorDays: 14 })
  })

  it('follows an HTX label that is lower than the default', () => {
    expect(resolveWithdrawal({ floor: catalogue(5), requestedDays: null })).toEqual({ ok: true, days: 5 })
    expect(resolveWithdrawal({ floor: catalogue(5), requestedDays: 5 })).toEqual({ ok: true, days: 5 })
  })
})
