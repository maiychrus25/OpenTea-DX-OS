// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { AiNote } from '@/components/ui/AiNote'
import { BulletinCard } from '@/components/features/bulletin/BulletinCard'
import { WeatherSection } from '@/components/features/bulletin/WeatherSection'
import { ListenBulletinButton } from '@/components/features/bulletin/ListenBulletinButton'
import { MOCK_BULLETINS } from '@/components/features/bulletin/mock-data'
import { prisma } from '@/infrastructure/db/prisma.client'
import styles from '@/components/features/bulletin/bulletin.module.css'

export const dynamic = 'force-dynamic'

function timeAgo(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 1) return 'Vừa xong'
  if (hours < 24) return `${hours} giờ trước`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Hôm qua'
  return `${days} ngày trước`
}

export default async function ManagerBulletinPage() {
  // Try to load real bulletins from DB
  const dbBulletins = await prisma.bulletin.findMany({
    orderBy: { created_at: 'desc' },
    take: 10,
  })

  // Map DB bulletins to the BulletinCard format
  const realBulletins = dbBulletins.map((b) => {
    const sourcesArr = Array.isArray(b.sources_json) ? b.sources_json : []
    return {
      id: b.id,
      category: 'market' as const,
      headline: b.commodity,
      summary: b.bulletin_vi,
      date: timeAgo(b.created_at),
      sourceCount: sourcesArr.length || 1,
    }
  })

  // Use real data if available, fallback to mock
  const bulletins = realBulletins.length > 0 ? realBulletins : MOCK_BULLETINS

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
            bulletinTexts={bulletins.map(b => `${b.headline}. ${b.summary}`)}
          />
        </div>
      </div>

      {/* Weather — Real data from Open-Meteo */}
      <WeatherSection />

      {/* Bulletins Grid */}
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Bản tin gần đây</h2>
        {realBulletins.length > 0 && (
          <span className={styles.sectionAction} style={{ color: 'var(--muted-foreground)', fontSize: '0.85rem' }}>
            {realBulletins.length} bản tin từ AI
          </span>
        )}
      </div>

      <div className={styles.newsGrid}>
        {bulletins.map(b => (
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
