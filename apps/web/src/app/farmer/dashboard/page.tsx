// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, ArrowRight, Calendar, ChevronRight, Droplet, FileText, Leaf, PenLine, Scissors, SprayCan, Sprout, Store } from 'lucide-react'

import { prisma } from '@/infrastructure/db/prisma.client'
import { PrismaInstalledAppRepository } from '@/infrastructure/db/repositories/prisma-installed-app-repository'
import { auth } from '@/auth'
import { requireTenant } from '@/lib/api/tenant'
import { EmptyState } from '@/components/ui'
import { WeatherHero } from '@/components/features/farmer-web/WeatherHero'
import { LeafPriceCard } from '@/components/features/weighing/LeafPriceCard'
import { FarmerMoneyCard } from '@/components/features/ledger/FarmerMoneyCard'
import { activeWithdrawals } from '@/domain/journal/active-withdrawals'
import { weatherCodeToCondition } from '@/infrastructure/external/open-meteo-adapter'

import { WITHDRAWAL_EXCLUDED_STATUSES } from '@/domain/journal/withdrawal-status'
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
  PRUNING: 'Đốn chè',
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

function dayMonth(date: Date): string {
  return date.toLocaleDateString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit' })
}

function fullDay(date: Date): string {
  return date.toLocaleDateString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' })
}

const DAY_MS = 24 * 60 * 60 * 1000

const ACTIVITY_ICON = {
  SOWING: { icon: Sprout, tone: 'soft' },
  FERTILIZING: { icon: Sprout, tone: 'soft' },
  SPRAYING: { icon: SprayCan, tone: 'soft' },
  IRRIGATION: { icon: Droplet, tone: 'in' },
  HARVEST: { icon: Scissors, tone: 'amber' },
  OTHER: { icon: Leaf, tone: 'soft' },
} as const

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

  // Drafts and rejected entries are left out; pending and change-requested ones still warn the farmer, as they block harvest.
  const now = new Date()
  const withdrawalRows = household
    ? await prisma.journalActivity.findMany({
        where: {
          safe_harvest_date: { gt: now },
          journal_entry: { status: { notIn: [...WITHDRAWAL_EXCLUDED_STATUSES] }, parcel: { household: { id: household.id, htx_profile_id: htxProfileId } } },
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

  // Last care per parcel and the coming harvests, for the parcel cards and the table.
  const [lastCare, harvests] = household
    ? await Promise.all([
        prisma.journalEntry.findMany({
          where: { parcel: { household_id: household.id }, status: { not: 'DRAFT' } },
          orderBy: { entry_date: 'desc' },
          distinct: ['parcel_id'],
          select: { parcel_id: true, entry_date: true, activity_type: true, activities: { select: { product_name: true }, take: 1 } },
        }),
        prisma.parcelCropCycle.findMany({
          where: { parcel: { household_id: household.id }, harvested_at: null, estimated_harvest_date: { gte: new Date(now.getTime() - DAY_MS) } },
          orderBy: { estimated_harvest_date: 'asc' },
          select: { id: true, season: true, parcel_id: true, estimated_harvest_date: true },
        }),
      ])
    : [[], []]

  // The page still renders when the app list cannot be read.
  const supplies = await new PrismaInstalledAppRepository()
    .isEnabledFor(SUPPLY_APP, session.user.htxCode ?? '')
    .catch(() => false)

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
            { href: '/farmer/schedule', label: 'Xem lịch thu hái', icon: <Calendar size={16} aria-hidden="true" /> },
          ]}
          place={htx?.address ?? ''}
          cached={weather && condition ? { temperature: weather.temperature_c, condition, humidity: weather.humidity_pct, rainMm: weather.precipitation_mm ?? 0 } : null}
        />
      </div>

      {withdrawals.length > 0 && (
        <div className={`${styles.pair} ${styles.single}`}>
          <section className={styles.alert} role="status">
            <ul className={styles.withdrawals} aria-label="Thời gian cách ly">
              {withdrawals.map(w => (
                <li key={w.parcel_code}>
                  <div className={styles.alertHead}>
                    <AlertTriangle size={20} aria-hidden="true" />
                    <strong>{`Thửa ${w.parcel_code} còn ${w.days} ngày cách ly`}</strong>
                    <Link href="/farmer/schedule" className={styles.alertLink}>Xem lịch</Link>
                  </div>
                  {w.total !== null && (
                    <div className={styles.bar} aria-hidden="true"><span style={{ width: `${Math.round((w.passed / w.total) * 100)}%` }} /></div>
                  )}
                  <p>
                    {w.total !== null && <span>Đã qua {w.passed}/{w.total} ngày ({Math.round((w.passed / w.total) * 100)}%)</span>}
                    <span>Thu hái sớm nhất: <b>{fullDay(w.safe)}</b></span>
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      <div className={styles.moneyRow}>
        <LeafPriceCard />
        <FarmerMoneyCard />
      </div>

      <div className={styles.columns}>
        <section className={`${kit.pn} ${styles.parcels}`} aria-label="Tình trạng thửa đất">
          <div className={kit.ph}>
            <span>
              <h2>Tình trạng thửa đất</h2>
              <small className={kit.muted}>Tổng: {parcels.length} thửa · {hectares(totalHa)} ha</small>
            </span>
            <Link href="/farmer/schedule">Xem lịch <ArrowRight size={14} aria-hidden="true" /></Link>
          </div>
          {parcels.length === 0 ? (
            <EmptyState icon={<Sprout />} title="Bạn chưa có thửa đất nào được phân công." />
          ) : (
            <ul className={styles.cards}>
              {parcels.map(parcel => {
                const care = lastCare.find(entry => entry.parcel_id === parcel.id)
                const harvest = harvests.find(cycle => cycle.parcel_id === parcel.id)
                const product = care?.activities?.[0]?.product_name
                return (
                  <li key={parcel.id} className={styles.parcel}>
                    <span className={`${kit.ico} ${kit.soft}`}><Sprout size={20} aria-hidden="true" /></span>
                    <span><strong>{parcel.parcel_code}</strong><small>{parcel.crop_type}</small></span>
                    <span><strong>{hectares(parcel.area_ha)} ha</strong><small>Diện tích</small></span>
                    <span className={`${kit.tag} ${kit[PARCEL_TONE[parcel.status] ?? 'mu']}`}>{getParcelStatusLabel(parcel.status)}</span>
                    <p>
                      <span><Calendar size={13} aria-hidden="true" />{care ? `Chăm sóc ${dayMonth(care.entry_date)}: ${ACTIVITY_LABELS[care.activity_type] ?? care.activity_type}${product ? `, ${product}` : ''}` : 'Chưa ghi lần chăm sóc'}</span>
                      {harvest?.estimated_harvest_date && <span><Leaf size={13} aria-hidden="true" />Hái dự kiến {dayMonth(harvest.estimated_harvest_date)}</span>}
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className={`${kit.pn} ${styles.recent}`} aria-label="Nhật ký gần đây">
          <div className={kit.ph}><h2>Nhật ký gần đây</h2><Link href="/farmer/journal">Xem tất cả <ArrowRight size={14} aria-hidden="true" /></Link></div>
          {entries.length === 0 ? (
            <EmptyState icon={<FileText />} title="Chưa có nhật ký nào" />
          ) : (
            <ul className={kit.list}>
              {entries.map(entry => {
                const status = ENTRY_STATUS[entry.status as keyof typeof ENTRY_STATUS] ?? ENTRY_STATUS.DRAFT
                const { icon: Icon, tone } = ACTIVITY_ICON[entry.activity_type as keyof typeof ACTIVITY_ICON] ?? ACTIVITY_ICON.OTHER
                return (
                  <li key={entry.id}>
                    <Link href="/farmer/journal" className={styles.entry}>
                      <span className={`${kit.ico} ${kit[tone]}`}><Icon size={18} aria-hidden="true" /></span>
                      <span className={kit.grow}><strong>{ACTIVITY_LABELS[entry.activity_type] ?? entry.activity_type}</strong> · {entry.parcel.parcel_code}</span>
                      <span className={styles.date}><Calendar size={13} aria-hidden="true" />{dayMonth(entry.entry_date)}</span>
                      <span className={`${kit.tag} ${kit[status.tone]}`}>{status.label}</span>
                      <ChevronRight size={16} aria-hidden="true" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      {supplies && (
        <Link href={`/farmer/apps/${SUPPLY_APP}`} className={`${kit.pn} ${styles.shortcut}`}>
          <span className={`${kit.ico} ${kit.amber}`}><Store size={20} aria-hidden="true" /></span>
          <span className={kit.grow}><strong>Vật tư mua chung</strong><small>Đăng ký mua chung phân bón, thuốc BVTV</small></span>
          <ChevronRight size={18} aria-hidden="true" />
        </Link>
      )}
    </main>
  )
}
