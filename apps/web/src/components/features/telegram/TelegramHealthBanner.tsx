// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import styles from './TelegramLinkCard.module.css'

interface TelegramHealthBannerProps {
  agentStale: boolean
  telegramStale: boolean
}

/** Shown above the proposal inbox when the agent or the Telegram relay has stopped checking in. */
export function TelegramHealthBanner({ agentStale, telegramStale }: TelegramHealthBannerProps) {
  if (!agentStale && !telegramStale) return null
  const message = agentStale
    ? 'Agent AI đang không phản hồi, đề xuất mới có thể đến chậm.'
    : 'Dịch vụ Telegram đang không phản hồi, tin nhắn Telegram có thể đến chậm.'
  return (
    <div role="status" className={styles.banner}>
      {message}
    </div>
  )
}
