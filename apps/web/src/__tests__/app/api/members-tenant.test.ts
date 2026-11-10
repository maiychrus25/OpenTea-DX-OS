/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { auth } from '@/auth'
import { prisma } from '@/infrastructure/db/prisma.client'
import { KeycloakAdminAdapter } from '@/infrastructure/db/auth/keycloak-admin.adapter'
import { InviteMemberUseCase } from '@/application/auth/invite-member.use-case'
import { GET as listMembers } from '@/app/api/members/route'
import { POST as inviteMember } from '@/app/api/members/invite/route'
import { POST as approveMember } from '@/app/api/members/[id]/approve/route'
import { DELETE as deleteMember } from '@/app/api/members/[id]/route'
import { POST as announce } from '@/app/api/notifications/announce/route'
import { POST as register } from '@/app/api/register/route'

jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/infrastructure/db/prisma.client', () => ({
  prisma: {
    htxProfile: { findUnique: jest.fn(), findFirst: jest.fn() },
    household: { create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn() },
    notification: { create: jest.fn(), createMany: jest.fn() },
  },
}))

type KeycloakUser = { id: string; attributes?: Record<string, string[]> }

const inHtx = (id: string, code: string): KeycloakUser => ({ id, attributes: { htx_code: [code] } })
const usersByRole: Record<string, KeycloakUser[]> = {
  farmer: [inHtx('farmer-tc', 'TC'), inHtx('farmer-lb', 'LB'), { id: 'farmer-none' }],
  officer: [inHtx('officer-tc', 'TC'), inHtx('officer-lb', 'LB')],
  manager: [inHtx('manager-tc', 'TC'), inHtx('manager-lb', 'LB')],
}
const allUsers = Object.values(usersByRole).flat()

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

let fetchMock: jest.Mock

// The register route limits requests per IP, so each test is a different client.
let clientCount = 0
const nextClientIp = () => `198.51.100.${++clientCount}`

function requestsTo(method: string, pattern: RegExp) {
  return fetchMock.mock.calls.filter(([url, init]) => (init?.method ?? 'GET') === method && pattern.test(url))
}

const createdUser = () => JSON.parse(requestsTo('POST', /\/users$/)[0][1].body)

beforeEach(() => {
  jest.clearAllMocks()
  fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url.includes('/protocol/openid-connect/token')) return json({ access_token: 't', expires_in: 60 })
    const roleUsers = url.match(/\/roles\/(\w+)\/users/)
    if (roleUsers) return json(usersByRole[roleUsers[1]] ?? [])
    const role = url.match(/\/roles\/(\w+)$/)
    if (role) return json({ name: role[1] })
    if (url.endsWith('/role-mappings/realm')) return new Response(null, { status: 204 })
    if (url.endsWith('/users') && method === 'POST') {
      return new Response(null, { status: 201, headers: { location: 'http://kc/users/new-user' } })
    }
    const user = url.match(/\/users\/([^/?]+)$/)
    if (user && method === 'GET') {
      const found = allUsers.find((u) => u.id === user[1])
      return found ? json(found) : json({ error: 'User not found' }, 404)
    }
    return new Response(null, { status: 204 })
  })
  global.fetch = fetchMock as unknown as typeof fetch
  ;(prisma.htxProfile.findUnique as jest.Mock).mockResolvedValue({ id: 'htx-tc', name: 'HTX Tân Cương', htx_code: 'TC' })
})

function signInAs(role: string, htxCode: string | null = 'TC') {
  ;(auth as jest.Mock).mockResolvedValue({ user: { id: `${role}-tc`, role, htxCode } })
}

const registerData = { fullName: 'Nguyễn Văn A', phone: '0901234567', pin: '123456', htxId: 'htx-tc', htxCode: 'TC' }
const inviteRequest = { fullName: 'Nguyễn Văn A', phone: '0901234567', pin: '123456' }

describe('account creation', () => {
  test('registerUser writes the htx_code attribute and keeps htxId', async () => {
    await new KeycloakAdminAdapter().registerUser(registerData, 'farmer', true)
    expect(createdUser().attributes).toMatchObject({ htx_code: ['TC'], htxId: ['htx-tc'] })
  })

  describe('invite uses the inviter HTX and adds CONFIGURE_TOTP for manager and officer, not farmer', () => {
    function useCase() {
      const householdPort = {
        isPhoneTaken: jest.fn().mockResolvedValue(false),
        findOrphanedByPhone: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'household-1' }),
        linkToKeycloak: jest.fn(),
      }
      const htxPort = { findByCode: jest.fn().mockResolvedValue({ id: 'htx-tc', name: 'HTX Tân Cương' }) }
      return { htxPort, householdPort, invite: new InviteMemberUseCase(new KeycloakAdminAdapter(), householdPort as never, htxPort) }
    }

    test.each(['manager', 'officer'])('%s must configure TOTP', async (role) => {
      const { htxPort, invite } = useCase()
      await invite.execute({ ...inviteRequest, role }, 'TC')
      expect(htxPort.findByCode).toHaveBeenCalledWith('TC')
      expect(createdUser().attributes).toMatchObject({ htx_code: ['TC'], htxId: ['htx-tc'] })
      expect(createdUser().requiredActions).toEqual(['CONFIGURE_TOTP'])
    })

    test('farmer does not configure TOTP and lands in the inviter HTX', async () => {
      const { invite, householdPort } = useCase()
      await invite.execute({ ...inviteRequest, role: 'farmer' }, 'TC')
      expect(createdUser().attributes).toMatchObject({ htx_code: ['TC'], htxId: ['htx-tc'] })
      expect(createdUser().requiredActions ?? []).not.toContain('CONFIGURE_TOTP')
      expect(householdPort.create).toHaveBeenCalledWith(expect.objectContaining({ htx_profile_id: 'htx-tc' }))
    })

    test('an unknown inviter HTX creates no account', async () => {
      const { invite, htxPort } = useCase()
      htxPort.findByCode.mockResolvedValue(null)
      await expect(invite.execute({ ...inviteRequest, role: 'farmer' }, 'XX')).rejects.toThrow()
      expect(requestsTo('POST', /\/users$/)).toHaveLength(0)
    })
  })

  test('the invite route takes the HTX from the signed-in manager', async () => {
    signInAs('manager')
    const response = await inviteMember(
      new Request('http://localhost/api/members/invite', {
        method: 'POST',
        body: JSON.stringify({ ...inviteRequest, role: 'officer' }),
      }),
      {}
    )
    expect(response.status).toBe(201)
    expect(createdUser().attributes.htx_code).toEqual(['TC'])
  })

  test('self-registration takes the code from the chosen HTX', async () => {
    ;(prisma.household.findFirst as jest.Mock).mockResolvedValue(null)
    ;(prisma.household.create as jest.Mock).mockResolvedValue({ id: 'household-1', name: 'A', phone: '0901234567', parcels: [] })
    const response = await register(
      new Request('http://localhost/api/register', {
        method: 'POST',
        headers: { 'x-forwarded-for': nextClientIp() },
        body: JSON.stringify({ fullName: 'Nguyễn Văn A', phone: '0901234567', pin: '123456', htxId: 'htx-tc' }),
      }),
      {}
    )
    expect(response.status).toBe(200)
    expect(prisma.htxProfile.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'htx-tc' } }))
    expect(createdUser().attributes).toMatchObject({ htx_code: ['TC'], htxId: ['htx-tc'] })
  })

  describe('a phone already held by a household', () => {
    const invite = (role = 'farmer') =>
      inviteMember(
        new Request('http://localhost/api/members/invite', {
          method: 'POST',
          body: JSON.stringify({ ...inviteRequest, role }),
        }),
        {}
      )
    const selfRegister = () =>
      register(
        new Request('http://localhost/api/register', {
          method: 'POST',
          headers: { 'x-forwarded-for': nextClientIp() },
          body: JSON.stringify({ fullName: 'Nguyễn Văn A', phone: '0901234567', pin: '123456', htxId: 'htx-tc' }),
        }),
        {}
      )
    const holdBy = (household: { htx_profile_id: string | null; keycloak_user_id: string | null }) =>
      (prisma.household.findUnique as jest.Mock).mockResolvedValue(household)

    const refusals: [string, { htx_profile_id: string | null; keycloak_user_id: string | null }][] = [
      ['an orphan of another HTX', { htx_profile_id: 'htx-lb', keycloak_user_id: null }],
      ['a linked household of another HTX', { htx_profile_id: 'htx-lb', keycloak_user_id: 'someone' }],
      ['an orphan with no HTX', { htx_profile_id: null, keycloak_user_id: null }],
      ['a linked household of the same HTX', { htx_profile_id: 'htx-tc', keycloak_user_id: 'someone' }],
    ]

    test.each(refusals)('invite refuses %s before creating a Keycloak user', async (_name, household) => {
      signInAs('manager')
      holdBy(household)
      const response = await invite()
      expect(response.status).toBe(400)
      expect(requestsTo('POST', /\/users$/)).toHaveLength(0)
      expect(prisma.household.update).not.toHaveBeenCalled()
    })

    test.each(refusals)('self-registration refuses %s before creating a Keycloak user', async (_name, household) => {
      holdBy(household)
      const response = await selfRegister()
      expect(response.status).toBe(400)
      expect(requestsTo('POST', /\/users$/)).toHaveLength(0)
      expect(prisma.household.update).not.toHaveBeenCalled()
    })

    const orphan = { id: 'household-tc', name: 'A', phone: '0901234567', address: null, parcels: [], keycloak_user_id: null }

    test('invite links an orphan of the caller HTX, looked up inside that HTX', async () => {
      signInAs('manager')
      holdBy({ htx_profile_id: 'htx-tc', keycloak_user_id: null })
      ;(prisma.household.findFirst as jest.Mock).mockResolvedValue(orphan)
      expect((await invite()).status).toBe(201)
      expect((prisma.household.findFirst as jest.Mock).mock.calls[0][0].where).toEqual({
        phone: '0901234567',
        keycloak_user_id: null,
        htx_profile_id: 'htx-tc',
      })
      expect(prisma.household.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'household-tc' }, data: { keycloak_user_id: 'new-user' } })
      )
      expect(prisma.household.create).not.toHaveBeenCalled()
    })

    test('self-registration links an orphan of the chosen HTX, looked up inside that HTX', async () => {
      holdBy({ htx_profile_id: 'htx-tc', keycloak_user_id: null })
      ;(prisma.household.findFirst as jest.Mock).mockResolvedValue(orphan)
      expect((await selfRegister()).status).toBe(200)
      expect((prisma.household.findFirst as jest.Mock).mock.calls[0][0].where.htx_profile_id).toBe('htx-tc')
      expect(prisma.household.create).not.toHaveBeenCalled()
    })

    test('inviting an officer does not touch households', async () => {
      signInAs('manager')
      holdBy({ htx_profile_id: 'htx-lb', keycloak_user_id: null })
      expect((await invite('officer')).status).toBe(201)
      expect(prisma.household.update).not.toHaveBeenCalled()
    })
  })

  test('self-registration refuses an HTX that does not exist', async () => {
    ;(prisma.htxProfile.findUnique as jest.Mock).mockResolvedValue(null)
    const response = await register(
      new Request('http://localhost/api/register', {
        method: 'POST',
        headers: { 'x-forwarded-for': nextClientIp() },
        body: JSON.stringify({ fullName: 'Nguyễn Văn A', phone: '0901234567', pin: '123456', htxId: 'missing' }),
      }),
      {}
    )
    expect(response.status).toBe(400)
    expect(requestsTo('POST', /\/users$/)).toHaveLength(0)
  })
})

describe('members are scoped to the caller HTX', () => {
  test('members list returns only users with the caller htx_code', async () => {
    signInAs('manager')
    const response = await listMembers(new Request('http://localhost/api/members'), {})
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.data.map((m: { id: string }) => m.id).sort()).toEqual(['farmer-tc', 'officer-tc'])
  })

  test('members list asks Keycloak for more than its default page of 100', async () => {
    signInAs('manager')
    await listMembers(new Request('http://localhost/api/members?role=farmer'), {})
    const [url] = requestsTo('GET', /\/roles\/farmer\/users/)[0]
    expect(Number(new URL(url).searchParams.get('max'))).toBeGreaterThan(100)
  })

  test('members list answers 403 NO_HTX for a caller without an HTX', async () => {
    signInAs('manager', null)
    const response = await listMembers(new Request('http://localhost/api/members'), {})
    expect(response.status).toBe(403)
    expect((await response.json()).error.code).toBe('NO_HTX')
  })

  describe('approve and delete of a member from another HTX answer 404', () => {
    const approve = (id: string) =>
      approveMember(new Request(`http://localhost/api/members/${id}/approve`, { method: 'POST' }), { params: { id } })
    const remove = (id: string) =>
      deleteMember(new Request(`http://localhost/api/members/${id}`, { method: 'DELETE' }), { params: { id } })

    test.each(['farmer-lb', 'farmer-none', 'no-such-user'])('approve %s', async (id) => {
      signInAs('manager')
      expect((await approve(id)).status).toBe(404)
      expect(requestsTo('PUT', /\/users\//)).toHaveLength(0)
    })

    test.each(['farmer-lb', 'farmer-none', 'no-such-user'])('delete %s', async (id) => {
      signInAs('manager')
      expect((await remove(id)).status).toBe(404)
      expect(requestsTo('DELETE', /\/users\//)).toHaveLength(0)
    })

    test('approve still works inside the caller HTX', async () => {
      signInAs('manager')
      expect((await approve('farmer-tc')).status).toBe(200)
      expect(requestsTo('PUT', /\/users\/farmer-tc$/)).toHaveLength(1)
    })

    test('delete still works inside the caller HTX', async () => {
      signInAs('manager')
      expect((await remove('farmer-tc')).status).toBe(200)
      expect(requestsTo('DELETE', /\/users\/farmer-tc$/)).toHaveLength(1)
    })

    test('an officer still may not approve', async () => {
      signInAs('officer')
      expect((await approve('farmer-tc')).status).toBe(403)
      expect(requestsTo('PUT', /\/users\//)).toHaveLength(0)
    })

    test('an officer still may not delete', async () => {
      signInAs('officer')
      expect((await remove('farmer-tc')).status).toBe(401)
      expect(requestsTo('DELETE', /\/users\//)).toHaveLength(0)
    })
  })
})

describe('announcements', () => {
  test('announce notifies only recipients in the caller HTX', async () => {
    signInAs('officer')
    const response = await announce(
      new Request('http://localhost/api/notifications/announce', {
        method: 'POST',
        body: JSON.stringify({ title: 'Bão', body: 'Chú ý' }),
      }),
      {}
    )
    expect(response.status).toBe(201)
    expect(prisma.notification.create).not.toHaveBeenCalled()
    const { data } = (prisma.notification.createMany as jest.Mock).mock.calls[0][0]
    expect(data.map((row: { recipient_id: string }) => row.recipient_id).sort()).toEqual([
      'farmer-tc',
      'manager-tc',
      'officer-tc',
    ])
    expect(data[0]).toMatchObject({ title: 'Bão', body: 'Chú ý', type: 'BROADCAST' })
  })

  test('announce refuses a caller without an HTX', async () => {
    signInAs('officer', null)
    const response = await announce(
      new Request('http://localhost/api/notifications/announce', {
        method: 'POST',
        body: JSON.stringify({ title: 'Bão', body: 'Chú ý' }),
      }),
      {}
    )
    expect(response.status).toBe(403)
    expect(prisma.notification.createMany).not.toHaveBeenCalled()
  })
})
