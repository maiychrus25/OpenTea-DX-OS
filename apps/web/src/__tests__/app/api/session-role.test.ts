/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { auth, unstable_update } from '@/auth'
import { POST as switchRole } from '@/app/api/session/role/route'
import { logger } from '@/lib/logger'
import { GET as listMembers } from '@/app/api/members/route'

jest.mock('@/auth', () => ({ auth: jest.fn(), unstable_update: jest.fn() }))
jest.mock('@/infrastructure/db/prisma.client', () => ({ prisma: { htxProfile: { findUnique: jest.fn(async () => ({ id: 'htx1', name: 'TC' })) } } }))
jest.mock('@/infrastructure/db/auth/PrismaMembershipRepository', () => ({
  PrismaMembershipRepository: jest.fn(() => ({ sync: jest.fn() })),
}))

const session = (user: Record<string, unknown> | null) => (auth as jest.Mock).mockResolvedValue(user && { user })
const post = (body: unknown) =>
  switchRole(new Request('http://localhost/api/session/role', { method: 'POST', body: JSON.stringify(body) }), {})

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(logger, 'info').mockImplementation(() => undefined)
})

describe('POST /api/session/role', () => {
  test('401 without a session', async () => {
    session(null)
    expect((await post({ role: 'farmer' })).status).toBe(401)
    expect(unstable_update).not.toHaveBeenCalled()
  })

  test('403 for a role the token does not hold, and the session is unchanged', async () => {
    session({ id: 'u1', role: 'farmer', roles: ['farmer', 'officer'], htxCode: 'TC' })
    const response = await post({ role: 'manager' })
    expect(response.status).toBe(403)
    expect(unstable_update).not.toHaveBeenCalled()
  })

  test('a legacy session (no roles) can only switch to its own role', async () => {
    session({ id: 'u1', role: 'farmer', htxCode: 'TC' })
    expect((await post({ role: 'platform_admin' })).status).toBe(403)
    expect(unstable_update).not.toHaveBeenCalled()
  })

  test('rejects a name that is not a human role', async () => {
    session({ id: 'u1', role: 'farmer', roles: ['farmer'], htxCode: 'TC' })
    expect((await post({ role: 'admin' })).status).toBe(400)
    expect((await post({})).status).toBe(400)
    expect(unstable_update).not.toHaveBeenCalled()
  })

  test('200 with the home of the new role, and the session is updated with the role only', async () => {
    session({ id: 'u1', role: 'manager', roles: ['manager', 'accountant'], htxCode: 'TC' })
    const response = await post({ role: 'accountant' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { role: 'accountant', home: '/accountant/dashboard' } })
    expect(unstable_update).toHaveBeenCalledWith({ role: 'accountant' })
  })

  test('platform_admin goes to /platform', async () => {
    session({ id: 'u1', role: 'farmer', roles: ['farmer', 'platform_admin'] })
    expect(await (await post({ role: 'platform_admin' })).json()).toEqual({ data: { role: 'platform_admin', home: '/platform' } })
  })
})

describe('active role gates manager routes', () => {
  test('a manager switched to farmer is refused by the manager-only API', async () => {
    session({ id: 'u1', role: 'farmer', roles: ['manager', 'farmer'], htxCode: 'TC' })
    expect((await listMembers(new Request('http://localhost/api/members'), {})).status).toBe(403)
  })

  test('a platform_admin never gets a tenant', async () => {
    session({ id: 'u1', role: 'platform_admin', roles: ['platform_admin'], htxCode: null })
    expect((await listMembers(new Request('http://localhost/api/members'), {})).status).toBe(403)
  })
})
