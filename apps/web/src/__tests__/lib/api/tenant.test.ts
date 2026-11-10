/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { auth } from '@/auth'
import { prisma } from '@/infrastructure/db/prisma.client'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { ForbiddenError, NoHtxError, UnauthorizedError } from '@/domain/errors'

jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/infrastructure/db/prisma.client', () => ({
  prisma: { htxProfile: { findUnique: jest.fn(), findFirst: jest.fn() } },
}))

const signIn = (user: Record<string, unknown> | null) =>
  (auth as jest.Mock).mockResolvedValue(user ? { user } : null)
const findUnique = prisma.htxProfile.findUnique as jest.Mock
const findFirst = prisma.htxProfile.findFirst as jest.Mock

beforeEach(() => jest.clearAllMocks())

describe('requireTenant', () => {
  test('requireTenant throws UnauthorizedError without a session', async () => {
    signIn(null)
    await expect(requireTenant()).rejects.toBeInstanceOf(UnauthorizedError)
  })

  test('requireTenant throws NoHtxError when htxCode is null', async () => {
    signIn({ id: 'u1', role: 'officer', htxCode: null })
    await expect(requireTenant()).rejects.toBeInstanceOf(NoHtxError)
    expect(findUnique).not.toHaveBeenCalled()
  })

  test('requireTenant throws NoHtxError when the code matches no htx_profiles row', async () => {
    signIn({ id: 'u1', role: 'officer', htxCode: 'XX' })
    findUnique.mockResolvedValue(null)
    await expect(requireTenant()).rejects.toBeInstanceOf(NoHtxError)
    expect(findUnique).toHaveBeenCalledWith({ where: { htx_code: 'XX' } })
  })

  test('requireTenant never returns another HTX when the code is unknown', async () => {
    signIn({ id: 'u1', role: 'manager', htxCode: 'XX' })
    findUnique.mockResolvedValue(null)
    findFirst.mockResolvedValue({ id: 'other-htx', name: 'Other', htx_code: 'LB' })
    await expect(requireTenant()).rejects.toBeInstanceOf(NoHtxError)
    expect(findFirst).not.toHaveBeenCalled()
  })

  test('requireTenant rejects a signed-in user without a role', async () => {
    signIn({ id: 'u1', htxCode: 'MD2' })
    await expect(requireTenant()).rejects.toBeInstanceOf(ForbiddenError)
  })

  test('requireTenant returns the HTX of the signed-in user', async () => {
    signIn({ id: 'u1', role: 'farmer', htxCode: 'MD2' })
    findUnique.mockResolvedValue({ id: 'htx-md2', name: 'HTX MD2' })
    await expect(requireTenant()).resolves.toEqual({
      userId: 'u1',
      role: 'farmer',
      htxCode: 'MD2',
      htxProfileId: 'htx-md2',
    })
  })
})

describe('withErrorHandler', () => {
  const request = new Request('http://localhost/api/x')

  test('withErrorHandler maps NoHtxError to 403 NO_HTX', async () => {
    const response = await withErrorHandler(async () => {
      throw new NoHtxError()
    })(request, {})
    expect(response.status).toBe(403)
    expect((await response.json()).error.code).toBe('NO_HTX')
  })

  test('withErrorHandler maps UnauthorizedError to 401', async () => {
    const response = await withErrorHandler(async () => {
      throw new UnauthorizedError()
    })(request, {})
    expect(response.status).toBe(401)
    expect((await response.json()).error.code).toBe('UNAUTHORIZED')
  })

  test('NoHtxError stays a ForbiddenError and carries the digest error pages read', () => {
    const error = new NoHtxError()
    expect(error).toBeInstanceOf(ForbiddenError)
    expect(error.digest).toBe('NO_HTX')
  })
})
