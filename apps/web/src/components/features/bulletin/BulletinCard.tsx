// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { CheckCircle2, Volume2 } from 'lucide-react'
import { Pill } from '@/components/ui/Pill'
import styles from './bulletin.module.css'

export type BulletinCategory = 'market' | 'weather' | 'technical'

export interface BulletinCardProps {
  category: BulletinCategory
  headline: string
  summary: string
  date: string
  sourceCount: number
}

const CATEGORY_MAP: Record<BulletinCategory, { label: string, tone: 'green' | 'amber' | 'blue' | 'neutral' }> = {
  market: { label: 'Thị trường', tone: 'green' },
  weather: { label: 'Thời tiết', tone: 'blue' },
  technical: { label: 'Kỹ thuật', tone: 'amber' },
}

export function BulletinCard({ category, headline, summary, date, sourceCount }: BulletinCardProps) {
  const meta = CATEGORY_MAP[category]

  return (
    <article className={styles.newsArticle}>
      <div className={styles.articleHeader}>
        <Pill tone={meta.tone}>{meta.label}</Pill>
      </div>
      
      <h2 className={styles.articleTitle}>{headline}</h2>
      <p className={styles.articleSummary}>{summary}</p>
      
      <div className={styles.sourceRow}>
        <CheckCircle2 size={16} />
        <span>{sourceCount} nguồn đã kiểm chứng</span>
      </div>
      
      <div className={styles.articleMeta}>
        <span>{date}</span>
        <button className={styles.audioBtn} aria-label="Nghe bản tin" type="button">
          <Volume2 size={18} />
        </button>
      </div>
    </article>
  )
}
