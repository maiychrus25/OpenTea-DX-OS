// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

export interface Notification {
  id: string
  title: string
  body: string
  type: string
  is_read: boolean
  recipient_id: string | null
  household_id: string | null
  sender_id: string | null
  deep_link_url: string | null
  tts_text: string | null
  created_at: Date
}
