// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, BookOpen, Camera, FileText, History, PenLine, Sprout, Store, MessageCircle } from 'lucide-react'

import { prisma } from '@/infrastructure/db/prisma.client'
import { PrismaInstalledAppRepository } from '@/infrastructure/db/repositories/prisma-installed-app-repository'
import { auth } from '@/auth'
import { requireTenant } from '@/lib/api/tenant'
import { EmptyState } from '@/components/ui'
import { TodayTasks } from '@/components/features/farmer-web/TodayTasks'
import { SampleTag } from '@/components/features/sample/SampleTag'
import { DETECTIONS } from '@/components/features/disease/sample-detections'
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
  SPRAYING: 'Phun thuốc BVTV',
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
  { href: '/farmer/ai', icon: MessageCircle, tone: 'soft', title: 'Chatbot nông nghiệp', detail: 'Hỏi về bón phân, sâu bệnh, thu hái' },
  { href: '/farmer/handbook', icon: BookOpen, tone: 'soft', title: 'Cẩm nang canh tác', detail: 'Việc theo mùa và cách phòng trị bệnh cho cây chè' },
]

function dayMonth(date: Date): string {
  return date.toLocaleDateString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit' })
}

function fullDay(date: Date): string {
  return date.toLocaleDateString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' })
}

const DAY_MS = 24 * 60 * 60 * 1000


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
  const withdrawalRows = household
    ? await prisma.journalActivity.findMany({
        where: {
          safe_harvest_date: { gt: now },
          journal_entry: { status: { not: 'DRAFT' }, parcel: { household: { id: household.id, htx_profile_id: htxProfileId } } },
        },
        select: { safe_harvest_date: true, journal_entry: { select: { entry_date: true, parcel: { select: { parcel_code: true } } } } },
      })
    : []
  const withdrawals = activeWithdrawals(
    withdrawalRows.map((a) => ({ parcel_code: a.journal_entry.parcel.parcel_code, safe_harvest_date: a.safe_harvest_date! })),
    now,
  ).map((w) => {
    // The period that ends last decides the parcel's date and how far along it is.
    const latest = withdrawalRows
      .filter((a) => a.journal_entry.parcel.parcel_code === w.parcel_code)
      .sort((x, y) => y.safe_harvest_date!.getTime() - x.safe_harvest_date!.getTime())[0]
    const safe = latest.safe_harvest_date!
    const start = latest.journal_entry.entry_date
    const total = start ? Math.max(1, Math.round((safe.getTime() - start.getTime()) / DAY_MS)) : null
    const passed = total === null ? 0 : Math.min(total, Math.max(0, total - w.days))
    return { ...w, safe, total, passed }
  })

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
          take: 4,
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

  // The coming harvests, one line under each parcel.
  const harvests = household
    ? await prisma.parcelCropCycle.findMany({
        where: { parcel: { household_id: household.id }, harvested_at: null, estimated_harvest_date: { gte: new Date(now.getTime() - DAY_MS) } },
        orderBy: { estimated_harvest_date: 'asc' },
        select: { id: true, parcel_id: true, estimated_harvest_date: true },
      })
    : []

  // The page still renders when the app list cannot be read.
  const supplies = await new PrismaInstalledAppRepository()
    .isEnabledFor(SUPPLY_APP, session.user.htxCode ?? '')
    .catch(() => false)
  const shortcuts = supplies
    ? [...SHORTCUTS, { href: `/farmer/apps/${SUPPLY_APP}`, icon: Store, tone: 'amber', title: 'Vật tư mua chung', detail: 'Đăng ký mua chung phân bón, thuốc BVTV' }]
    : SHORTCUTS

  const parcels = [...(household?.parcels ?? [])].sort((a, b) => String(a.parcel_code).localeCompare(String(b.parcel_code)))
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

      <nav className={styles.shortcuts} aria-label="Lối tắt">
        {shortcuts.map(({ href, icon: Icon, title }) => (
          <Link key={href} href={href}><Icon size={15} aria-hidden="true" />{title}</Link>
        ))}
      </nav>

      <div className={styles.columns}>
        <div className={styles.main}>
          {withdrawals.length > 0 && (
            <section className={styles.alert} role="status">
              <ul aria-label="Thời gian cách ly">
                {withdrawals.map(w => (
                  <li key={w.parcel_code}>
                    <AlertTriangle size={16} aria-hidden="true" />
                    <strong>{`Thửa ${w.parcel_code} còn ${w.days} ngày cách ly`}</strong>
                    <span>Hái từ {fullDay(w.safe)}</span>
                    {w.total !== null && (
                      <span className={styles.bar} aria-label={`Đã qua ${w.passed}/${w.total} ngày`}><span style={{ width: `${Math.round((w.passed / w.total) * 100)}%` }} /></span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className={`${kit.pn} ${styles.card} ${styles.parcels}`} aria-label="Tình trạng thửa đất">
            <div className={styles.head}>
              <h2>Thửa chè và lịch hái <small>{parcels.length} thửa · {hectares(totalHa)} ha</small></h2>
              <Link href="/farmer/schedule">Xem lịch</Link>
            </div>
            {parcels.length === 0 ? (
              <EmptyState icon={<Sprout />} title="Bạn chưa có thửa đất nào được phân công." />
            ) : (
              <ul className={styles.rows}>
                {parcels.map(parcel => {
                  const harvest = harvests.find(cycle => cycle.parcel_id === parcel.id)
                  const blocked = withdrawals.find(w => w.parcel_code === parcel.parcel_code)
                  const when = harvest?.estimated_harvest_date ?? null
                  const yieldKg = parcel.estimated_yield_per_ha ? Math.round(parcel.estimated_yield_per_ha * parcel.area_ha) : null
                  return (
                    <li key={parcel.id}>
                      <span className={kit.grow}>
                        <strong>{parcel.parcel_code}</strong>
                        <small>{parcel.crop_type} · {hectares(parcel.area_ha)} ha</small>
                      </span>
                      <span className={styles.harvestDay}>
                        {when ? <>Hái {fullDay(when)}{yieldKg ? ` · ~${yieldKg.toLocaleString('vi-VN')} kg` : ''}</> : 'Chưa xếp lịch hái'}
                        {when && blocked && blocked.safe > when && <small className={styles.danger}>Còn cách ly đến {fullDay(blocked.safe)}</small>}
                      </span>
                      <span className={`${kit.tag} ${kit[PARCEL_TONE[parcel.status] ?? 'mu']}`}>{getParcelStatusLabel(parcel.status)}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className={`${kit.pn} ${styles.card} ${styles.recent}`} aria-label="Nhật ký gần đây">
            <div className={styles.head}><h2>Nhật ký gần đây</h2><Link href="/farmer/journal">Xem tất cả</Link></div>
            {entries.length === 0 ? (
              <EmptyState icon={<FileText />} title="Chưa có nhật ký nào" />
            ) : (
              <ul className={styles.rows}>
                {entries.map(entry => {
                  const status = ENTRY_STATUS[entry.status as keyof typeof ENTRY_STATUS] ?? ENTRY_STATUS.DRAFT
                  return (
                    <li key={entry.id}>
                      <span className={kit.grow}><strong>{ACTIVITY_LABELS[entry.activity_type] ?? entry.activity_type}</strong> · {entry.parcel.parcel_code}</span>
                      <span className={styles.date}>{dayMonth(entry.entry_date)}</span>
                      <span className={`${kit.tag} ${kit[status.tone]}`}>{status.label}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>

        <div className={styles.side}>
          <TodayTasks className={`${styles.card} ${styles.tasks}`} />

          <section className={`${kit.pn} ${styles.card} ${styles.disease}`} aria-label="Báo cáo sâu bệnh">
            <div className={styles.head}>
              <h2>Báo cáo sâu bệnh <SampleTag /></h2>
              <Link href="/farmer/diagnosis">Xem tất cả</Link>
            </div>
            <ul className={styles.rows}>
              {DETECTIONS.map(d => (
                <li key={d.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={d.image} alt="" />
                  <Link href="/farmer/diagnosis" className={kit.grow}>
                    <strong>{d.name}</strong>
                    <small>{d.status}</small>
                  </Link>
                  <span className={`${kit.tag} ${kit[d.levelTone]}`}>{d.level}</span>
                </li>
              ))}
            </ul>
            <p className={styles.diseaseNote}>Minh hoạ, không làm theo để phun thuốc.</p>
          </section>
        </div>
      </div>
    </main>
  )
}
