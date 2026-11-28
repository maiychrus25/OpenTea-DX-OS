/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { auth } from '@/auth'
import { prisma } from '@/infrastructure/db/prisma.client'
import * as partners from '@/app/api/partners/route'
import * as partnerById from '@/app/api/partners/[id]/route'

jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/infrastructure/db/farm/PrismaHtxProfileRepository', () => ({
  PrismaHtxProfileRepository: jest.fn(() => ({ findByCode: async (code: string) => ({ id: `htx-${code}`, htx_code: code }) })),
}))
jest.mock('@/infrastructure/db/prisma.client', () => ({
  prisma: {
    partner: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  },
}))

const signIn = (role: string) => (auth as jest.Mock).mockResolvedValue({ user: { id: 'u1', role, htxCode: 'TC', name: 'U' } })
const json = (method: string, body: unknown = {}) =>
  new Request('http://localhost/api/partners', { method, body: method === 'GET' ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json' } })
const ctx = (id: string): any => ({ params: { id } })
const newPartner = { name: 'Buyer', partner_type: 'BUYER', lat: 1, lng: 2 }

beforeEach(() => {
  jest.clearAllMocks()
  ;(prisma.partner.findMany as jest.Mock).mockResolvedValue([])
  ;(prisma.partner.create as jest.Mock).mockImplementation(async ({ data }: any) => ({ id: 'p1', ...data }))
})

describe('partners roles', () => {
  test('GET as farmer answers 403', async () => {
    signIn('farmer')
    expect((await partners.GET(json('GET'), {})).status).toBe(403)
    expect(prisma.partner.findMany).not.toHaveBeenCalled()
  })

  test('GET as officer lists only partners of the caller HTX', async () => {
    signIn('officer')
    expect((await partners.GET(json('GET'), {})).status).toBe(200)
    expect(prisma.partner.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { htx_profile_id: 'htx-TC' } }))
  })

  test('GET as accountant lists the partners of the caller HTX, for wholesale orders', async () => {
    signIn('accountant')
    expect((await partners.GET(json('GET'), {})).status).toBe(200)
    expect(prisma.partner.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { htx_profile_id: 'htx-TC' } }))
  })

  test('POST as accountant answers 403 and writes nothing', async () => {
    signIn('accountant')
    expect((await partners.POST(json('POST', newPartner), {})).status).toBe(403)
    expect(prisma.partner.create).not.toHaveBeenCalled()
  })

  test('POST as officer answers 403 and writes nothing', async () => {
    signIn('officer')
    expect((await partners.POST(json('POST', newPartner), {})).status).toBe(403)
    expect(prisma.partner.create).not.toHaveBeenCalled()
  })

  test('POST as manager stores the HTX of the caller even when the body names another', async () => {
    signIn('manager')
    const response = await partners.POST(json('POST', { ...newPartner, htx_profile_id: 'htx-LB' }), {})
    expect(response.status).toBe(200)
    expect((prisma.partner.create as jest.Mock).mock.calls[0][0].data.htx_profile_id).toBe('htx-TC')
  })

  test.each([
    ['PUT', 'officer'],
    ['PUT', 'farmer'],
    ['DELETE', 'officer'],
    ['DELETE', 'farmer'],
    ['PUT', 'accountant'],
    ['DELETE', 'accountant'],
  ])('%s as %s answers 403', async (method, role) => {
    signIn(role)
    const handler = method === 'PUT' ? partnerById.PUT : partnerById.DELETE
    expect((await handler(json(method, { name: 'X' }), ctx('p1'))).status).toBe(403)
    expect(prisma.partner.update).not.toHaveBeenCalled()
    expect(prisma.partner.delete).not.toHaveBeenCalled()
  })

  test('PUT as manager looks the partner up inside the caller HTX', async () => {
    signIn('manager')
    ;(prisma.partner.findFirst as jest.Mock).mockResolvedValue({ id: 'p1' })
    ;(prisma.partner.update as jest.Mock).mockResolvedValue({ id: 'p1' })
    expect((await partnerById.PUT(json('PUT', { name: 'X' }), ctx('p1'))).status).toBe(200)
    expect(prisma.partner.findFirst).toHaveBeenCalledWith({ where: { id: 'p1', htx_profile_id: 'htx-TC' } })
  })
})
