/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { auth } from '@/auth'
import { prisma } from '@/infrastructure/db/prisma.client'
import { GET as getNotifications, PUT as putNotifications } from '@/app/api/notifications/route'

jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/infrastructure/db/prisma.client', () => ({
  prisma: { htxProfile: { findUnique: jest.fn() }, notification: { findMany: jest.fn(), updateMany: jest.fn() }, htxMembership: { upsert: jest.fn() } },
}))

beforeEach(() => {
  jest.clearAllMocks()
  ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'acc-1', role: 'accountant', roles: ['accountant'], htxCode: 'TC' } })
  ;(prisma.htxProfile.findUnique as jest.Mock).mockResolvedValue({ id: 'htx-tc', name: 'TC' })
  ;(prisma.notification.findMany as jest.Mock).mockResolvedValue([])
})

describe('notifications for the accountant', () => {
  test('GET answers 200, scoped to the user and to the HTX', async () => {
    const response = await getNotifications(new Request('http://localhost/api/notifications?limit=5'), {})
    expect(response.status).toBe(200)
    expect((prisma.notification.findMany as jest.Mock).mock.calls[0][0].where).toEqual({
      OR: [
        { recipient_id: 'acc-1' },
        { recipient_id: null, htx_profile_id: 'htx-tc' },
        { recipient_id: null, htx_profile_id: null, type: 'SYSTEM', sender_id: null },
      ],
    })
  })

  test('mark-all-read is allowed for the accountant and acts on the user only', async () => {
    const response = await putNotifications(
      new Request('http://localhost/api/notifications', { method: 'PUT', body: JSON.stringify({ action: 'mark-all-read' }) }),
      {}
    )
    expect(response.status).toBe(200)
  })
})
