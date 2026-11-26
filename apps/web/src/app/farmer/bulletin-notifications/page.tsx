// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import { PageHeader } from '@/components/ui/PageHeader'
import kit from '@/components/features/farmer-web/kit.module.css'
import { LatestNotices } from '@/components/features/farmer-web/LatestNotices'
import styles from './page.module.css'
import React, { useState } from 'react'
import { NotificationInbox } from '@/components/features/notification/NotificationInbox'
import { WeatherSection } from '@/components/features/bulletin/WeatherSection'
import { MOCK_BULLETINS } from '@/components/features/bulletin/mock-data'
import { Bell, FileText, Newspaper } from 'lucide-react'

const CATEGORY: Record<string, { label: string; tone: string }> = {
  market: { label: 'Thị trường', tone: 'in' },
  weather: { label: 'Thời tiết', tone: 'amber' },
  technical: { label: 'Kỹ thuật', tone: 'soft' },
}

export default function FarmerBulletinNotificationsPage() {
  const [activeTab, setActiveTab] = useState<'bulletin' | 'notifications'>('bulletin')

  return (
    <div className={kit.page}>
      <PageHeader
        icon={<Bell size={28} />}
        title="Bản tin & Thông báo"
        description="Thông tin thị trường, kỹ thuật từ HTX và thông báo của riêng bạn"
      />

      <div className={styles.tabs}>
        <button type="button" className={styles.tab} aria-pressed={activeTab === 'bulletin'} onClick={() => setActiveTab('bulletin')}>
          <Newspaper size={18} aria-hidden="true" />
          Bản tin
        </button>
        <button type="button" className={styles.tab} aria-pressed={activeTab === 'notifications'} onClick={() => setActiveTab('notifications')}>
          <Bell size={18} aria-hidden="true" />
          Thông báo
        </button>
      </div>

      {activeTab === 'bulletin' ? (
        <>
          <div className={kit.cols}>
            <div className={styles.articles}>
              {MOCK_BULLETINS.map(bulletin => {
                const category = CATEGORY[bulletin.category] ?? { label: bulletin.category, tone: 'mu' }
                return (
                  <article key={bulletin.id} className={`${kit.pn} ${styles.article}`}>
                    <span className={`${kit.tag} ${kit[category.tone]}`}>{category.label}</span>
                    <h2>{bulletin.headline}</h2>
                    <p>{bulletin.summary}</p>
                    <footer>
                      <span className={kit.grow}>{bulletin.date}</span>
                      <span><FileText size={13} aria-hidden="true" /> {bulletin.sourceCount} nguồn</span>
                    </footer>
                  </article>
                )
              })}
            </div>
            <LatestNotices onShowAll={() => setActiveTab('notifications')} />
          </div>
          <WeatherSection />
        </>
      ) : (
        <NotificationInbox role="farmer" showPageHeader={false} />
      )}
    </div>
  )
}
