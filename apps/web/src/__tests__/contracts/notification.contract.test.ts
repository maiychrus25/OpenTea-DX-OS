// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { PrismaNotificationRepository } from '@/infrastructure/db/notification/prisma-notification-repository'
import { prisma } from '@/infrastructure/db/prisma.client'

// Contract test for n8n-produced bulletin/notification records
// Epic 10.2: Ensure Next.js app doesn't act as a duplicate writer for background jobs
describe('Notification Contract Tests', () => {
  let notificationRepo: PrismaNotificationRepository

  beforeAll(() => {
    notificationRepo = new PrismaNotificationRepository()
  })

  it('should not contain background worker methods (n8n responsibility)', () => {
    const repoMethods = Object.getOwnPropertyNames(PrismaNotificationRepository.prototype)

    // Ensure the application does not have methods to poll external weather/bulletin services
    // and write them to DB, as this is n8n's responsibility.
    expect(repoMethods).not.toContain('fetchAndSaveBulletins')
    expect(repoMethods).not.toContain('pollMarketPrices')
    
    // Application only broadcasts its own domain events (e.g. disease report)
    expect(repoMethods).toContain('broadcastDiseaseReport')
  })

  it('should query both targeted and broadcast notifications correctly', async () => {
    // This is a contract test on the query structure, since we mock Prisma in unit tests
    // In actual E2E we'd test the DB, here we verify the repository logic shape.
    
    // Mock prisma findMany
    const mockFindMany = jest.fn().mockResolvedValue([])
    ;(prisma.notification.findMany as jest.Mock) = mockFindMany

    await notificationRepo.getRecentByUserId('user123', 5, 'unread')

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { recipient_id: 'user123' },
          { recipient_id: null }
        ],
        is_read: false
      },
      orderBy: { created_at: 'desc' },
      take: 5
    })
  })
})
