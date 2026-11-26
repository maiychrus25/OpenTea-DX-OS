/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { createHmac } from 'node:crypto'
import { webAppKeyFromBotToken, verifyWebAppCookie, WEBAPP_COOKIE_NAME } from '@/domain/telegram/webapp-init-data'

const activeUserLinkByUser = jest.fn()
jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/application/telegram/telegram-services', () => ({
  telegramRepository: () => ({ activeUserLinkByUser }),
}))

import { auth } from '@/auth'
import { POST } from '@/app/api/telegram/webapp/session/route'

const TOKEN = '123456:FAKE-token-for-tests'
const KEY = webAppKeyFromBotToken(TOKEN)

function initData(telegramId: number, authDate = Math.floor(Date.now() / 1000) - 30, token = TOKEN): string {
  const fields: Record<string, string> = { auth_date: String(authDate), user: JSON.stringify({ id: telegramId }) }
  const secret = createHmac('sha256', 'WebAppData').update(token).digest()
  const check = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n')
  return new URLSearchParams({ ...fields, hash: createHmac('sha256', secret).update(check).digest('hex') }).toString()
}

const call = (body: unknown) =>
  POST(new Request('http://localhost/api/telegram/webapp/session', { method: 'POST', body: JSON.stringify(body) }), {})

describe('POST /api/telegram/webapp/session', () => {
  const env = process.env
  beforeEach(() => {
    jest.resetAllMocks()
    process.env = { ...env, DXOS_TELEGRAM_WEBAPP_KEY: KEY, AUTH_SECRET: 'test-auth-secret' }
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'user-1' } })
    activeUserLinkByUser.mockResolvedValue({ telegramUserId: '4242' })
  })
  afterAll(() => {
    process.env = env
  })

  it('binds the linked Telegram account: 200 and a signed httpOnly cookie', async () => {
    const res = await call({ init_data: initData(4242) })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { telegram_user_id: 4242 } })
    const cookie = res.cookies.get(WEBAPP_COOKIE_NAME)!
    expect(verifyWebAppCookie(cookie.value, 'test-auth-secret', new Date())).toEqual({ telegramUserId: '4242', userId: 'user-1' })
    expect(res.headers.get('set-cookie')).toMatch(/HttpOnly/i)
    expect(res.headers.get('set-cookie')).toMatch(/Max-Age=43200/i)
  })

  it('answers 403 WEBAPP_NOT_LINKED for another person\'s Telegram account and binds nothing (test 13)', async () => {
    const res = await call({ init_data: initData(9999) })
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('WEBAPP_NOT_LINKED')
    expect(res.cookies.get(WEBAPP_COOKIE_NAME)).toBeUndefined()
  })

  it('answers 403 when the session user has no active link', async () => {
    activeUserLinkByUser.mockResolvedValue(null)
    const res = await call({ init_data: initData(4242) })
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('WEBAPP_NOT_LINKED')
  })

  it.each([
    ['a stale auth_date', () => initData(4242, Math.floor(Date.now() / 1000) - 25 * 3600)],
    ['another bot token', () => initData(4242, undefined, '1:other')],
    ['garbage', () => 'hash=abc'],
  ])('answers 400 WEBAPP_INVALID for %s and binds nothing', async (_name, make) => {
    const res = await call({ init_data: make() })
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('WEBAPP_INVALID')
    expect(res.cookies.get(WEBAPP_COOKIE_NAME)).toBeUndefined()
    expect(activeUserLinkByUser).not.toHaveBeenCalled()
  })

  it('answers 400 for a body without init_data', async () => {
    expect((await call({})).status).toBe(400)
  })

  it('answers 401 without a session', async () => {
    ;(auth as jest.Mock).mockResolvedValue(null)
    expect((await call({ init_data: initData(4242) })).status).toBe(401)
  })

  it('answers 404 WEBAPP_DISABLED when the derived key is missing', async () => {
    delete process.env.DXOS_TELEGRAM_WEBAPP_KEY
    const res = await call({ init_data: initData(4242) })
    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('WEBAPP_DISABLED')
  })
})
