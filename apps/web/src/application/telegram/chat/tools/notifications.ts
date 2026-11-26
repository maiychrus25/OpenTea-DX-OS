// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { GetNotificationsUseCase } from '@/application/notification/get-notifications-usecase'
import { PrismaNotificationRepository } from '@/infrastructure/db/notification/prisma-notification-repository'
import type { ChatTool } from '../types'
import { reply } from './common'

/** Routes: `GET /api/notifications` with the route's default limit of five. */
export const notificationsTool: ChatTool = {
  name: 'notifications',
  titleVi: 'Thông báo',
  roles: ['farmer', 'officer', 'manager'],
  routes: ['GET /api/notifications'],
  args: [],
  async run(user) {
    const { notifications, unreadCount } = await new GetNotificationsUseCase(new PrismaNotificationRepository()).execute(
      user.tenant.userId,
      user.tenant.htxProfileId,
      5
    )
    if (!notifications.length) return reply('Thông báo', [])
    return reply('Thông báo', [`Chưa đọc: ${unreadCount}`, ...notifications.map((n) => `• ${n.title}: ${n.detail}`)])
  },
}
