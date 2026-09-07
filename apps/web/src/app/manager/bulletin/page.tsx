// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { AiNote } from '@/components/ui/AiNote'
import { BulletinCard } from '@/components/features/bulletin/BulletinCard'
import { WeatherSection } from '@/components/features/bulletin/WeatherSection'
import { ListenBulletinButton } from '@/components/features/bulletin/ListenBulletinButton'
import { MOCK_BULLETINS } from '@/components/features/bulletin/mock-data'
import { ArrowRight } from 'lucide-react'
import styles from '@/components/features/bulletin/bulletin.module.css'

export const dynamic = 'force-dynamic'

export default function ManagerBulletinPage() {
  return (
    <div className={styles.pageContainer}>
      {/* Hero Header */}
      <div className={styles.pageHeader}>
        <div className={styles.headerContent}>
          <p className={styles.eyebrow}>BẢN TIN NÔNG NGHIỆP SỐ</p>
          <h1 className={styles.pageTitle}>Thông tin có nguồn, dễ hiểu</h1>
          <p className={styles.pageSubtitle}>Cập nhật thị trường, thời tiết và kỹ thuật liên quan vùng trồng HTX.</p>
        </div>
        <div className={styles.headerActions}>
          <ListenBulletinButton
            bulletinTexts={MOCK_BULLETINS.map(b => `${b.headline}. ${b.summary}`)}
          />
        </div>
      </div>

      {/* Weather — Real data from Open-Meteo */}
      <WeatherSection />

      {/* Bulletins Grid */}
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Bản tin gần đây</h2>
        <span className={styles.sectionAction}>
          Xem tất cả <ArrowRight size={14} className="inline ml-1 align-text-bottom" />
        </span>
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
