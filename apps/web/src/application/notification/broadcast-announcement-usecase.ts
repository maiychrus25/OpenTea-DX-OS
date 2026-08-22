// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NotificationPort } from '@/domain/ports/notification-port';

export class BroadcastAnnouncementUseCase {
  constructor(private readonly notificationRepo: NotificationPort) {}

  async execute(title: string, body: string, senderId: string): Promise<void> {
    if (!title || title.trim() === '') {
      throw new Error('Title is required');
    }
    if (!body || body.trim() === '') {
      throw new Error('Body is required');
    }

    await this.notificationRepo.broadcastAnnouncement(title, body, senderId);
  }
}
