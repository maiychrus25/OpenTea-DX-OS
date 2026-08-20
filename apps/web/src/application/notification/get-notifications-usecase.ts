// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NotificationPort } from '@/domain/ports/notification-port';

export interface NotificationDTO {
  id: string;
  title: string;
  detail: string;
  tone: 'green' | 'amber' | 'blue' | 'neutral';
  created_at: string;
  read: boolean;
  link_url?: string | null;
}

export class GetNotificationsUseCase {
  constructor(private readonly notificationPort: NotificationPort) {}

  private getTone(type: string): 'green' | 'amber' | 'blue' | 'neutral' {
    switch (type) {
      case 'HARVEST_APPROVED':
      case 'JOURNAL_APPROVED':
        return 'green';
      case 'DISEASE_REPORT':
      case 'JOURNAL_SUBMITTED':
      case 'MARKET_ALERT':
        return 'amber';
      case 'ANNOUNCEMENT':
      case 'SYSTEM':
      case 'BROADCAST':
        return 'blue';
      default:
        return 'neutral';
    }
  }

  async execute(userId: string, limit: number, filter?: string): Promise<{ notifications: NotificationDTO[], unreadCount: number }> {
    const rawNotifications = await this.notificationPort.getRecentByUserId(userId, limit, filter);
    const notifications = rawNotifications.map((n) => ({
      id: n.id,
      title: n.title,
      detail: n.body,
      tone: this.getTone(n.type),
      created_at: n.created_at.toISOString(),
      read: n.is_read,
      link_url: n.deep_link_url,
    }));
    
    // For contract compliance, mock unreadCount based on the first few notifications
    const unreadCount = notifications.filter(n => !n.read).length;
    
    return { notifications, unreadCount };
  }
}
