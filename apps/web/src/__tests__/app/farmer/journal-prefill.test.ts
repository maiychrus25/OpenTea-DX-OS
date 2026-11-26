/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { journalPrefillFromParams } from '@/app/farmer/journal/_components/journal-prefill'

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

describe('the prefill helper stays callable from the server page', () => {
  const app = join(__dirname, '../../../app/farmer/journal')
  it('lives in a module without a use client directive, and the page imports it from there', () => {
    expect(readFileSync(join(app, '_components/journal-prefill.ts'), 'utf8')).not.toMatch(/^['"]use client['"]/m)
    expect(readFileSync(join(app, 'new/page.tsx'), 'utf8')).toContain("from '../_components/journal-prefill'")
  })
})
