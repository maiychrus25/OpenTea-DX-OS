// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { countsTowardWithdrawal } from '@/domain/journal/withdrawal-status'

describe('countsTowardWithdrawal', () => {
  test.each(['DRAFT', 'REJECTED'])('is false for %s', (status) => {
    expect(countsTowardWithdrawal(status)).toBe(false)
  })

  test.each(['PENDING_APPROVAL', 'APPROVED', 'REQUEST_CHANGES'])('is true for %s', (status) => {
    expect(countsTowardWithdrawal(status)).toBe(true)
  })
})
