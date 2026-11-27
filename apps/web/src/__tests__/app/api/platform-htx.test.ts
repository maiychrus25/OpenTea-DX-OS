/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { auth } from '@/auth'
import { prisma } from '@/infrastructure/db/prisma.client'
import { POST as createHtx } from '@/app/api/platform/htx/route'
import { ValidationError } from '@/domain/errors'

const kc = { registerUser: jest.fn(), deleteUser: jest.fn() }
const sync = jest.fn()

jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/infrastructure/db/prisma.client', () => ({
  prisma: { htxProfile: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() } },
}))
jest.mock('@/infrastructure/db/auth/keycloak-admin.adapter', () => ({ KeycloakAdminAdapter: jest.fn(() => kc) }))
jest.mock('@/infrastructure/db/auth/PrismaMembershipRepository', () => ({ PrismaMembershipRepository: jest.fn(() => ({ sync })) }))

const mock = (fn: unknown) => fn as jest.Mock
const signIn = (role: string | null) =>
  mock(auth).mockResolvedValue(role && { user: { id: 'pa-1', role, roles: [role], htxCode: null } })
const body = { htx_code: 'NEW', name: 'HTX Mới', manager: { fullName: 'Trần Văn B', phone: '0912345678', pin: '123456' } }
const post = (b: unknown = body) => createHtx(new Request('http://localhost/api/platform/htx', { method: 'POST', body: JSON.stringify(b) }), {})

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
  signIn('platform_admin')
  mock(prisma.htxProfile.findUnique).mockResolvedValue(null)
  mock(prisma.htxProfile.create).mockResolvedValue({ id: 'htx-new', htx_code: 'NEW', name: 'HTX Mới' })
  kc.registerUser.mockResolvedValue('kc-user-1')
})

describe('POST /api/platform/htx', () => {
  test('creates the profile, the first manager account without TOTP, and the membership', async () => {
    const response = await post()
    expect(response.status).toBe(201)
    expect(prisma.htxProfile.create).toHaveBeenCalledWith({ data: expect.objectContaining({ htx_code: 'NEW', name: 'HTX Mới' }) })
    expect(kc.registerUser).toHaveBeenCalledWith(
      { fullName: 'Trần Văn B', phone: '0912345678', pin: '123456', htxId: 'htx-new', htxCode: 'NEW' },
      ['manager'],
      true
    )
    expect(sync).toHaveBeenCalledWith('kc-user-1', 'htx-new', ['manager'])
    expect((await response.json()).data).toEqual({ id: 'htx-new', htx_code: 'NEW', name: 'HTX Mới' })
  })

  test('a duplicate code answers 409 and creates nothing', async () => {
    mock(prisma.htxProfile.findUnique).mockResolvedValue({ id: 'x' })
    expect((await post()).status).toBe(409)
    expect(prisma.htxProfile.create).not.toHaveBeenCalled()
    expect(kc.registerUser).not.toHaveBeenCalled()
  })

  test('a duplicate phone answers 409 and the profile row is removed', async () => {
    kc.registerUser.mockRejectedValue(new ValidationError('Số điện thoại này đã được đăng ký!'))
    expect((await post()).status).toBe(409)
    expect(prisma.htxProfile.delete).toHaveBeenCalledWith({ where: { id: 'htx-new' } })
  })

  test('a Keycloak failure removes the profile row and leaves nothing half-created', async () => {
    kc.registerUser.mockRejectedValue(new Error('keycloak down'))
    const response = await post()
    expect(response.status).toBe(500)
    expect(prisma.htxProfile.delete).toHaveBeenCalledWith({ where: { id: 'htx-new' } })
    expect(sync).not.toHaveBeenCalled()
  })

  test('only a platform admin: manager, officer, farmer, accountant get 403 and nothing is written', async () => {
    for (const role of ['manager', 'officer', 'farmer', 'accountant']) {
      signIn(role)
      expect((await post()).status).toBe(403)
    }
    signIn(null)
    expect((await post()).status).toBe(401)
    expect(prisma.htxProfile.create).not.toHaveBeenCalled()
  })

  test('rejects a malformed code or body', async () => {
    expect((await post({ ...body, htx_code: 'bad code' })).status).toBe(400)
    expect((await post({ ...body, manager: { fullName: 'A', phone: '1', pin: '1' } })).status).toBe(400)
    expect(prisma.htxProfile.create).not.toHaveBeenCalled()
  })
})
