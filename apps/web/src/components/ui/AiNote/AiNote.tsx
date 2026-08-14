// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { Bot } from 'lucide-react'
import styles from './AiNote.module.css'

/**
 * AiNote — AI output disclaimer.
 * MANDATORY: Must be rendered whenever displaying AI-generated content,
 * chatbot responses, disease diagnosis results, or market analysis.
 * AI Invariant: AI does not make decisions for the cooperative.
 */
interface AiNoteProps {
  message?: string
}

export function AiNote({ message = 'AI tổng hợp dữ liệu, không đưa ra khuyến nghị sản xuất.' }: AiNoteProps) {
  return (
    <p className={styles.aiNote}>
      <Bot className={styles.icon} />
      <span>{message}</span>
    </p>
  )
}
