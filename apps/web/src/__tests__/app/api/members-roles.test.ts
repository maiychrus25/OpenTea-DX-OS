/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { auth } from '@/auth'
import { PUT as putRoles } from '@/app/api/members/[id]/roles/route'
import { GET as listMembers } from '@/app/api/members/route'
import { POST as invite } from '@/app/api/members/invite/route'
import { DELETE as deleteMember } from '@/app/api/members/[id]/route'

const kc = {
  getMember: jest.fn(),
  setRealmRoles: jest.fn(),
  registerUser: jest.fn(),
  listUsersByRole: jest.fn(),
  deleteUser: jest.fn(),
  getUserHtxCode: jest.fn(),
}
const households = {
  findByKeycloakUserId: jest.fn(),
  findOrphanedByPhone: jest.fn(),
  isPhoneTaken: jest.fn(),
  create: jest.fn(),
  linkToKeycloak: jest.fn(),
  unlinkFromKeycloak: jest.fn(),
}
const sync = jest.fn()

jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/infrastructure/db/auth/keycloak-admin.adapter', () => ({ KeycloakAdminAdapter: jest.fn(() => kc) }))
jest.mock('@/infrastructure/db/farm/PrismaHouseholdRepository', () => ({ PrismaHouseholdRepository: jest.fn(() => households) }))
jest.mock('@/infrastructure/db/farm/PrismaHtxProfileRepository', () => ({
  PrismaHtxProfileRepository: jest.fn(() => ({ findByCode: async (code: string) => ({ id: `htx-${code}`, name: code }) })),
}))
jest.mock('@/infrastructure/db/auth/PrismaMembershipRepository', () => ({ PrismaMembershipRepository: jest.fn(() => ({ sync })) }))

const signIn = (role: string, id = 'manager-1', htxCode: string | null = 'TC') =>
  (auth as jest.Mock).mockResolvedValue({ user: { id, role, roles: [role], htxCode } })
const member = (over: Record<string, unknown> = {}) => ({
  id: 'u2', htxCode: 'TC', fullName: 'Lê Văn C', phone: '0901234567', enabled: true, roles: ['officer'], ...over,
})
const put = (id: string, body: unknown) =>
  putRoles(new Request(`http://localhost/api/members/${id}/roles`, { method: 'PUT', body: JSON.stringify(body) }), { params: { id } })
const post = (body: unknown) => invite(new Request('http://localhost/api/members/invite', { method: 'POST', body: JSON.stringify(body) }), {})

beforeEach(() => {
  jest.clearAllMocks()
  signIn('manager')
  kc.getMember.mockResolvedValue(member())
  households.findByKeycloakUserId.mockResolvedValue(null)
  households.findOrphanedByPhone.mockResolvedValue(null)
  households.isPhoneTaken.mockResolvedValue(false)
  households.create.mockResolvedValue({ id: 'hh-new' })
  kc.registerUser.mockResolvedValue('new-user')
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('PUT /api/members/[id]/roles', () => {
  test('a member of another HTX answers 404 and changes nothing', async () => {
    kc.getMember.mockResolvedValue(member({ htxCode: 'LB' }))
    expect((await put('u2', { roles: ['farmer'] })).status).toBe(404)
    expect(kc.setRealmRoles).not.toHaveBeenCalled()
  })

  test('an unknown user answers 404', async () => {
    kc.getMember.mockResolvedValue(null)
    expect((await put('nobody', { roles: ['farmer'] })).status).toBe(404)
  })

  test('another manager answers 403', async () => {
    kc.getMember.mockResolvedValue(member({ id: 'manager-2', roles: ['manager', 'officer'] }))
    expect((await put('manager-2', { roles: ['officer'] })).status).toBe(403)
    expect(kc.setRealmRoles).not.toHaveBeenCalled()
  })

  test('only a manager may edit roles', async () => {
    for (const role of ['officer', 'farmer', 'accountant']) {
      signIn(role, 'someone')
      expect((await put('u2', { roles: ['farmer'] })).status).toBe(403)
    }
    expect(kc.setRealmRoles).not.toHaveBeenCalled()
  })

  test('an empty set for a non-manager answers 422', async () => {
    expect((await put('u2', { roles: [] })).status).toBe(422)
    expect(kc.setRealmRoles).not.toHaveBeenCalled()
  })

  test('manager and unknown role names are refused', async () => {
    expect((await put('u2', { roles: ['manager'] })).status).toBe(400)
    expect((await put('u2', { roles: ['admin'] })).status).toBe(400)
    expect((await put('u2', { roles: ['platform_admin'] })).status).toBe(400)
    expect(kc.setRealmRoles).not.toHaveBeenCalled()
  })

  test('a manager edits their own secondary roles and keeps the manager role', async () => {
    kc.getMember.mockResolvedValue(member({ id: 'manager-1', roles: ['manager', 'officer'] }))
    expect((await put('manager-1', { roles: [] })).status).toBe(200)
    expect(kc.setRealmRoles).toHaveBeenCalledWith('manager-1', [], ['officer'])
    expect(sync).toHaveBeenCalledWith('manager-1', 'htx-TC', ['manager'])
  })

  test('adds the missing roles and removes the surplus ones, only inside the three editable roles', async () => {
    kc.getMember.mockResolvedValue(member({ roles: ['officer', 'offline_access', 'uma_authorization'] }))
    const response = await put('u2', { roles: ['accountant', 'farmer'] })
    expect(response.status).toBe(200)
    expect(kc.setRealmRoles).toHaveBeenCalledWith('u2', expect.arrayContaining(['accountant', 'farmer']), ['officer'])
    expect(sync).toHaveBeenCalledWith('u2', 'htx-TC', expect.arrayContaining(['accountant', 'farmer']))
    expect((await response.json()).data.roles.sort()).toEqual(['accountant', 'farmer'])
  })

  test('adding farmer creates a household for the member', async () => {
    await put('u2', { roles: ['officer', 'farmer'] })
    expect(households.create).toHaveBeenCalledWith(expect.objectContaining({ phone: '0901234567', owner_name: 'Lê Văn C', htx_profile_id: 'htx-TC' }))
    expect(households.linkToKeycloak).toHaveBeenCalledWith('hh-new', 'u2')
  })

  test('adding farmer links an existing unlinked household with that phone', async () => {
    households.findOrphanedByPhone.mockResolvedValue({ id: 'hh-old' })
    await put('u2', { roles: ['farmer'] })
    expect(households.create).not.toHaveBeenCalled()
    expect(households.linkToKeycloak).toHaveBeenCalledWith('hh-old', 'u2')
  })

  test('adding farmer to a member who already has a household creates nothing', async () => {
    households.findByKeycloakUserId.mockResolvedValue({ id: 'hh-mine' })
    await put('u2', { roles: ['farmer'] })
    expect(households.create).not.toHaveBeenCalled()
    expect(households.linkToKeycloak).not.toHaveBeenCalled()
  })

  test('removing farmer keeps the household and its history', async () => {
    kc.getMember.mockResolvedValue(member({ roles: ['farmer', 'officer'] }))
    expect((await put('u2', { roles: ['officer'] })).status).toBe(200)
    expect(kc.setRealmRoles).toHaveBeenCalledWith('u2', [], ['farmer'])
    expect(households.unlinkFromKeycloak).not.toHaveBeenCalled()
    expect(households.create).not.toHaveBeenCalled()
  })
})

describe('GET /api/members', () => {
  test('groups one person with several roles into one row and includes managers', async () => {
    const person = (id: string, name: string) => ({ id, full_name: name, email: name, phone: id, is_active: true, createdTimestamp: 1 })
    kc.listUsersByRole.mockImplementation(async (role: string) =>
      ({
        farmer: [person('u1', 'Hùng'), person('u2', 'Lan')],
        officer: [person('u1', 'Hùng')],
        accountant: [],
        manager: [person('m1', 'Giám đốc')],
      } as Record<string, unknown[]>)[role] ?? []
    )
    const body = await (await listMembers(new Request('http://localhost/api/members'), {})).json()
    expect(body.data).toHaveLength(3)
    const hung = body.data.find((m: { id: string }) => m.id === 'u1')
    expect(hung.roles).toEqual(['officer', 'farmer'])
    expect(hung.role).toBe('officer')
    expect(body.data.find((m: { id: string }) => m.id === 'm1').roles).toEqual(['manager'])
  })

  test('the role filter keeps the people who hold that role among their roles', async () => {
    const person = (id: string) => ({ id, full_name: id, email: id, phone: id, is_active: true })
    kc.listUsersByRole.mockImplementation(async (role: string) => (role === 'farmer' || role === 'officer' ? [person('u1')] : role === 'manager' ? [person('m1')] : []))
    const body = await (await listMembers(new Request('http://localhost/api/members?role=manager'), {})).json()
    expect(body.data.map((m: { id: string }) => m.id)).toEqual(['m1'])
  })
})

describe('POST /api/members/invite', () => {
  const base = { fullName: 'Nguyễn Văn A', phone: '0901234567', pin: '123456' }

  test('a person can be invited with several roles, and a household is created for farmer', async () => {
    const response = await post({ ...base, roles: ['farmer', 'accountant'] })
    expect(response.status).toBe(201)
    expect(kc.registerUser).toHaveBeenCalledWith(expect.objectContaining({ htxCode: 'TC' }), ['farmer', 'accountant'], true)
    expect(households.create).toHaveBeenCalled()
    expect(sync).toHaveBeenCalledWith('new-user', 'htx-TC', ['farmer', 'accountant'])
  })

  test('accountant alone is allowed and creates no household', async () => {
    expect((await post({ ...base, role: 'accountant' })).status).toBe(201)
    expect(kc.registerUser).toHaveBeenCalledWith(expect.anything(), ['accountant'], true)
    expect(households.create).not.toHaveBeenCalled()
  })

  test('role alone still works as before', async () => {
    expect((await post({ ...base, role: 'officer' })).status).toBe(201)
    expect(kc.registerUser).toHaveBeenCalledWith(expect.anything(), ['officer'], true)
  })

  test('manager and platform_admin cannot be invited', async () => {
    expect((await post({ ...base, roles: ['manager'] })).status).toBe(400)
    expect((await post({ ...base, roles: ['platform_admin'] })).status).toBe(400)
    expect((await post({ ...base, roles: [] })).status).toBe(400)
    expect(kc.registerUser).not.toHaveBeenCalled()
  })

  test('only the manager can invite', async () => {
    signIn('officer', 'o1')
    expect((await post({ ...base, role: 'farmer' })).status).toBe(403)
  })
})

describe('DELETE /api/members/[id]', () => {
  test('a manager account cannot be deleted through the member list', async () => {
    kc.getUserHtxCode.mockResolvedValue('TC')
    kc.getMember.mockResolvedValue(member({ id: 'manager-2', roles: ['manager'] }))
    const response = await deleteMember(new Request('http://localhost/api/members/manager-2', { method: 'DELETE' }), { params: { id: 'manager-2' } })
    expect(response.status).toBe(403)
    expect(kc.deleteUser).not.toHaveBeenCalled()
  })
})
