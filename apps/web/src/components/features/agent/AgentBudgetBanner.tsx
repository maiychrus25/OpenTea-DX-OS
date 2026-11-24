// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import type { BudgetLevel } from '@/domain/agent/budget'
import styles from './AgentBudgetBanner.module.css'

interface AgentBudgetBannerProps {
  level: BudgetLevel
}

/** Shown above the proposal inbox once the cooperative's AI budget passes 80% or 100% of the month. */
export function AgentBudgetBanner({ level }: AgentBudgetBannerProps) {
  if (level !== 'warn' && level !== 'exhausted') return null
  const message = level === 'exhausted'
    ? 'Ngân sách AI tháng này đã hết. Agent dùng Ollama đến hết tháng.'
    : 'Ngân sách AI tháng này đã qua 80%. Khi chạm 100%, agent sẽ dùng Ollama đến hết tháng.'
  return (
    <div role="status" className={styles.banner}>
      {message}
    </div>
  )
}
