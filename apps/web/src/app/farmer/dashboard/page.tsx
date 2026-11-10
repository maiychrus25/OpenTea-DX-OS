// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Cloud, Droplets } from 'lucide-react'

import { prisma } from '@/infrastructure/db/prisma.client'
import { auth } from '@/auth'
import { requireTenant } from '@/lib/api/tenant'
import { Pill } from '@/components/ui'
import { activeWithdrawals } from '@/domain/journal/active-withdrawals'

import styles from './farmer-dashboard.module.css'

function getGreeting(): string {
  const now = new Date()
  const vnTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }))
  const hour = vnTime.getHours()
  if (hour < 12) return 'Chào buổi sáng'
  if (hour < 18) return 'Chào buổi chiều'
  return 'Chào buổi tối'
}

function getParcelStatusColor(status: string): 'blue' | 'green' | 'amber' | 'neutral' {
  switch (status) {
    case 'SOWING':
      return 'blue'
    case 'TENDING':
      return 'green'
    case 'HARVEST_APPROVED':
      return 'amber'
    case 'HARVESTED':
      return 'neutral'
    default:
      return 'neutral'
  }
}

function getParcelStatusLabel(status: string) {
  switch (status) {
    case 'SOWING':
      return 'Xuống giống'
    case 'TENDING':
      return 'Đang chăm sóc'
    case 'HARVEST_APPROVED':
      return 'Được phép thu hoạch'
    case 'HARVESTED':
      return 'Đã thu hoạch'
    default:
      return 'Bản nháp'
  }
}

export default async function FarmerDashboard() {
  const session = await auth()
  if (!session || session.user?.role !== 'farmer') {
    redirect('/login')
  }

  const { userId, htxProfileId } = await requireTenant()

  const household = await prisma.household.findFirst({
    where: { keycloak_user_id: userId },
    include: {
      parcels: {
        orderBy: { created_at: 'desc' }
      }
    }
  })

  // Rejected entries are left out, as when a lot is created; pending ones still warn the farmer.
  const now = new Date()
  const withdrawals = household
    ? activeWithdrawals(
        (await prisma.journalActivity.findMany({
          where: {
            safe_harvest_date: { gt: now },
            journal_entry: { status: { not: 'REJECTED' }, parcel: { household: { id: household.id, htx_profile_id: htxProfileId } } },
          },
          select: { safe_harvest_date: true, journal_entry: { select: { parcel: { select: { parcel_code: true } } } } },
        })).map((a) => ({ parcel_code: a.journal_entry.parcel.parcel_code, safe_harvest_date: a.safe_harvest_date! })),
        now,
      )
    : []

  let weather = null
  if (household && household.parcels.length > 0) {
    weather = await prisma.weatherCache.findFirst({
      where: { parcel: { household_id: household.id } },
      orderBy: { recorded_at: 'desc' }
    })
  }

  return (
    <main className={styles.container}>
      <header className={styles.farmerHero}>
        <h1 className={styles.greeting}>
          {getGreeting()}, {session.user.name || 'Nông dân'}
        </h1>
        <p className={styles.subGreeting}>Chúc bạn một ngày làm việc hiệu quả!</p>
        
        <div className={styles.ctaRow}>
          <Link href="/farmer/journal/new" className={styles.ctaButton}>
            Ghi nhật ký mới
          </Link>
          <Link href="/farmer/journal" className={`${styles.ctaButton} bg-white text-green-700 border border-green-700 hover:bg-green-50`}>
            Xem lịch sử
          </Link>
          <Link href="/farmer/diagnosis" className={styles.ctaButton}>
            Chẩn đoán bệnh
          </Link>
        </div>
      </header>

      <div className={styles.dashboardGrid}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Tình trạng thửa đất</h2>

          {withdrawals.length > 0 && (
            <ul className={`${styles.parcelList} mb-4`} aria-label="Thời gian cách ly">
              {withdrawals.map(w => (
                <li key={w.parcel_code}>
                  <Pill tone="amber" size="md">{`Thửa ${w.parcel_code} còn ${w.days} ngày cách ly`}</Pill>
                </li>
              ))}
            </ul>
          )}

          {!household || household.parcels.length === 0 ? (
            <p>Bạn chưa có thửa đất nào được phân công.</p>
          ) : (
            <div className={styles.parcelList}>
              {household.parcels.map(parcel => (
                <div key={parcel.id} className={styles.parcelCard}>
                  <div className={styles.parcelInfo}>
                    <h3>{parcel.parcel_code}</h3>
                    <p>{parcel.crop_type} • {parcel.area_ha} ha</p>
                  </div>
                  <Pill tone={getParcelStatusColor(parcel.status)}>
                    {getParcelStatusLabel(parcel.status)}
                  </Pill>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={styles.section} data-testid="weather-widget">
          <h2 className={styles.sectionTitle}>Thời tiết hiện tại</h2>
          
          {!weather ? (
            <div className={styles.weatherWidget}>
              <p>Chưa có dữ liệu thời tiết cho khu vực của bạn.</p>
            </div>
          ) : (
            <div className={styles.weatherWidget}>
              <div className={styles.weatherMain}>
                <Cloud size={48} color="var(--primary)" />
                <div>
                  <div className={styles.weatherTemp}>{weather.temperature_c}°C</div>
                  <div className={styles.weatherCondition}>{weather.condition}</div>
                </div>
              </div>
              
              <div className={styles.weatherDetails}>
                <div className={styles.weatherDetailItem}>
                  <span className={styles.weatherDetailLabel}>Độ ẩm</span>
                  <div className={styles.weatherDetailValue}>
                    <Droplets size={16} className={styles.iconInline} />
                    {weather.humidity_pct}%
                  </div>
                </div>
                <div className={styles.weatherDetailItem}>
                  <span className={styles.weatherDetailLabel}>Lượng mưa</span>
                  <div className={styles.weatherDetailValue}>
                    <Cloud size={16} className={styles.iconInline} />
                    {weather.precipitation_mm} mm
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
