/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { auth } from '@/auth'
import { prisma } from '@/infrastructure/db/prisma.client'
import { GET as getNotifications } from '@/app/api/notifications/route'
import { GET as stream } from '@/app/api/notifications/stream/route'
import { PrismaNotificationRepository } from '@/infrastructure/db/notification/prisma-notification-repository'
import { PrismaJournalRepository } from '@/infrastructure/db/journal/PrismaJournalRepository'
import { sseEmitter, SSE_EVENTS } from '@/lib/sse-emitter'

jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/infrastructure/db/prisma.client', () => ({
  prisma: {
    htxProfile: { findUnique: jest.fn() },
    parcel: { findUnique: jest.fn() },
    notification: { create: jest.fn(), findMany: jest.fn() },
    weatherCache: { findFirst: jest.fn() },
    journalEntry: { create: jest.fn(), delete: jest.fn(), findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}))

const mock = (fn: unknown) => fn as jest.Mock
const scoped = {
  OR: [
    { recipient_id: 'u1' },
    { recipient_id: null, htx_profile_id: 'htx-md2' },
    { recipient_id: null, htx_profile_id: null, type: 'SYSTEM', sender_id: null },
  ],
}

function signIn(htxCode: string | null) {
  mock(auth).mockResolvedValue({ user: { id: 'u1', role: 'officer', htxCode } })
}

beforeEach(() => {
  jest.clearAllMocks()
  mock(prisma.htxProfile.findUnique).mockImplementation(async ({ where }) =>
    where.htx_code === 'MD2' ? { id: 'htx-md2', name: 'HTX MD2' } : null
  )
  mock(prisma.notification.findMany).mockResolvedValue([])
  mock(prisma.notification.create).mockResolvedValue({ recipient_id: null })
  mock(prisma.$transaction).mockImplementation(async (run) => run(prisma))
})

const list = () => getNotifications(new Request('http://localhost/api/notifications?limit=5'), {})

describe('reading notifications', () => {
  test('the list holds the user rows and the broadcasts of the caller HTX only', async () => {
    signIn('MD2')
    expect((await list()).status).toBe(200)
    expect(mock(prisma.notification.findMany).mock.calls[0][0].where).toEqual(scoped)
  })

  test('the unread count comes from the scoped rows', async () => {
    signIn('MD2')
    mock(prisma.notification.findMany).mockResolvedValue([
      { id: 'n1', title: 't', body: 'b', type: 'SYSTEM', is_read: false, created_at: new Date() },
      { id: 'n2', title: 't', body: 'b', type: 'SYSTEM', is_read: true, created_at: new Date() },
    ])
    expect((await (await list()).json()).data.unreadCount).toBe(1)
  })

  test('a caller without an HTX gets 403 NO_HTX and no rows are read', async () => {
    signIn(null)
    const response = await list()
    expect(response.status).toBe(403)
    expect((await response.json()).error.code).toBe('NO_HTX')
    expect(prisma.notification.findMany).not.toHaveBeenCalled()
  })

  test('the stream re-reads only the rows the caller may see', async () => {
    signIn('MD2')
    const abort = new AbortController()
    const response = await stream(new Request('http://localhost/api/notifications/stream', { signal: abort.signal }), {})
    try {
      expect(response.status).toBe(200)
      sseEmitter.emit(SSE_EVENTS.NEW_NOTIFICATION, { broadcast: true })
      await new Promise((resolve) => setImmediate(resolve))
      expect(mock(prisma.notification.findMany).mock.calls[0][0].where).toEqual({ ...scoped, is_read: false })
    } finally {
      abort.abort()
    }
  })

  test('the stream refuses a caller without an HTX', async () => {
    signIn(null)
    const response = await stream(new Request('http://localhost/api/notifications/stream'), {})
    expect(response.status).toBe(403)
    expect(prisma.notification.findMany).not.toHaveBeenCalled()
  })
})

describe('which null-recipient rows a user can see', () => {
  type Row = { id: string; type: string; recipient_id: null; htx_profile_id: string | null; sender_id: string | null }
  type Where = { OR: Record<string, unknown>[] }
  const notice = (id: string, type: string, htx_profile_id: string | null, sender_id: string | null = null): Row => ({
    id,
    type,
    recipient_id: null,
    htx_profile_id,
    sender_id,
  })

  // Applies the real where clause, so these assert who sees a row rather than the shape of the query.
  function store(rows: Row[]) {
    mock(prisma.htxProfile.findUnique).mockImplementation(async ({ where }) => ({ id: `htx-${where.htx_code.toLowerCase()}`, name: 'x' }))
    mock(prisma.notification.findMany).mockImplementation(async ({ where }: { where: Where }) =>
      rows
        .filter((row) => where.OR.some((clause) => Object.entries(clause).every(([key, value]) => row[key as keyof Row] === value)))
        .map((row) => ({ ...row, title: 't', body: 'b', is_read: false, created_at: new Date() }))
    )
  }

  async function seenBy(htxCode: string) {
    signIn(htxCode)
    const { data } = await (await list()).json()
    return { ids: data.notifications.map((n: { id: string }) => n.id), unreadCount: data.unreadCount }
  }

  test('an n8n SYSTEM row with no HTX is visible to users of two different HTXs', async () => {
    store([notice('n8n', 'SYSTEM', null)])
    await expect(seenBy('MD2')).resolves.toEqual({ ids: ['n8n'], unreadCount: 1 })
    await expect(seenBy('LB')).resolves.toEqual({ ids: ['n8n'], unreadCount: 1 })
  })

  test('an old journal withdrawal, SYSTEM with a sender and no HTX, is visible to nobody', async () => {
    store([notice('old-withdrawal', 'SYSTEM', null, 'farmer-1')])
    await expect(seenBy('MD2')).resolves.toEqual({ ids: [], unreadCount: 0 })
    await expect(seenBy('LB')).resolves.toEqual({ ids: [], unreadCount: 0 })
  })

  test.each(['DISEASE_REPORT', 'HARVEST_APPROVED', 'JOURNAL_SUBMITTED', 'BROADCAST'])(
    'a %s row with neither recipient nor HTX is visible to nobody',
    async (type) => {
      store([notice('old', type, null)])
      await expect(seenBy('MD2')).resolves.toEqual({ ids: [], unreadCount: 0 })
      await expect(seenBy('LB')).resolves.toEqual({ ids: [], unreadCount: 0 })
    }
  )

  test('a SYSTEM broadcast of one HTX is visible only inside that HTX', async () => {
    store([notice('withdrawn', 'SYSTEM', 'htx-md2')])
    await expect(seenBy('MD2')).resolves.toEqual({ ids: ['withdrawn'], unreadCount: 1 })
    await expect(seenBy('LB')).resolves.toEqual({ ids: [], unreadCount: 0 })
  })
})

describe('writing broadcasts', () => {
  const repo = new PrismaNotificationRepository()
  const written = () => mock(prisma.notification.create).mock.calls[0][0].data

  test.each([
    ['disease report', () => repo.broadcastDiseaseReport('Hộ A', 'Rỉ sắt', 'P1')],
    ['harvest approval', () => repo.broadcastHarvestApproved('P1', 'officer-1')],
  ])('a %s broadcast belongs to the HTX of the parcel', async (_name, send) => {
    mock(prisma.parcel.findUnique).mockResolvedValue({ household: { htx_profile_id: 'htx-lb' } })
    await send()
    expect(prisma.parcel.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { parcel_code: 'P1' } }))
    expect(written()).toMatchObject({ recipient_id: null, htx_profile_id: 'htx-lb' })
  })

  test('a broadcast for a parcel without an HTX stays unowned', async () => {
    mock(prisma.parcel.findUnique).mockResolvedValue({ household: { htx_profile_id: null } })
    await repo.broadcastDiseaseReport('Hộ A', 'Rỉ sắt', 'P1')
    expect(written().htx_profile_id).toBeNull()
  })

  test('a farmer journal submission broadcasts to the HTX of the parcel', async () => {
    mock(prisma.journalEntry.create).mockResolvedValue({ id: 'j1', parcel: {}, activities: [] })
    mock(prisma.parcel.findUnique).mockResolvedValue({
      parcel_code: 'P1',
      household_id: 'h1',
      household: { htx_profile_id: 'htx-lb' },
    })
    await new PrismaJournalRepository().create({
      parcel_id: 'p1',
      entry_date: new Date('2026-11-09'),
      activity_type: 'OTHER',
      performed_by: 'A',
      submitted_by_id: 'u1',
      submitted_role: 'FARMER',
      activities: [],
    })
    expect(written()).toMatchObject({ type: 'JOURNAL_SUBMITTED', htx_profile_id: 'htx-lb' })
  })

  test('a withdrawn journal of a household without an HTX writes no SYSTEM row, which every HTX would see', async () => {
    mock(prisma.journalEntry.findUnique).mockResolvedValue({
      submitted_role: 'FARMER',
      status: 'PENDING_APPROVAL',
      activity_type: 'OTHER',
      submitted_by_id: 'u1',
      parcel: { parcel_code: 'P1', household_id: 'h1', household: { htx_profile_id: null } },
    })
    await new PrismaJournalRepository().delete('j1')
    expect(prisma.journalEntry.delete).toHaveBeenCalled()
    expect(prisma.notification.create).not.toHaveBeenCalled()
  })

  test('a withdrawn farmer journal broadcasts to the HTX of the parcel', async () => {
    mock(prisma.journalEntry.findUnique).mockResolvedValue({
      submitted_role: 'FARMER',
      status: 'PENDING_APPROVAL',
      activity_type: 'OTHER',
      submitted_by_id: 'u1',
      parcel: { parcel_code: 'P1', household_id: 'h1', household: { htx_profile_id: 'htx-lb' } },
    })
    await new PrismaJournalRepository().delete('j1')
    expect(written()).toMatchObject({ type: 'SYSTEM', htx_profile_id: 'htx-lb' })
  })
})
