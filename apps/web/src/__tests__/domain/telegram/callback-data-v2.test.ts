// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { signCallbackData, signCallbackDataV2, verifyCallbackData, verifyCallbackDataV2 } from '@/domain/telegram/callback-data'

const KEY = 'callback-key-test'
const TOKEN = 'AbCdEfGh_-1'

describe('callback_data v2 signing', () => {
  test('signs a step token and a choice within 48 bytes and verifies it', () => {
    const data = signCallbackDataV2(KEY, TOKEN, 'o12')
    expect(Buffer.byteLength(data)).toBeLessThanOrEqual(48)
    expect(data).toMatch(/^v2\|AbCdEfGh_-1\|o12\|[A-Za-z0-9_-]{16}$/)
    expect(verifyCallbackDataV2(KEY, data)).toEqual({ c: TOKEN, s: 'o12' })
  })

  test('the longest step name with a full token still fits in 48 bytes', () => {
    const data = signCallbackDataV2(KEY, TOKEN, 'a.very_long-nam1')
    expect(Buffer.byteLength(data)).toBe(48)
    expect(verifyCallbackDataV2(KEY, data)).toEqual({ c: TOKEN, s: 'a.very_long-nam1' })
  })

  test('the menu uses the fixed token menu', () => {
    const data = signCallbackDataV2(KEY, 'menu', 'today')
    expect(data).toMatch(/^v2\|menu\|today\|/)
    expect(verifyCallbackDataV2(KEY, data)).toEqual({ c: 'menu', s: 'today' })
  })

  test('a changed token, step or signature returns null, and so does another key', () => {
    const data = signCallbackDataV2(KEY, TOKEN, 'ok')
    const [v, c, s, sig] = data.split('|')
    expect(verifyCallbackDataV2('other-key', data)).toBeNull()
    expect(verifyCallbackDataV2(KEY, `${v}|zzzzzzzzzzz|${s}|${sig}`)).toBeNull()
    expect(verifyCallbackDataV2(KEY, `${v}|${c}|final|${sig}`)).toBeNull()
    expect(verifyCallbackDataV2(KEY, `${v}|${c}|${s}|${sig.replace(/^./, sig[0] === 'A' ? 'B' : 'A')}`)).toBeNull()
    expect(verifyCallbackDataV2(KEY, '')).toBeNull()
  })

  test('v1 data is not accepted as v2, and v2 data is not accepted as v1', () => {
    const v1 = signCallbackData(KEY, '0f8fad5b-d9cb-469f-a165-8c2b2a5b6c7d', 'a')
    const v2 = signCallbackDataV2(KEY, TOKEN, 'ok')
    expect(verifyCallbackDataV2(KEY, v1)).toBeNull()
    expect(verifyCallbackData(KEY, v2)).toBeNull()
  })

  test('a step outside the pattern throws when signing, and so does a malformed token', () => {
    expect(() => signCallbackDataV2(KEY, TOKEN, 'has space')).toThrow()
    expect(() => signCallbackDataV2(KEY, TOKEN, 'x'.repeat(17))).toThrow()
    expect(() => signCallbackDataV2(KEY, 'short', 'ok')).toThrow()
  })
})
