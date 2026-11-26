// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { redirect } from 'next/navigation'
import { Cloud, Sprout, Leaf, Clock, Calendar, PenLine, Camera, FileText, History } from 'lucide-react'

import { prisma } from '@/infrastructure/db/prisma.client'
import { auth } from '@/auth'
import { requireTenant } from '@/lib/api/tenant'
import { Pill, HeroBanner, Panel, MetricCard, AlertBar, EmptyState } from '@/components/ui'
import { activeWithdrawals } from '@/domain/journal/active-withdrawals'
import { weatherCodeToCondition } from '@/infrastructure/external/open-meteo-adapter'

import layout from '@/components/features/dashboard/dashboard.module.css'
import styles from './farmer-dashboard.module.css'

function getGreeting(): string {
  const now = new Date()
  const vnTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }))
  const hour = vnTime.getHours()
  if (hour < 12) return 'Chào buổi sáng'
  if (hour < 18) return 'Chào buổi chiều'
  return 'Chào buổi tối'
}

const ACTIVITY_LABELS: Record<string, string> = {
  SOWING: 'Gieo trồng',
  FERTILIZING: 'Bón phân',
  SPRAYING: 'Phun thuốc',
  IRRIGATION: 'Tưới tiêu',
  HARVEST: 'Thu hoạch',
  OTHER: 'Khác',
}

const ENTRY_STATUS = {
  DRAFT: { label: 'Bản nháp', tone: 'muted' },
  PENDING_APPROVAL: { label: 'Chờ duyệt', tone: 'wait' },
  APPROVED: { label: 'Đã duyệt', tone: 'ok' },
  REJECTED: { label: 'Từ chối', tone: 'bad' },
  REQUEST_CHANGES: { label: 'Cần sửa', tone: 'info' },
} as const

const PARCEL_STATUS_CLASS: Record<string, string> = {
  SOWING: 'sowing',
  TENDING: 'tending',
  HARVEST_APPROVED: 'harvestApproved',
  HARVESTED: 'harvested',
}

function dayMonth(date: Date): string {
  return date.toLocaleDateString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit' })
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(date)
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

  // Drafts are left out; rejected and pending entries still warn the farmer, as they block harvest.
  const now = new Date()
  const withdrawals = household
    ? activeWithdrawals(
        (await prisma.journalActivity.findMany({
          where: {
            safe_harvest_date: { gt: now },
            journal_entry: { status: { not: 'DRAFT' }, parcel: { household: { id: household.id, htx_profile_id: htxProfileId } } },
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

  // A farmer without a household has no parcels, journals or schedule to read.
  const [entries, pendingCount, cycles, htx] = household
    ? await Promise.all([
        prisma.journalEntry.findMany({
          where: { parcel: { household_id: household.id } },
          orderBy: { entry_date: 'desc' },
          take: 3,
          select: {
            id: true,
            activity_type: true,
            entry_date: true,
            status: true,
            parcel: { select: { parcel_code: true } },
            activities: { select: { activity_detail: true, product_name: true }, take: 1 },
          },
        }),
        prisma.journalEntry.count({ where: { parcel: { household_id: household.id }, status: 'PENDING_APPROVAL' } }),
        prisma.parcelCropCycle.findMany({
          where: { parcel: { household_id: household.id }, estimated_harvest_date: { gte: now } },
          orderBy: { estimated_harvest_date: 'asc' },
          take: 3,
          select: { id: true, estimated_harvest_date: true, parcel: { select: { parcel_code: true } } },
        }),
        prisma.htxProfile.findUnique({ where: { id: htxProfileId }, select: { name: true } }),
      ])
    : [[], 0, [], null]

  const parcels = household?.parcels ?? []
  const totalHa = parcels.reduce((sum, p) => sum + p.area_ha, 0)
  const expectedKg = parcels
    .filter(p => p.status !== 'HARVESTED' && p.status !== 'DRAFT')
    .reduce((sum, p) => sum + p.area_ha * (p.estimated_yield_per_ha ?? 0), 0)
  const nextHarvest = cycles[0]
  const condition = weather && (/^\d+$/.test(weather.condition) ? weatherCodeToCondition(Number(weather.condition)) : weather.condition)

  return (
    <main className={`${layout.page} ${styles.page}`}>
      <div className={styles.hero}>
        <HeroBanner
          eyebrow={['Nông hộ', htx?.name].filter(Boolean).join(' · ')}
          title={`${getGreeting()}, ${session.user.name || 'Nông dân'}`}
          subtitle={`${formatDate(now)}${pendingCount > 0 ? ` · ${pendingCount} nhật ký đang chờ cán bộ duyệt` : ''}`}
          actions={[
            { href: '/farmer/journal/new', label: 'Ghi nhật ký', icon: <PenLine size={18} aria-hidden="true" /> },
            { href: '/farmer/diagnosis', label: 'Chẩn đoán lá', icon: <Camera size={18} aria-hidden="true" /> },
            { href: '/farmer/journal', label: 'Xem lịch sử', icon: <History size={18} aria-hidden="true" /> },
          ]}
        />
      </div>

      {withdrawals.length > 0 && (
        <div className={styles.alert}>
          <AlertBar href="/farmer/schedule" linkLabel="Xem lịch">
            <ul className={styles.withdrawals} aria-label="Thời gian cách ly">
              {withdrawals.map(w => (
                <li key={w.parcel_code}>{`Thửa ${w.parcel_code} còn ${w.days} ngày cách ly`}</li>
              ))}
            </ul>
          </AlertBar>
        </div>
      )}

      <div className={`${layout.metrics} ${styles.metrics}`}>
        <MetricCard icon={<Sprout />} label="Thửa của tôi" value={parcels.length} detail={`${totalHa.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} ha`} />
        <MetricCard icon={<Leaf />} label="Sản lượng dự kiến" value={`${(expectedKg / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tấn`} tone="blue" />
        <MetricCard icon={<Clock />} label="Nhật ký chờ duyệt" value={pendingCount} tone="amber" />
        <MetricCard
          icon={<Calendar />}
          label="Lần hái tới"
          value={nextHarvest ? dayMonth(nextHarvest.estimated_harvest_date!) : '—'}
          detail={nextHarvest?.parcel.parcel_code}
        />
      </div>

      <div className={`${layout.columns} ${styles.columns}`}>
        <div className={`${layout.stack} ${styles.main}`}>
          <Panel title="Thửa của tôi" className={styles.parcels}>
            {parcels.length === 0 ? (
              <EmptyState icon={<Sprout />} title="Bạn chưa có thửa đất nào được phân công." />
            ) : (
              <ul className={layout.list}>
                {parcels.map(parcel => (
                  <li key={parcel.id} className={styles.parcel}>
                    <strong className={layout.code}>{parcel.parcel_code}</strong>
                    <span className={styles.crop}>{parcel.crop_type} · {parcel.area_ha.toLocaleString('vi-VN')} ha</span>
                    <span className={`${styles.status} ${styles[PARCEL_STATUS_CLASS[parcel.status] ?? 'draft']}`}>
                      {getParcelStatusLabel(parcel.status)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Nhật ký gần đây" href="/farmer/journal" className={styles.recent}>
            {entries.length === 0 ? (
              <EmptyState icon={<FileText />} title="Chưa có nhật ký nào" />
            ) : (
              <ul className={layout.list}>
                {entries.map(entry => {
                  const status = ENTRY_STATUS[entry.status as keyof typeof ENTRY_STATUS] ?? ENTRY_STATUS.DRAFT
                  const activity = entry.activities[0]
                  return (
                    <li key={entry.id} className={layout.row}>
                      <div className={layout.rowMain}>
                        <strong>{ACTIVITY_LABELS[entry.activity_type] ?? entry.activity_type} · {entry.parcel.parcel_code}</strong>
                        <small>{[activity?.product_name || activity?.activity_detail, dayMonth(entry.entry_date)].filter(Boolean).join(' · ')}</small>
                      </div>
                      <Pill tone={status.tone}>{status.label}</Pill>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>
        </div>

        <div className={`${layout.stack} ${styles.side}`}>
          <div className={styles.weather} data-testid="weather-widget">
            <Panel title="Thời tiết hiện tại">
              {!weather ? (
                <p className={layout.body}>Chưa có dữ liệu thời tiết cho khu vực của bạn.</p>
              ) : (
                <div className={`${layout.body} ${styles.weatherBody}`}>
                  <Cloud size={40} aria-hidden="true" />
                  <div>
                    <p className={styles.temperature}>
                      <strong>{weather.temperature_c.toLocaleString('vi-VN')}°C</strong> <span>{condition}</span>
                    </p>
                    <p className={styles.weatherMeta}>Độ ẩm {weather.humidity_pct}% · Mưa {weather.precipitation_mm} mm</p>
                  </div>
                </div>
              )}
            </Panel>
          </div>

          <Panel title="Lịch hái sắp tới" href="/farmer/schedule" linkLabel="Xem lịch" className={styles.upcoming}>
            {cycles.length === 0 ? (
              <EmptyState icon={<Calendar />} title="Chưa có lịch thu hái" />
            ) : (
              <ul className={layout.list}>
                {cycles.map(cycle => (
                  <li key={cycle.id} className={layout.row}>
                    <strong className={layout.rowDate}>{dayMonth(cycle.estimated_harvest_date!)}</strong>
                    <span>Thửa {cycle.parcel.parcel_code}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </main>
  )
}
