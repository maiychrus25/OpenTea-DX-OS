// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { createUserLimiter } from '@/infrastructure/tts/tts-limit'

describe('createUserLimiter', () => {
  it('lets 20 requests through in a minute and blocks the 21st', () => {
    const limited = createUserLimiter({ max: 20, windowMs: 60_000 })
    for (let i = 0; i < 20; i++) expect(limited('u1', 1000 + i)).toBe(false)
    expect(limited('u1', 1100)).toBe(true)
    expect(limited('u1', 1200)).toBe(true)
  })

  it('counts each person apart', () => {
    const limited = createUserLimiter({ max: 1, windowMs: 60_000 })
    expect(limited('u1', 0)).toBe(false)
    expect(limited('u1', 1)).toBe(true)
    expect(limited('u2', 2)).toBe(false)
  })

  it('slides: a request frees up exactly one minute after it was made, and blocked ones do not extend the block', () => {
    const limited = createUserLimiter({ max: 2, windowMs: 60_000 })
    expect(limited('u1', 0)).toBe(false)
    expect(limited('u1', 30_000)).toBe(false)
    expect(limited('u1', 59_999)).toBe(true)
    expect(limited('u1', 60_001)).toBe(false) // the request at 0 left the window
    expect(limited('u1', 60_002)).toBe(true) // 30_000 and 60_001 are in it
    expect(limited('u1', 90_001)).toBe(false) // 30_000 left
  })
})
