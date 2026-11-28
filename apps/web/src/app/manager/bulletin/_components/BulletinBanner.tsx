// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useState } from 'react'
import { ArrowRight, Plus } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { WeatherHero } from '@/components/features/farmer-web/WeatherHero'
import { WeatherSection } from '@/components/features/bulletin/WeatherSection'
import { ListenBulletinButton } from '@/components/features/bulletin/ListenBulletinButton'
import { Sample } from '@/components/features/manager-web/parts'
import kit from '@/components/features/dashboard/page-kit.module.css'
import styles from './bulletin.module.css'

/** The page's title over the weather of the growing area; the full forecast opens on request. */
export function BulletinBanner({ bulletinTexts }: { bulletinTexts: string[] }) {
  const [forecast, setForecast] = useState(false)
  return (
    <>
      <WeatherHero
        eyebrow="Thời tiết vùng trồng"
        title="Bản tin"
        subtitle="Cập nhật tin tức, hoạt động, sự kiện và thông báo của HTX."
        actions={[]}
        place=""
        cached={null}
        forecastControl={
          <button type="button" className={styles.forecast} onClick={() => setForecast(true)}>
            Xem dự báo <ArrowRight size={15} aria-hidden="true" />
          </button>
        }
      >
        <ListenBulletinButton bulletinTexts={bulletinTexts} />
        <button type="button" className={kit.secondary} disabled title="Chưa có chức năng viết bài"><Plus size={16} aria-hidden="true" />Viết bài mới <Sample /></button>
      </WeatherHero>
      <Modal isOpen={forecast} onClose={() => setForecast(false)} title="Dự báo thời tiết" size="lg">
        <WeatherSection />
      </Modal>
    </>
  )
}
