/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { journalPrefillFromParams } from '@/app/farmer/journal/_components/FarmerJournalForm'

describe('journalPrefillFromParams (Sửa button)', () => {
  it('reads the card values', () => {
    expect(journalPrefillFromParams({ parcel: 'p1', activity: 'SPRAYING', product: 'Abc', dosage: '20 ml', withdrawal: '7' })).toEqual({
      parcelId: 'p1', activityType: 'SPRAYING', productName: 'Abc', dosage: '20 ml', withdrawalDays: 7,
    })
  })
  it('drops invalid values', () => {
    expect(journalPrefillFromParams({ activity: 'NOPE', withdrawal: '999', product: ['a', 'b'] })).toEqual({
      parcelId: undefined, activityType: undefined, productName: undefined, dosage: undefined, withdrawalDays: undefined,
    })
    expect(journalPrefillFromParams({ withdrawal: 'abc' }).withdrawalDays).toBeUndefined()
  })
})
