/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { auth } from '@/auth'
import { prisma } from '@/infrastructure/db/prisma.client'
import { resetJwksCache } from '@/lib/auth/request-user'
import { CoreGatewayClient } from '@/infrastructure/core/core-gateway.client'
import { CreateJournalEntryUseCase } from '@/application/journal/CreateJournalEntryUseCase'
import { ListJournalEntriesUseCase } from '@/application/journal/ListJournalEntriesUseCase'
import { BatchApproveJournalUseCase } from '@/application/journal/BatchApproveJournalUseCase'
import * as journal from '@/app/api/journal/route'
import * as journalEntry from '@/app/api/journal/[id]/route'
import * as batch from '@/app/api/journal/batch-approve/route'
import * as upload from '@/app/api/journal/upload/route'
import * as notifications from '@/app/api/notifications/route'
import * as announce from '@/app/api/notifications/announce/route'
import { ISSUER, baseClaims, jwksResponse, makeKey, signToken } from '@/test-support/bearer-fixture'

jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/infrastructure/db/prisma.client', () => ({
  prisma: {
    htxProfile: { findUnique: jest.fn() },
    parcel: { findUnique: jest.fn() },
    journalEntry: { findUnique: jest.fn() },
  },
}))
jest.mock('@/infrastructure/core/core-gateway.client', () => ({ CoreGatewayClient: jest.fn() }))
jest.mock('@/infrastructure/core/gateway-journal-reader', () => ({ GatewayJournalReader: jest.fn() }))
jest.mock('@/infrastructure/storage/minio-document.adapter', () => ({ MinioDocumentAdapter: jest.fn(() => ({ generateUploadUrl: jest.fn(async (key: string) => ({ url: `https://signed/${key}` })), generateDownloadUrl: jest.fn() })) }))
jest.mock('@/application/journal/CreateJournalEntryUseCase', () => ({ CreateJournalEntryUseCase: jest.fn() }))
jest.mock('@/application/journal/ListJournalEntriesUseCase', () => ({ ListJournalEntriesUseCase: jest.fn() }))
jest.mock('@/application/journal/BatchApproveJournalUseCase', () => ({ BatchApproveJournalUseCase: jest.fn() }))
jest.mock('@/application/journal/UpdateJournalEntryUseCase', () => ({ UpdateJournalEntryUseCase: jest.fn(() => ({ execute: jest.fn().mockResolvedValue({ id: 'e1' }) })) }))
jest.mock('@/application/journal/DeleteJournalEntryUseCase', () => ({ DeleteJournalEntryUseCase: jest.fn(() => ({ execute: jest.fn() })) }))
jest.mock('@/application/farm/GetFarmerHouseholdUseCase', () => ({
  GetFarmerHouseholdUseCase: jest.fn(() => ({ execute: jest.fn().mockResolvedValue({ id: 'hh-1' }) })),
}))
jest.mock('@/infrastructure/db/journal/PrismaJournalRepository', () => ({ PrismaJournalRepository: jest.fn() }))
jest.mock('@/infrastructure/db/farm/PrismaParcelRepository', () => ({ PrismaParcelRepository: jest.fn() }))
jest.mock('@/infrastructure/db/farm/PrismaHouseholdRepository', () => ({ PrismaHouseholdRepository: jest.fn() }))
jest.mock('@/infrastructure/db/auth/keycloak-admin.adapter', () => ({
  KeycloakAdminAdapter: jest.fn(() => ({ listUsersByRole: jest.fn().mockResolvedValue([{ id: 'u9' }]) })),
}))

const mockNotificationList = jest.fn()
const mockMarkRead = jest.fn()
const mockBroadcast = jest.fn()
jest.mock('@/infrastructure/db/notification/prisma-notification-repository', () => ({ PrismaNotificationRepository: jest.fn() }))
jest.mock('@/application/notification/get-notifications-usecase', () => ({ GetNotificationsUseCase: jest.fn(() => ({ execute: (...a: unknown[]) => mockNotificationList(...a) })) }))
jest.mock('@/application/notification/mark-notification-read-usecase', () => ({ MarkNotificationReadUseCase: jest.fn(() => ({ execute: (...a: unknown[]) => mockMarkRead(...a) })) }))
jest.mock('@/application/notification/broadcast-announcement-usecase', () => ({ BroadcastAnnouncementUseCase: jest.fn(() => ({ execute: (...a: unknown[]) => mockBroadcast(...a) })) }))

const mock = (fn: unknown) => fn as jest.Mock
const key = makeKey('k1')
const fetchMock = jest.fn()
const originalFetch = global.fetch
const journalCreate = jest.fn()
const journalList = jest.fn()
const batchApprove = jest.fn()

const token = (roles: string[], claims: Record<string, unknown> = {}) =>
  signToken(key, baseClaims({ realm_access: { roles }, ...claims }))
const call = (url: string, init: { method?: string; token?: string; authorization?: string; body?: unknown } = {}) =>
  new Request(`http://localhost${url}`, {
    method: init.method ?? 'GET',
    headers: {
      ...(init.token ? { authorization: `Bearer ${init.token}` } : init.authorization ? { authorization: init.authorization } : {}),
      'content-type': 'application/json',
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
const cookieSession = (role: string) =>
  mock(auth).mockResolvedValue({ user: { id: 'cookie-user', role, htxCode: 'TC', name: 'Cookie' } })

const entry = { parcel_id: 'p1', entry_date: '2026-11-16', activities: [{ activity_type: 'SPRAYING' }] }

beforeEach(() => {
  jest.clearAllMocks()
  resetJwksCache()
  process.env.KEYCLOAK_ISSUER = ISSUER
  fetchMock.mockImplementation(async () => jwksResponse(key))
  global.fetch = fetchMock as unknown as typeof fetch
  mock(auth).mockResolvedValue(null)
  mock(prisma.htxProfile.findUnique).mockImplementation(async ({ where }) => (where.htx_code === 'TC' ? { id: 'htx-tc' } : null))
  mock(prisma.parcel.findUnique).mockResolvedValue({ household: { htx_profile_id: 'htx-tc' } })
  mock(prisma.journalEntry.findUnique).mockResolvedValue({ parcel: { household: { htx_profile_id: 'htx-tc' } } })
  mock(CreateJournalEntryUseCase).mockImplementation(() => ({ execute: journalCreate }))
  mock(ListJournalEntriesUseCase).mockImplementation(() => ({ execute: journalList }))
  mock(BatchApproveJournalUseCase).mockImplementation(() => ({ execute: batchApprove }))
  journalCreate.mockResolvedValue({ id: 'e1' })
  journalList.mockResolvedValue({ entries: [], total: 0 })
  batchApprove.mockResolvedValue({ approved: 1, failed: [] })
  mockNotificationList.mockResolvedValue({ notifications: [], unreadCount: 0 })
})
afterAll(() => {
  global.fetch = originalFetch
  delete process.env.KEYCLOAK_ISSUER
})

describe('journal with a Bearer token', () => {
  test('a farmer creates an entry as themselves, in their own household and HTX', async () => {
    const response = await journal.POST(call('/api/journal', { method: 'POST', token: token(['farmer']), body: entry }), {})
    expect(response.status).toBe(201)
    expect(auth).not.toHaveBeenCalled()
    const [input, role, householdId] = journalCreate.mock.calls[0].concat([]) as [Record<string, unknown>, string, string]
    expect(input).toMatchObject({ submitted_by_id: 'user-1', submitted_role: 'FARMER', performed_by: 'Nguyen Van A' })
    expect([role, householdId]).toEqual(['FARMER', 'hh-1'])
  })

  test('a parcel of another HTX is not found', async () => {
    mock(prisma.parcel.findUnique).mockResolvedValue({ household: { htx_profile_id: 'htx-other' } })
    const response = await journal.POST(call('/api/journal', { method: 'POST', token: token(['farmer']), body: entry }), {})
    expect(response.status).toBe(404)
    expect(journalCreate).not.toHaveBeenCalled()
  })

  test('a token without an htx_code is refused with NO_HTX', async () => {
    const response = await journal.POST(call('/api/journal', { method: 'POST', token: token(['farmer'], { htx_code: undefined }), body: entry }), {})
    expect(response.status).toBe(403)
    expect((await response.json()).error.code).toBe('NO_HTX')
    expect(journalCreate).not.toHaveBeenCalled()
  })

  test('a manager cannot create, as before', async () => {
    const response = await journal.POST(call('/api/journal', { method: 'POST', token: token(['manager']), body: entry }), {})
    expect(response.status).toBe(403)
  })

  test('a customer role is 403 on every route', async () => {
    const customer = token(['customer'])
    const responses = [
      await journal.GET(call('/api/journal', { token: customer }), {}),
      await journal.POST(call('/api/journal', { method: 'POST', token: customer, body: entry }), {}),
      await batch.POST(call('/api/journal/batch-approve', { method: 'POST', token: customer, body: { entry_ids: ['e1'] } }), {}),
      await notifications.GET(call('/api/notifications', { token: customer }), {}),
      await announce.POST(call('/api/notifications/announce', { method: 'POST', token: customer, body: { title: 't', body: 'b' } }), {}),
    ]
    expect(responses.map((r) => r.status)).toEqual([403, 403, 403, 403, 403])
    expect(journalCreate).not.toHaveBeenCalled()
  })

  test('the list reads through the gateway with the caller own token and the farmer household filter', async () => {
    const bearer = token(['farmer'])
    const response = await journal.GET(call('/api/journal?householdId=hh-victim', { token: bearer }), {})
    expect(response.status).toBe(200)
    const [role, getToken] = mock(CoreGatewayClient).mock.calls[0]
    expect(role).toBe('farmer')
    expect(await getToken()).toBe(bearer)
    expect(journalList.mock.calls[0][0].household_id).toBe('hh-1')
  })

  test('an officer approves a batch inside the HTX; a foreign id approves nothing', async () => {
    const bearer = token(['officer'])
    const ok = await batch.POST(call('/api/journal/batch-approve', { method: 'POST', token: bearer, body: { entry_ids: ['e1'] } }), {})
    expect(ok.status).toBe(200)
    expect(batchApprove).toHaveBeenCalledWith(['e1'], 'user-1', 'TC')

    mock(prisma.journalEntry.findUnique).mockResolvedValue({ parcel: { household: { htx_profile_id: 'htx-other' } } })
    batchApprove.mockClear()
    const foreign = await batch.POST(call('/api/journal/batch-approve', { method: 'POST', token: bearer, body: { entry_ids: ['x'] } }), {})
    expect(foreign.status).toBe(404)
    expect(batchApprove).not.toHaveBeenCalled()
  })

  test('a farmer cannot approve', async () => {
    const response = await batch.POST(call('/api/journal/batch-approve', { method: 'POST', token: token(['farmer']), body: { entry_ids: ['e1'] } }), {})
    expect(response.status).toBe(403)
  })

  test('update is checked against the HTX', async () => {
    const context = { params: Promise.resolve({ id: 'e1' }) }
    expect((await journalEntry.PUT(call('/api/journal/e1', { method: 'PUT', token: token(['farmer']), body: { observation: 'x' } }), context)).status).toBe(200)
    mock(prisma.journalEntry.findUnique).mockResolvedValue({ parcel: { household: { htx_profile_id: 'htx-other' } } })
    expect((await journalEntry.PUT(call('/api/journal/e1', { method: 'PUT', token: token(['farmer']), body: { observation: 'x' } }), context)).status).toBe(404)
  })

  test('upload presigns inside the HTX folder for a farmer', async () => {
    const response = await upload.POST(call('/api/journal/upload', { method: 'POST', token: token(['farmer']), body: { filename: 'a.jpg', contentType: 'image/jpeg' } }), {})
    expect(response.status).toBe(200)
    expect((await response.json()).data.key).toMatch(/^para\/TC\/Areas\/Journal\//)
  })
})

describe('notifications with a Bearer token', () => {
  test('lists the caller notifications', async () => {
    const response = await notifications.GET(call('/api/notifications', { token: token(['farmer']) }), {})
    expect(response.status).toBe(200)
    expect(mockNotificationList).toHaveBeenCalledWith('user-1', 'htx-tc', 5, undefined)
  })

  test('marks one read for the token subject, not for a user named in the body', async () => {
    const response = await notifications.PUT(call('/api/notifications', { method: 'PUT', token: token(['farmer']), body: { id: 'n1', action: 'mark-read', userId: 'someone-else' } }), {})
    expect(response.status).toBe(200)
    expect(mockMarkRead).toHaveBeenCalledWith('user-1', 'n1')
  })

  test('only a manager or officer announces, to the HTX of the token', async () => {
    const body = { title: 't', body: 'b' }
    expect((await announce.POST(call('/api/notifications/announce', { method: 'POST', token: token(['farmer']), body }), {})).status).toBe(403)
    expect((await announce.POST(call('/api/notifications/announce', { method: 'POST', token: token(['manager']), body }), {})).status).toBe(201)
    expect(mockBroadcast).toHaveBeenCalledWith('t', 'b', 'user-1', ['u9'])
  })
})

describe('a bad Bearer token', () => {
  test.each([
    ['journal list', () => journal.GET(call('/api/journal', { authorization: 'Bearer junk' }), {})],
    ['journal create', () => journal.POST(call('/api/journal', { method: 'POST', authorization: 'Bearer junk', body: entry }), {})],
    ['batch approve', () => batch.POST(call('/api/journal/batch-approve', { method: 'POST', authorization: 'Bearer junk', body: { entry_ids: ['e1'] } }), {})],
    ['notification list', () => notifications.GET(call('/api/notifications', { authorization: 'Bearer junk' }), {})],
    ['mark read', () => notifications.PUT(call('/api/notifications', { method: 'PUT', authorization: 'Bearer junk', body: { id: 'n1' } }), {})],
    ['announce', () => announce.POST(call('/api/notifications/announce', { method: 'POST', authorization: 'Bearer junk', body: { title: 't', body: 'b' } }), {})],
  ])('%s is 401 even with a valid cookie session', async (_name, run) => {
    cookieSession('manager')
    const response = await run()
    expect(response.status).toBe(401)
    expect(auth).not.toHaveBeenCalled()
    expect(journalCreate).not.toHaveBeenCalled()
    expect(batchApprove).not.toHaveBeenCalled()
    expect(mockMarkRead).not.toHaveBeenCalled()
    expect(mockBroadcast).not.toHaveBeenCalled()
  })

  test('an unreachable Keycloak is 503, not a pass', async () => {
    fetchMock.mockRejectedValue(new Error('down'))
    const response = await journal.GET(call('/api/journal', { token: token(['farmer']) }), {})
    expect(response.status).toBe(503)
  })
})

describe('cookie sessions are unchanged', () => {
  test('a farmer session creates an entry and the gateway client uses its default token source', async () => {
    cookieSession('farmer')
    expect((await journal.POST(call('/api/journal', { method: 'POST', body: entry }), {})).status).toBe(201)
    expect(journalCreate.mock.calls[0][0]).toMatchObject({ submitted_by_id: 'cookie-user', submitted_role: 'FARMER' })
    await journal.GET(call('/api/journal'), {})
    expect(mock(CoreGatewayClient).mock.calls[0]).toEqual(['farmer', undefined])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('no session and no token is 401', async () => {
    expect((await journal.GET(call('/api/journal'), {})).status).toBe(401)
    expect((await notifications.GET(call('/api/notifications'), {})).status).toBe(401)
    expect((await notifications.PUT(call('/api/notifications', { method: 'PUT', body: { id: 'n1' } }), {})).status).toBe(401)
  })

  test('a session marks read for itself', async () => {
    cookieSession('officer')
    await notifications.PUT(call('/api/notifications', { method: 'PUT', body: { id: 'n1' } }), {})
    expect(mockMarkRead).toHaveBeenCalledWith('cookie-user', 'n1')
  })
})
