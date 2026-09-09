// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { Notification } from '../entities/notification';

export interface NotificationPort {
  getRecentByUserId(userId: string, limit: number, filter?: string): Promise<Notification[]>;
  markAsRead(userId: string, id?: string): Promise<void>;
  createNotification(data: Omit<Notification, 'id' | 'created_at' | 'is_read'>): Promise<Notification>;
  broadcastDiseaseReport(householdName: string, diseaseName: string, parcelCode: string): Promise<void>;
  broadcastHarvestApproved(parcelCode: string, officerId: string): Promise<void>;
  sendDirectNotification(recipientId: string, type: string, title: string, body: string, referenceId?: string): Promise<void>;
  broadcastAnnouncement(title: string, body: string, senderId: string): Promise<void>;
  updatePreferences(userId: string, preferences?: Record<string, unknown>): Promise<void>;
  delete(userId: string, id: string): Promise<void>;
}
