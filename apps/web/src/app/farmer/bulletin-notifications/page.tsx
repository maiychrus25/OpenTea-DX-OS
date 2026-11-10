// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState } from 'react'
import { NotificationInbox } from '@/components/features/notification/NotificationInbox'
import { BulletinCard } from '@/components/features/bulletin/BulletinCard'
import { MOCK_BULLETINS } from '@/components/features/bulletin/mock-data'
import { Bell, Newspaper } from 'lucide-react'

export default function FarmerBulletinNotificationsPage() {
  const [activeTab, setActiveTab] = useState<'bulletin' | 'notifications'>('bulletin')

  return (
    <div className="max-w-[1000px] mx-auto p-6">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-foreground mb-2">Bản tin & Thông báo</h1>
        <p className="text-sm text-ink-tertiary">Cập nhật thông tin thị trường và thông báo cá nhân của bạn</p>
      </header>

      <div className="flex flex-col">
        <div className="flex gap-4 border-b border-border-subtle mb-6">
          <button
            className={`flex items-center justify-center sm:justify-start gap-2 px-6 py-3 text-base font-medium transition-colors border-b-2 flex-1 sm:flex-none ${
              activeTab === 'bulletin'
                ? 'text-success border-primary'
                : 'text-ink-tertiary border-transparent hover:text-foreground hover:bg-surface-sunken'
            }`}
            onClick={() => setActiveTab('bulletin')}
          >
            <Newspaper size={18} />
            Bản tin
          </button>
          <button
            className={`flex items-center justify-center sm:justify-start gap-2 px-6 py-3 text-base font-medium transition-colors border-b-2 flex-1 sm:flex-none ${
              activeTab === 'notifications'
                ? 'text-success border-primary'
                : 'text-ink-tertiary border-transparent hover:text-foreground hover:bg-surface-sunken'
            }`}
            onClick={() => setActiveTab('notifications')}
          >
            <Bell size={18} />
            Thông báo
          </button>
        </div>

        <div className="min-h-[400px]">
          {activeTab === 'bulletin' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {MOCK_BULLETINS.map(bulletin => (
                <BulletinCard
                  key={bulletin.id}
                  category={bulletin.category}
                  headline={bulletin.headline}
                  summary={bulletin.summary}
                  date={bulletin.date}
                  sourceCount={bulletin.sourceCount}
                />
              ))}
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="-m-6">
              <NotificationInbox role="farmer" showPageHeader={false} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
