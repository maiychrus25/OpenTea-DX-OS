/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { createHmac } from 'node:crypto'
import {
  signWebAppCookie,
  validateInitData,
  verifyWebAppCookie,
  webAppKeyFromBotToken,
} from '@/domain/telegram/webapp-init-data'

const FAKE_TOKEN = '123456:FAKE-token-for-tests'
const KEY = webAppKeyFromBotToken(FAKE_TOKEN)
const NOW = new Date('2026-11-27T10:00:00Z')
const AUTH_DATE = String(Math.floor(NOW.getTime() / 1000) - 60)

/** Telegram's published algorithm, written out again here so the test does not trust the code under test. */
function buildInitData(fields: Record<string, string>, token = FAKE_TOKEN): string {
  const secret = createHmac('sha256', 'WebAppData').update(token).digest()
  const check = Object.entries(fields)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  const hash = createHmac('sha256', secret).update(check).digest('hex')
  return new URLSearchParams({ ...fields, hash }).toString()
}

const BASE = { auth_date: AUTH_DATE, query_id: 'AAH-test', user: JSON.stringify({ id: 4242, first_name: 'An' }) }

describe('webAppKeyFromBotToken', () => {
  it('is the hex of HMAC_SHA256(key="WebAppData", msg=token)', () => {
    expect(KEY).toBe(createHmac('sha256', 'WebAppData').update(FAKE_TOKEN).digest('hex'))
  })
})

describe('validateInitData (W-1)', () => {
  it('accepts a valid fixture and returns the Telegram user id', () => {
    expect(validateInitData(buildInitData(BASE), KEY, NOW)).toEqual({ ok: true, telegramUserId: '4242' })
  })

  it.each(['auth_date', 'query_id', 'user'])('rejects the data when %s is changed after signing', (field) => {
    const params = new URLSearchParams(buildInitData(BASE))
    params.set(field, field === 'user' ? JSON.stringify({ id: 1 }) : field === 'auth_date' ? String(Number(AUTH_DATE) + 1) : 'other')
    expect(validateInitData(params.toString(), KEY, NOW)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('rejects a wrong hash, a missing hash and data signed with another token', () => {
    const params = new URLSearchParams(buildInitData(BASE))
    params.set('hash', 'a'.repeat(64))
    expect(validateInitData(params.toString(), KEY, NOW).ok).toBe(false)
    params.delete('hash')
    expect(validateInitData(params.toString(), KEY, NOW).ok).toBe(false)
    expect(validateInitData(buildInitData(BASE, '999:other'), KEY, NOW).ok).toBe(false)
  })

  it('rejects an auth_date older than 24 hours and accepts one just inside', () => {
    const at = (ageSeconds: number) =>
      buildInitData({ ...BASE, auth_date: String(Math.floor(NOW.getTime() / 1000) - ageSeconds) })
    expect(validateInitData(at(24 * 3600 + 1), KEY, NOW)).toEqual({ ok: false, reason: 'invalid' })
    expect(validateInitData(at(24 * 3600 - 1), KEY, NOW).ok).toBe(true)
  })

  it('rejects data with no user, a user without a numeric id, or no auth_date', () => {
    const { user: _user, ...noUser } = BASE
    expect(validateInitData(buildInitData(noUser), KEY, NOW).ok).toBe(false)
    expect(validateInitData(buildInitData({ ...BASE, user: '{"first_name":"An"}' }), KEY, NOW).ok).toBe(false)
    expect(validateInitData(buildInitData({ ...BASE, user: 'not json' }), KEY, NOW).ok).toBe(false)
    const { auth_date: _date, ...noDate } = BASE
    expect(validateInitData(buildInitData(noDate), KEY, NOW).ok).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(validateInitData('', KEY, NOW).ok).toBe(false)
  })
})

describe('web app cookie', () => {
  const secret = 'test-auth-secret'

  it('round-trips and carries the Telegram user and the user id', () => {
    const value = signWebAppCookie({ telegramUserId: '4242', userId: 'user-1' }, secret, NOW)
    expect(verifyWebAppCookie(value, secret, NOW)).toEqual({ telegramUserId: '4242', userId: 'user-1' })
  })

  it('refuses a tampered, expired or differently signed cookie', () => {
    const value = signWebAppCookie({ telegramUserId: '4242', userId: 'user-1' }, secret, NOW)
    expect(verifyWebAppCookie(value.replace('4242', '4243'), secret, NOW)).toBeNull()
    expect(verifyWebAppCookie(value, 'other-secret', NOW)).toBeNull()
    expect(verifyWebAppCookie(value, secret, new Date(NOW.getTime() + 12 * 3600 * 1000 + 1000))).toBeNull()
    expect(verifyWebAppCookie('garbage', secret, NOW)).toBeNull()
  })
})
