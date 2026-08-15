// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NotificationPort } from '@/domain/ports/notification-port';

export class MarkNotificationReadUseCase {
  constructor(private readonly notificationPort: NotificationPort) {}

  async execute(userId: string, id?: string): Promise<void> {
    await this.notificationPort.markAsRead(userId, id);
  }
}
