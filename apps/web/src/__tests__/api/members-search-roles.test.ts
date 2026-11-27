/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { auth } from '@/auth'
import * as members from '@/app/api/members/route'
import * as search from '@/app/api/search/route'

const listUsersByRole = jest.fn()
const searchExecute = jest.fn()

jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/infrastructure/db/farm/PrismaHtxProfileRepository', () => ({
  PrismaHtxProfileRepository: jest.fn(() => ({ findByCode: async (code: string) => ({ id: `htx-${code}`, htx_code: code }) })),
}))
jest.mock('@/infrastructure/db/auth/keycloak-admin.adapter', () => ({
  KeycloakAdminAdapter: jest.fn(() => ({ listUsersByRole })),
}))
jest.mock('@/application/search/GlobalSearchUseCase', () => ({
  GlobalSearchUseCase: jest.fn(() => ({ execute: searchExecute })),
}))

const signIn = (role: string) => (auth as jest.Mock).mockResolvedValue({ user: { id: 'u1', role, htxCode: 'TC', name: 'U' } })
const get = (path: string) => new Request(`http://localhost${path}`)

beforeEach(() => {
  jest.clearAllMocks()
  listUsersByRole.mockResolvedValue([])
  searchExecute.mockResolvedValue([])
})

describe('GET /api/members', () => {
  test('answers 403 FORBIDDEN to a farmer and never calls Keycloak', async () => {
    signIn('farmer')
    const response = await members.GET(get('/api/members'), {})
    expect(response.status).toBe(403)
    expect((await response.json()).error.code).toBe('FORBIDDEN')
    expect(listUsersByRole).not.toHaveBeenCalled()
  })

  test.each(['officer', 'manager'])('lists only the members of the HTX of the %s', async (role) => {
    signIn(role)
    const response = await members.GET(get('/api/members'), {})
    expect(response.status).toBe(200)
    expect(listUsersByRole).toHaveBeenCalledWith('farmer', 'TC')
    expect(listUsersByRole).toHaveBeenCalledWith('officer', 'TC')
  })
})

describe('GET /api/search', () => {
  test('answers 403 to a farmer', async () => {
    signIn('farmer')
    const response = await search.GET(get('/api/search?q=chè'), {})
    expect(response.status).toBe(403)
    expect(searchExecute).not.toHaveBeenCalled()
  })

  test('still serves an officer', async () => {
    signIn('officer')
    expect((await search.GET(get('/api/search?q=chè'), {})).status).toBe(200)
    expect(searchExecute).toHaveBeenCalledWith('chè', 'htx-TC')
  })
})
