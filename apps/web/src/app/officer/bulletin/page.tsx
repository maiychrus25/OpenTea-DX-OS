// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import Link from 'next/link'
import { AiNote } from '@/components/ui/AiNote'
import { BulletinCard } from '@/components/features/bulletin/BulletinCard'
import { ListenBulletinButton } from '@/components/features/bulletin/ListenBulletinButton'
import { MOCK_BULLETINS } from '@/components/features/bulletin/mock-data'
import { prisma } from '@/infrastructure/db/prisma.client'
import { ArrowRight, ChevronUp } from 'lucide-react'
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

interface OfficerBulletinPageProps {
  searchParams?: {
    view?: string
    category?: string
  }
}

export default async function OfficerBulletinPage({ searchParams }: OfficerBulletinPageProps) {
  const isViewAll = searchParams?.view === 'all'
  const selectedCategory = searchParams?.category || 'all'

  // Load bulletins from DB
  const dbBulletins = await prisma.bulletin.findMany({
    orderBy: { created_at: 'desc' },
    take: isViewAll ? 50 : 10,
  })

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

  const rawBulletins = realBulletins.length > 0 ? realBulletins : MOCK_BULLETINS

  // Filter by category if selected
  const bulletins = selectedCategory === 'all' 
    ? rawBulletins 
    : rawBulletins.filter(b => b.category === selectedCategory)

  const makeCategoryUrl = (cat: string) => {
    const params = new URLSearchParams()
    if (isViewAll) params.set('view', 'all')
    if (cat !== 'all') params.set('category', cat)
    const qs = params.toString()
    return qs ? `/officer/bulletin?${qs}` : '/officer/bulletin'
  }

  const toggleViewAllUrl = (() => {
    const params = new URLSearchParams()
    if (!isViewAll) params.set('view', 'all')
    if (selectedCategory !== 'all') params.set('category', selectedCategory)
    const qs = params.toString()
    return qs ? `/officer/bulletin?${qs}` : '/officer/bulletin'
  })()

  return (
    <div className={styles.pageContainer}>
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

      {/* Bulletins Section Header */}
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>
          {isViewAll ? 'Tất cả bản tin' : 'Bản tin gần đây'}
        </h2>
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground text-[0.85rem]">
            {bulletins.length} bản tin
          </span>
          <Link
            href={toggleViewAllUrl}
            className={styles.sectionAction}
            aria-label={isViewAll ? 'Thu gọn danh sách bản tin' : 'Xem tất cả bản tin'}
          >
            {isViewAll ? (
              <>
                Thu gọn <ChevronUp size={14} className="inline ml-1 align-text-bottom" aria-hidden="true" />
              </>
            ) : (
              <>
                Xem tất cả <ArrowRight size={14} className="inline ml-1 align-text-bottom" aria-hidden="true" />
              </>
            )}
          </Link>
        </div>
      </div>

      {/* Category Filter Tabs */}
      <div className={styles.filterBar}>
        <Link
          href={makeCategoryUrl('all')}
          className={`${styles.filterTab} ${selectedCategory === 'all' ? styles.filterTabActive : ''}`}
        >
          Tất cả
        </Link>
        <Link
          href={makeCategoryUrl('market')}
          className={`${styles.filterTab} ${selectedCategory === 'market' ? styles.filterTabActive : ''}`}
        >
          Thị trường
        </Link>
        <Link
          href={makeCategoryUrl('weather')}
          className={`${styles.filterTab} ${selectedCategory === 'weather' ? styles.filterTabActive : ''}`}
        >
          Thời tiết
        </Link>
        <Link
          href={makeCategoryUrl('technical')}
          className={`${styles.filterTab} ${selectedCategory === 'technical' ? styles.filterTabActive : ''}`}
        >
          Kỹ thuật
        </Link>
      </div>

      {/* Bulletins Grid or Empty Notice */}
      {bulletins.length === 0 ? (
        <div className={styles.emptyNotice}>
          Không có bản tin nào trong danh mục này.
        </div>
      ) : (
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
      )}

      <div className={styles.footerNote}>
        <AiNote message="Nội dung do AI tổng hợp từ nguồn được duyệt, không phải khuyến nghị sản xuất hoặc đầu tư." />
      </div>
    </div>
  )
}
