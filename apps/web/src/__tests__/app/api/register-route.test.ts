/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { prisma } from '@/infrastructure/db/prisma.client'
import { DeleteMemberUseCase } from '@/application/auth/delete-member.use-case'
import { logger } from '@/lib/logger'
import { POST as register } from '@/app/api/register/route'

jest.mock('@/infrastructure/db/prisma.client', () => ({
  prisma: {
    htxProfile: { findUnique: jest.fn() },
    household: { create: jest.fn(), update: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn() },
  },
}))

const PIN = '135790'
const body = { fullName: 'Nguyễn Văn A', phone: '0901234567', htxId: 'htx-tc', pin: PIN }
const post = (ip: string, payload: unknown = body) =>
  register(new Request('http://localhost/api/register', { method: 'POST', headers: { 'x-forwarded-for': ip }, body: JSON.stringify(payload) }), {})

// Keycloak answers token and user creation; status decides how creating the user ends.
function keycloak(status: number) {
  global.fetch = jest.fn(async (url: string) => {
    if (url.includes('/protocol/openid-connect/token')) return new Response(JSON.stringify({ access_token: 't', expires_in: 60 }))
    if (url.endsWith('/users')) return new Response('{"errorMessage":"raw keycloak detail"}', { status })
    return new Response(null, { status: 204 })
  }) as unknown as typeof fetch
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(prisma.htxProfile.findUnique as jest.Mock).mockResolvedValue({ htx_code: 'TC' })
  ;(prisma.household.findUnique as jest.Mock).mockResolvedValue(null)
  jest.spyOn(logger, 'error').mockImplementation(() => undefined)
})

describe('POST /api/register throttle', () => {
  test('the 6th request from one IP is 429 and another IP is not', async () => {
    keycloak(409)
    for (let i = 0; i < 5; i++) expect((await post('203.0.113.1')).status).toBe(400)
    const limited = await post('203.0.113.1')
    expect(limited.status).toBe(429)
    expect((await limited.json()).error.message).toMatch(/quá nhiều/i)
    expect((await post('203.0.113.2')).status).toBe(400)
  })
  test('the window reopens after 10 minutes', async () => {
    keycloak(409)
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000)
    for (let i = 0; i < 6; i++) await post('203.0.113.3')
    expect((await post('203.0.113.3')).status).toBe(429)
    now.mockReturnValue(1_000_000 + 10 * 60 * 1000)
    expect((await post('203.0.113.3')).status).toBe(400)
    now.mockRestore()
  })
})

describe('POST /api/register errors', () => {
  test('a failure that is not a ValidationError answers the generic message and never the raw text', async () => {
    global.fetch = jest.fn(async (url: string) => {
      if (url.includes('/protocol/openid-connect/token')) return new Response(JSON.stringify({ access_token: 't', expires_in: 60 }))
      if (url.endsWith('/users')) return new Response(null, { status: 201, headers: { location: 'http://kc/users/new-user' } })
      return new Response(null, { status: 500 })
    }) as unknown as typeof fetch

    const response = await post('203.0.113.4')
    const text = await response.text()

    expect(response.status).toBe(500)
    expect(JSON.parse(text).error.message).toBe('Không thể đăng ký lúc này. Vui lòng thử lại sau.')
    expect(text).not.toContain('Could not')
    expect(JSON.stringify((logger.error as jest.Mock).mock.calls)).toContain('Could not find role')
  })
  test('the log never holds the PIN', async () => {
    keycloak(500)
    await post('203.0.113.5')
    expect(logger.error).toHaveBeenCalled()
    expect(JSON.stringify((logger.error as jest.Mock).mock.calls)).not.toContain(PIN)
  })
  test('a phone Keycloak already holds keeps its message for the farmer', async () => {
    keycloak(409)
    const response = await post('203.0.113.6')
    expect(response.status).toBe(400)
    expect((await response.json()).error.message).toBe('Số điện thoại này đã được đăng ký!')
  })
})

describe('rejecting a registration', () => {
  const ports = () => ({
    auth: { deleteUser: jest.fn().mockResolvedValue(undefined) },
    household: { unlinkFromKeycloak: jest.fn().mockResolvedValue(undefined) },
  })
  const run = (p: ReturnType<typeof ports>) => new DeleteMemberUseCase(p.auth as never, p.household as never).execute('u1')

  test('unlinks the household', async () => {
    const p = ports()
    await run(p)
    expect(p.auth.deleteUser).toHaveBeenCalledWith('u1')
    expect(p.household.unlinkFromKeycloak).toHaveBeenCalledWith('u1')
  })
  test('keeps the account when the unlink fails, so the manager can retry', async () => {
    const p = ports()
    p.household.unlinkFromKeycloak.mockRejectedValue(new Error('db down'))
    await expect(run(p)).rejects.toThrow('db down')
    expect(p.auth.deleteUser).not.toHaveBeenCalled()
  })
})
