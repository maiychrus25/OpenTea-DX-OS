// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { AiNote } from '@/components/ui/AiNote'
import { BulletinCard } from '@/components/features/bulletin/BulletinCard'
import { MOCK_BULLETINS } from '@/components/features/bulletin/mock-data'
import styles from '@/components/features/bulletin/bulletin.module.css'

export const dynamic = 'force-dynamic'

export default function ManagerBulletinPage() {
  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div className={styles.headerContent}>
          <p className={styles.eyebrow}>BẢN TIN NÔNG NGHIỆP SỐ</p>
          <h1 className={styles.pageTitle}>Thông tin có nguồn, dễ hiểu</h1>
          <p className={styles.pageSubtitle}>Cập nhật thị trường, thời tiết và kỹ thuật liên quan vùng trồng HTX.</p>
        </div>
        <div className={styles.headerActions}>
          <Button variant="secondary" className={styles.audioButton}>
            <Volume2 size={18} />
            Nghe bản tin sáng
          </Button>
        </div>
      </div>

      <div className={styles.newsGrid}>
        {MOCK_BULLETINS.map(b => (
          <BulletinCard
            key={b.id}
            category={b.category}
            headline={b.headline}
            summary={b.summary}
            date={b.date}
            sourceCount={b.sourceCount}
          />
        ))}
      </div>

      <div className={styles.footerNote}>
        <AiNote message="Nội dung do AI tổng hợp từ nguồn được duyệt, không phải khuyến nghị sản xuất hoặc đầu tư." />
      </div>
    </div>
  )
}
