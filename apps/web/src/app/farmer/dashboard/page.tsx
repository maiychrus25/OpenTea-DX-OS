// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Sprout, PenLine, Camera, FileText, History, Sparkles, BookOpen, Store } from 'lucide-react'

import { prisma } from '@/infrastructure/db/prisma.client'
import { PrismaInstalledAppRepository } from '@/infrastructure/db/repositories/prisma-installed-app-repository'
import { auth } from '@/auth'
import { requireTenant } from '@/lib/api/tenant'
import { AlertBar, EmptyState } from '@/components/ui'
import { WeatherHero } from '@/components/features/farmer-web/WeatherHero'
import { activeWithdrawals } from '@/domain/journal/active-withdrawals'
import { weatherCodeToCondition } from '@/infrastructure/external/open-meteo-adapter'

import kit from '@/components/features/farmer-web/kit.module.css'
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
  DRAFT: { label: 'Bản nháp', tone: 'mu' },
  PENDING_APPROVAL: { label: 'Chờ duyệt', tone: 'wt' },
  APPROVED: { label: 'Đã duyệt', tone: 'soft' },
  REJECTED: { label: 'Từ chối', tone: 'bd' },
  REQUEST_CHANGES: { label: 'Cần sửa', tone: 'in' },
} as const

const PARCEL_TONE: Record<string, string> = {
  SOWING: 'in',
  TENDING: 'soft',
  HARVEST_APPROVED: 'amber',
  HARVESTED: 'mu',
}

/** The cooperative's own app; its card shows only where the app is installed and enabled. */
const SUPPLY_APP = 'farm-supply'

const SHORTCUTS = [
  { href: '/farmer/ai', icon: Sparkles, tone: 'dark', title: 'Chatbot', detail: 'Hỏi về bón phân, sâu bệnh, thu hái' },
  { href: '/farmer/handbook', icon: BookOpen, tone: 'soft', title: 'Cẩm nang canh tác', detail: 'Việc theo mùa và cách phòng trị bệnh' },
]

function dayMonth(date: Date): string {
  return date.toLocaleDateString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit' })
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

  // A farmer without a household has no parcels or journals to read.
  const [entries, htx] = household
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
          },
        }),
        prisma.htxProfile.findUnique({ where: { id: htxProfileId }, select: { name: true, address: true } }),
      ])
    : [[], null]

  // The page still renders when the app list cannot be read.
  const supplies = await new PrismaInstalledAppRepository()
    .isEnabledFor(SUPPLY_APP, session.user.htxCode ?? '')
    .catch(() => false)
  const shortcuts = supplies
    ? [...SHORTCUTS, { href: `/farmer/apps/${SUPPLY_APP}`, icon: Store, tone: 'amber', title: 'Vật tư mua chung', detail: 'Đăng ký mua chung phân bón, thuốc BVTV' }]
    : SHORTCUTS

  const parcels = household?.parcels ?? []
  const totalHa = parcels.reduce((sum, p) => sum + p.area_ha, 0)
  const condition = weather && (/^\d+$/.test(weather.condition) ? weatherCodeToCondition(Number(weather.condition)) : weather.condition)
  const hectares = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 2 })

  return (
    <main className={`${kit.page} ${styles.page}`}>
      <div className={styles.hero}>
        <WeatherHero
          eyebrow={['Nông hộ', htx?.name].filter(Boolean).join(' · ')}
          title={`${getGreeting()}, ${session.user.name || 'Nông dân'}`}
          subtitle="Chúc bạn một ngày làm việc hiệu quả!"
          actions={[
            { href: '/farmer/journal/new', label: 'Ghi nhật ký mới', icon: <PenLine size={16} aria-hidden="true" /> },
            { href: '/farmer/journal', label: 'Xem lịch sử', icon: <History size={16} aria-hidden="true" /> },
            { href: '/farmer/diagnosis', label: 'Chẩn đoán bệnh', icon: <Camera size={16} aria-hidden="true" /> },
          ]}
          place={htx?.address ?? ''}
          cached={weather && condition ? { temperature: weather.temperature_c, condition, humidity: weather.humidity_pct, rainMm: weather.precipitation_mm ?? 0 } : null}
        />
      </div>

      <div className={styles.shortcuts}>
        {shortcuts.map(({ href, icon: Icon, tone, title, detail }) => (
          <Link key={href} href={href} className={`${kit.pn} ${styles.shortcut}`}>
            <span className={`${kit.ico} ${kit[tone]}`}><Icon size={22} aria-hidden="true" /></span>
            <span><strong>{title}</strong><small>{detail}</small></span>
          </Link>
        ))}
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

      <div className={`${kit.cols} ${styles.columns}`}>
        <section className={`${kit.pn} ${styles.parcels}`} aria-label="Tình trạng thửa đất">
          <div className={kit.ph}><h2>Tình trạng thửa đất</h2><span className={`${kit.tag} ${kit.mu}`}>{parcels.length} thửa · {hectares(totalHa)} ha</span></div>
          {parcels.length === 0 ? (
            <EmptyState icon={<Sprout />} title="Bạn chưa có thửa đất nào được phân công." />
          ) : (
            <ul className={kit.list}>
              {parcels.map(parcel => (
                <li key={parcel.id} className={`${kit.row} ${styles.parcel}`}>
                  <span className={`${kit.ico} ${kit.soft}`}><Sprout size={22} aria-hidden="true" /></span>
                  <span className={kit.grow}>
                    <strong className={kit.mono}>{parcel.parcel_code}</strong><br />
                    <span className={kit.muted}>{parcel.crop_type} • {hectares(parcel.area_ha)} ha</span>
                  </span>
                  <span className={`${kit.tag} ${kit[PARCEL_TONE[parcel.status] ?? 'mu']}`}>{getParcelStatusLabel(parcel.status)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className={`${kit.stack} ${styles.side}`}>
          <section className={`${kit.pn} ${styles.recent}`} aria-label="Nhật ký gần đây">
            <div className={kit.ph}><h2>Nhật ký gần đây</h2><Link href="/farmer/journal">Xem tất cả</Link></div>
            {entries.length === 0 ? (
              <EmptyState icon={<FileText />} title="Chưa có nhật ký nào" />
            ) : (
              <ul className={kit.list}>
                {entries.map(entry => {
                  const status = ENTRY_STATUS[entry.status as keyof typeof ENTRY_STATUS] ?? ENTRY_STATUS.DRAFT
                  return (
                    <li key={entry.id} className={kit.row}>
                      <span className={`${kit.mono} ${styles.date}`}>{dayMonth(entry.entry_date)}</span>
                      <strong className={kit.grow}>{ACTIVITY_LABELS[entry.activity_type] ?? entry.activity_type} · {entry.parcel.parcel_code}</strong>
                      <span className={`${kit.tag} ${kit[status.tone]}`}>{status.label}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
