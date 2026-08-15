// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

export interface Notification {
  id: string
  user_id: string
  title: string
  body: string
  deep_link_url: string | null
  type: string
  is_read: boolean
  created_at: Date
  deleted_at: Date | null
}
