// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { prisma } from '../prisma.client';
import { NotificationPort } from '@/domain/ports/notification-port';
import { Notification } from '@/domain/entities/notification';

export class PrismaNotificationRepository implements NotificationPort {
  async getRecentByUserId(userId: string, limit: number): Promise<Notification[]> {
    return await prisma.notification.findMany({
      where: { recipient_id: userId },
      orderBy: { created_at: 'desc' },
      take: limit,
    });
  }

  async markAsRead(userId: string, id?: string): Promise<void> {
    if (id) {
      await prisma.notification.updateMany({
        where: { id, recipient_id: userId },
        data: { is_read: true },
      });
    } else {
      await prisma.notification.updateMany({
        where: { recipient_id: userId, is_read: false },
        data: { is_read: true },
      });
    }
  }
}
