/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { auth } from '@/auth'
import { prisma } from '@/infrastructure/db/prisma.client'
import { PUT } from '@/app/api/platform/pesticides/[id]/route'

// The pesticide tables come from the S1 track and are not in this worktree's Prisma client yet: the model is mocked.
const pesticideProduct = { findUnique: jest.fn(), update: jest.fn() }
jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/infrastructure/db/prisma.client', () => ({ prisma: { pesticideProduct: {} } }))

const signIn = (role: string | null) =>
  (auth as jest.Mock).mockResolvedValue(role && { user: { id: 'pa-1', role, roles: [role], htxCode: null } })
const body = { default_phi_days: 14, phi_needs_label_check: false, active: true }
const put = (b: unknown = body, id = 'p1') =>
  PUT(new Request('http://web/x', { method: 'PUT', body: JSON.stringify(b) }), { params: { id } })

beforeEach(() => {
  jest.clearAllMocks()
  Object.assign((prisma as unknown as { pesticideProduct: object }).pesticideProduct, pesticideProduct)
  signIn('platform_admin')
  pesticideProduct.findUnique.mockResolvedValue({ id: 'p1' })
  pesticideProduct.update.mockResolvedValue({ id: 'p1', ...body })
})

describe('PUT /api/platform/pesticides/[id]', () => {
  test('updates the floor, the label-check flag and active', async () => {
    const response = await put()
    expect(response.status).toBe(200)
    expect(pesticideProduct.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: body })
  })

  test('writes only the three fields, whatever else the body carries', async () => {
    await put({ ...body, trade_name: 'x', source: 'y' })
    expect(pesticideProduct.update.mock.calls[0][0].data).toEqual(body)
  })

  test('a missing product answers 404', async () => {
    pesticideProduct.findUnique.mockResolvedValue(null)
    expect((await put()).status).toBe(404)
    expect(pesticideProduct.update).not.toHaveBeenCalled()
  })

  test.each([0, 366, 1.5, '7'])('rejects default_phi_days %p', async (days) => {
    expect((await put({ ...body, default_phi_days: days })).status).toBe(400)
    expect(pesticideProduct.update).not.toHaveBeenCalled()
  })

  test('accepts the bounds 1 and 365', async () => {
    expect((await put({ ...body, default_phi_days: 1 })).status).toBe(200)
    expect((await put({ ...body, default_phi_days: 365 })).status).toBe(200)
  })

  test('only a platform admin', async () => {
    for (const role of ['manager', 'officer', 'farmer', 'accountant']) {
      signIn(role)
      expect((await put()).status).toBe(403)
    }
    signIn(null)
    expect((await put()).status).toBe(401)
    expect(pesticideProduct.update).not.toHaveBeenCalled()
  })
})
