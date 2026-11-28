// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { maskPhone } from '@/lib/zalo/zalo-types'

describe('maskPhone', () => {
  it('keeps only the last three digits of a full phone', () => {
    expect(maskPhone('0901234567')).toBe('*******567')
  })

  it('leaves an already masked phone as it is', () => {
    expect(maskPhone('***567')).toBe('***567')
  })

  it('leaves text without digits alone', () => {
    expect(maskPhone('abc')).toBe('abc')
  })
})
