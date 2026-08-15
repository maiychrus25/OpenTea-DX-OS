// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { Notification } from '../entities/notification';

export interface NotificationPort {
  getRecentByUserId(userId: string, limit: number): Promise<Notification[]>;
  markAsRead(userId: string, id?: string): Promise<void>;
}
