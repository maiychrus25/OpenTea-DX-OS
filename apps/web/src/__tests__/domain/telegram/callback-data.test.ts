// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { signCallbackData, verifyCallbackData } from '@/domain/telegram/callback-data'

const KEY = 'callback-key-test'
const ID = '0f8fad5b-d9cb-469f-a165-8c2b2a5b6c7d'

describe('callback_data signing', () => {
  test('round-trips a proposal id and op within 64 bytes', () => {
    const data = signCallbackData(KEY, ID, 'a')
    expect(Buffer.byteLength(data)).toBeLessThan(64)
    expect(data).toMatch(/^v1\|[A-Za-z0-9_-]{22}\|a\|[A-Za-z0-9_-]{16}$/)
    expect(verifyCallbackData(KEY, data)).toEqual({ proposalId: ID, op: 'a' })
    expect(verifyCallbackData(KEY, signCallbackData(KEY, ID, 'r'))).toEqual({ proposalId: ID, op: 'r' })
  })

  test('refuses a different key, an altered op, an altered id and malformed text', () => {
    const data = signCallbackData(KEY, ID, 'a')
    const [v, id, , sig] = data.split('|')
    expect(verifyCallbackData('other-key', data)).toBeNull()
    expect(verifyCallbackData(KEY, `${v}|${id}|r|${sig}`)).toBeNull()
    const otherId = signCallbackData(KEY, '11111111-2222-4333-8444-555555555555', 'a').split('|')[1]
    expect(verifyCallbackData(KEY, `${v}|${otherId}|a|${sig}`)).toBeNull()
    expect(verifyCallbackData(KEY, 'v2|x|a|y')).toBeNull()
    expect(verifyCallbackData(KEY, '')).toBeNull()
  })
})
