// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { htxProfileUpdateSchema } from '@/lib/validations/htx-profile.schema'

describe('htxProfileUpdateSchema', () => {
  it('accepts valid data', () => {
    const validData = {
      name: 'HTX Tân Cương',
      address: '123 Test St',
      contact_email: 'test@example.com',
      contact_phone: '0901234567',
      crop_types: ['Chè Trung du', 'Chè LDP1'],
      season_label: 'Lứa 1/2026',
    }
    expect(htxProfileUpdateSchema.safeParse(validData).success).toBe(true)
  })

  it('rejects invalid email', () => {
    const invalidData = {
      name: 'HTX',
      address: '123 Test St',
      contact_email: 'not-an-email',
      crop_types: []
    }
    const result = htxProfileUpdateSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
  })

  it('rejects empty name', () => {
    const invalidData = { name: '', address: '123 Test St', crop_types: [] }
    expect(htxProfileUpdateSchema.safeParse(invalidData).success).toBe(false)
  })

  it('rejects empty address', () => {
    const invalidData = { name: 'HTX', address: '', crop_types: [] }
    expect(htxProfileUpdateSchema.safeParse(invalidData).success).toBe(false)
  })

  it('accepts empty email (optional)', () => {
    const validData = {
      name: 'HTX Tân Cương',
      address: '123 Test St',
      contact_email: '', // allowed
      crop_types: []
    }
    expect(htxProfileUpdateSchema.safeParse(validData).success).toBe(true)
  })

  it('defaults crop_types to [] when omitted', () => {
    const validData = { name: 'HTX Tân Cương', address: '123 Test St' }
    const result = htxProfileUpdateSchema.safeParse(validData)
    expect(result.success).toBe(true)
    expect(result.data?.crop_types).toEqual([])
  })
})
