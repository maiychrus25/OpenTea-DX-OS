// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { prisma } from '../prisma.client';
import { NotificationPort } from '@/domain/ports/notification-port';
import { Notification } from '@/domain/entities/notification';
import { NotificationType } from '@prisma/client';

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

  async broadcastDiseaseReport(householdName: string, diseaseName: string, parcelCode: string): Promise<void> {
    await prisma.notification.create({
      data: {
        type: NotificationType.DISEASE_REPORT,
        title: 'Báo cáo sâu bệnh mới',
        body: `Nông hộ ${householdName} vừa báo cáo bệnh ${diseaseName} tại thửa đất ${parcelCode}.`,
        recipient_id: null,
      },
    });
  }
}
