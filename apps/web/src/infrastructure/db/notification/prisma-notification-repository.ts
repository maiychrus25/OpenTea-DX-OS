// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { prisma } from '../prisma.client';
import { NotificationPort } from '@/domain/ports/notification-port';
import { Notification } from '@/domain/entities/notification';
import { NotificationType } from '@prisma/client';
import { sseEmitter, SSE_EVENTS } from '@/lib/sse-emitter';

export class PrismaNotificationRepository implements NotificationPort {
  async getRecentByUserId(userId: string, htxProfileId: string, limit: number, filter?: string): Promise<Notification[]> {
    return await prisma.notification.findMany({
      where: {
        OR: [
          { recipient_id: userId },
          { recipient_id: null, htx_profile_id: htxProfileId }, // Broadcast trong HTX của người gọi
        ],
        ...(filter === 'unread' ? { is_read: false } : filter ? { type: filter as any } : {}),
      },
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

  async createNotification(data: Omit<Notification, 'id' | 'created_at' | 'is_read'>): Promise<Notification> {
    return await prisma.notification.create({
      data: {
        recipient_id: data.recipient_id,
        type: data.type as any,
        title: data.title,
        body: data.body,
        deep_link_url: data.deep_link_url,
      }
    });
  }

  private async htxProfileIdOfParcel(parcelCode: string): Promise<string | null> {
    const parcel = await prisma.parcel.findUnique({
      where: { parcel_code: parcelCode },
      select: { household: { select: { htx_profile_id: true } } },
    });
    return parcel?.household.htx_profile_id ?? null;
  }

  async broadcastDiseaseReport(householdName: string, diseaseName: string, parcelCode: string): Promise<void> {
    const htxProfileId = await this.htxProfileIdOfParcel(parcelCode);
    await prisma.notification.create({
      data: {
        type: NotificationType.DISEASE_REPORT,
        title: 'Báo cáo sâu bệnh mới',
        body: `Nông hộ ${householdName} vừa báo cáo bệnh ${diseaseName} tại thửa đất ${parcelCode}.`,
        recipient_id: null,
        htx_profile_id: htxProfileId,
      },
    });
  }

  async broadcastHarvestApproved(parcelCode: string, officerId: string): Promise<void> {
    const htxProfileId = await this.htxProfileIdOfParcel(parcelCode);
    await prisma.notification.create({
      data: {
        type: NotificationType.HARVEST_APPROVED,
        title: 'Thu hoạch được duyệt',
        body: `Thửa đất ${parcelCode} đã được duyệt thu hoạch bởi cán bộ.`,
        recipient_id: null,
        htx_profile_id: htxProfileId,
        deep_link_url: `/officer/farm-zones?parcel=${parcelCode}`,
      },
    });
    void officerId;
  }

  async sendDirectNotification(recipientId: string, type: string, title: string, body: string, referenceId?: string): Promise<void> {
    const notif = await prisma.notification.create({
      data: {
        type: type as any,
        title,
        body,
        recipient_id: recipientId,
        deep_link_url: referenceId ? `/officer/disease-reports/${referenceId}` : undefined,
      },
    });
    if (notif.recipient_id) {
      sseEmitter.emit(SSE_EVENTS.NEW_NOTIFICATION, { userId: notif.recipient_id });
    } else {
      sseEmitter.emit(SSE_EVENTS.NEW_NOTIFICATION, { broadcast: true });
    }
  }

  async broadcastAnnouncement(title: string, body: string, senderId: string, recipientIds: string[]): Promise<void> {
    // One row per recipient: a null recipient_id would reach every HTX.
    await prisma.notification.createMany({
      data: recipientIds.map((recipient_id) => ({
        type: NotificationType.BROADCAST,
        title,
        body,
        recipient_id,
        deep_link_url: `/manager/announcements`,
      })),
    });
    void senderId;
  }

  async updatePreferences(userId: string, preferences?: Record<string, unknown>): Promise<void> {
    // Notification preferences — MVP placeholder
    void userId;
    void preferences;
  }

  async delete(userId: string, id: string): Promise<void> {
    await prisma.notification.deleteMany({
      where: { id, recipient_id: userId },
    });
  }
}
