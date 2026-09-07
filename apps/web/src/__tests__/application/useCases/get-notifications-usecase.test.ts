// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { GetNotificationsUseCase } from '@/application/notification/get-notifications-usecase'
import { NotificationPort } from '@/domain/ports/notification-port'
import { Notification } from '@/domain/entities/notification'

describe('GetNotificationsUseCase', () => {
  let mockPort: jest.Mocked<NotificationPort>
  let useCase: GetNotificationsUseCase

  beforeEach(() => {
    mockPort = {
      getRecentByUserId: jest.fn(),
      markAsRead: jest.fn(),
      broadcastDiseaseReport: jest.fn(),
      delete: jest.fn(),
      updatePreferences: jest.fn(),
      broadcastAnnouncement: jest.fn(),
      broadcastHarvestApproved: jest.fn(),
      createNotification: jest.fn(),
      sendDirectNotification: jest.fn(),
    }
    useCase = new GetNotificationsUseCase(mockPort)
  })

  it('maps raw notification correctly', async () => {
    const rawNotif: Notification = {
      id: '1',
      recipient_id: 'user1',
      household_id: null,
      sender_id: null,
      title: 'Hello',
      body: 'World',
      type: 'MARKET_ALERT',
      deep_link_url: '/url',
      tts_text: null,
      is_read: false,
      created_at: new Date('2026-08-15T00:00:00.000Z')
    }

    mockPort.getRecentByUserId.mockResolvedValue([rawNotif])

    const result = await useCase.execute('user1', 5)
    
    expect(result.notifications).toHaveLength(1)
    expect(result.notifications[0]).toEqual({
      id: '1',
      title: 'Hello',
      detail: 'World',
      tone: 'amber', // MARKET_ALERT maps to amber
      created_at: '2026-08-15T00:00:00.000Z',
      read: false,
      link_url: '/url'
    })
    expect(result.unreadCount).toBe(1)
  })
})
