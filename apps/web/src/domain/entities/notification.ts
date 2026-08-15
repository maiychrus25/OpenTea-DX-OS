// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

export type NotificationTone = 'green' | 'amber' | 'blue' | 'neutral'

export interface Notification {
  id: string
  user_id: string
  title: string
  detail: string
  link_url: string | null
  tone: NotificationTone
  read: boolean
  created_at: Date
  deleted_at: Date | null
}
