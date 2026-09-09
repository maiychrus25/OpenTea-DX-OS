// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { MarkNotificationReadUseCase } from '@/application/notification/mark-notification-read-usecase'
import { NotificationPort } from '@/domain/ports/notification-port'

describe('MarkNotificationReadUseCase', () => {
  let mockPort: jest.Mocked<NotificationPort>
  let useCase: MarkNotificationReadUseCase

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
    useCase = new MarkNotificationReadUseCase(mockPort)
  })

  it('calls port with id', async () => {
    await useCase.execute('user1', 'notif1')
    expect(mockPort.markAsRead).toHaveBeenCalledWith('user1', 'notif1')
  })

  it('calls port without id', async () => {
    await useCase.execute('user1')
    expect(mockPort.markAsRead).toHaveBeenCalledWith('user1', undefined)
  })
})
