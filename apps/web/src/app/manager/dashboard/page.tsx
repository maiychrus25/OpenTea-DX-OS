// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Sprout, TrendingUp, PackageCheck, Clock, BarChart3, Calendar, CheckSquare, QrCode, Newspaper, ChevronRight, Plus } from 'lucide-react'

import { GetHtxProfileUseCase } from '@/application/useCases/GetHtxProfileUseCase'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/repositories/PrismaHtxProfileRepository'
import { prisma } from '@/infrastructure/db/prisma.client'
import { NotFoundError } from '@/domain/errors'
import { auth } from '@/auth'
import { requireTenant } from '@/lib/api/tenant'
import { MetricCard, AiNote, SourceBox, HeroBanner, Panel, Pill, EmptyState } from '@/components/ui'

import { NoticesAndWeather, RainAlert } from '@/components/features/dashboard/NoticesAndWeather'
import { PendingJournals } from '@/components/features/dashboard/PendingJournals'
import { SampleYieldChart } from '@/components/features/sample/SampleYieldChart'
import styles from './Dashboard.module.css'
import layout from '@/components/features/dashboard/dashboard.module.css'

function getGreeting(): string {
  const now = new Date()
  const vnTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }))
  const hour = vnTime.getHours()
  if (hour < 12) return 'Chào buổi sáng'
  if (hour < 18) return 'Chào buổi chiều'
  return 'Chào buổi tối'
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

// Dịch tên mặt hàng từ tiếng Anh → tiếng Việt gần gũi với nông dân
const COMMODITY_VN: Record<string, string> = {
  'Agricultural Products':    'Nông nghiệp',
  'Tea':                      'Chè',
  'Rice':                     'Lúa gạo',
  'Maize':                    'Ngô',
  'Wheat':                    'Lúa mì',
  'Vegetable':                'Rau củ',
  'Vegetables':               'Rau củ',
  'Fruit':                    'Trái cây',
  'Fruits':                   'Trái cây',
  'Meat':                     'Thịt',
  'Dairy':                    'Sữa',
  'Sugar':                    'Đường',
  'Coffee':                   'Cà phê',
  'Rubber':                   'Cao su',
  'Cassava':                  'Sắn',
  'Pepper':                   'Tiêu',
  'Cereals':                  'Ngũ cốc',
}

// Dịch tên metric (loại chỉ số) sang tiếng Việt
const METRIC_VN: Record<string, string> = {
  'crop_production_index':     'Chỉ số SX nông nghiệp',
  'food_production_index':     'Chỉ số SX lương thực',
  'fertilizer_consumption':    'Tiêu thụ phân bón',
  'cereal_production':         'Sản lượng ngũ cốc',
  'cereal_yield':              'Năng suất ngũ cốc',
  'producer_price_index':      'Chỉ số giá sản xuất',
  'consumer_price_index':      'Chỉ số giá tiêu dùng',
}

const ACTIVITY_LABELS: Record<string, string> = {
  SOWING: 'Gieo trồng',
  FERTILIZING: 'Bón phân',
  SPRAYING: 'Phun thuốc',
  IRRIGATION: 'Tưới tiêu',
  HARVEST: 'Thu hoạch',
  OTHER: 'Khác',
}

const PARCEL_STATUSES = [
  { status: 'TENDING', label: 'Đang chăm sóc', color: 'var(--color-status-tending)' },
  { status: 'SOWING', label: 'Xuống giống', color: 'var(--color-status-sowing)' },
  { status: 'HARVEST_APPROVED', label: 'Được thu hoạch', color: 'var(--color-status-harvest-approved)' },
  { status: 'HARVESTED', label: 'Đã thu hoạch', color: 'var(--color-status-harvested)' },
  { status: 'DRAFT', label: 'Bản nháp', color: 'var(--color-status-draft)' },
]

const PRICE_SELECT = { commodity: true, metric: true, value: true, unit: true, source: true, fetched_at: true } as const
const PRICE_COUNT = 3

// Tea only: other commodities are off-domain for a tea cooperative.
function latestPrices() {
  return prisma.marketData.findMany({
    where: { commodity: 'Tea' },
    orderBy: { fetched_at: 'desc' },
    take: PRICE_COUNT,
    select: PRICE_SELECT,
  })
}

function toMetricVN(metric: string | undefined | null): string {
  if (!metric) return ''
  return METRIC_VN[metric] ?? metric.replace(/_/g, ' ')
}

function toCommodityVN(raw: string | undefined | null): string {
  if (!raw) return ''
  return COMMODITY_VN[raw] ?? raw
}

// Chuyển FAO index → mức độ dễ hiểu với nông dân (không dùng chỉ số kỹ thuật 2014-2016)
function formatIndexValue(value: number, unit: string): { badge: string; color: string; numericLabel: string } {
  const isIndex = unit.toLowerCase().includes('index')

  if (!isIndex) {
    // Giá trị thực (kg/ha, tấn...) → hiển thị số thực
    const unitVN = unit
      .replace('kg/ha arable land', 'kg/ha đất canh tác')
      .replace('tonnes', 'tấn')
      .replace('kg/ha', 'kg/ha')
    return {
      badge: '',
      color: 'var(--color-ink-secondary)',
      numericLabel: `${value.toLocaleString('vi-VN')} ${unitVN}`,
    }
  }

  // FAO index: 100 = mức trung bình lịch sử
  const numericLabel = `(chỉ số: ${value.toFixed(1)})`
  if (value >= 120) return { badge: 'Rất cao', color: 'var(--color-danger)', numericLabel }
  if (value >= 110) return { badge: 'Cao hơn bình thường', color: 'var(--color-accent)', numericLabel }
  if (value >= 100) return { badge: 'Ổn định', color: 'var(--color-success)', numericLabel }
  if (value >= 90)  return { badge: 'Thấp hơn bình thường', color: 'var(--color-warning)', numericLabel }
  return { badge: 'Thấp', color: 'var(--color-info)', numericLabel }
}

export default async function ManagerDashboard() {
  const session = await auth()
  if (!session || session.user?.role !== 'manager') {
    redirect('/login')
  }

  const { htxCode } = await requireTenant()

  const profileRepo = new PrismaHtxProfileRepository(prisma)
  const useCase = new GetHtxProfileUseCase(profileRepo)

  let hasProfile = false
  let profileId = ''
  let htxName = ''
  let seasonLabel = ''
  
  try {
    const profile = await useCase.execute(htxCode)
    hasProfile = true
    profileId = profile.id
    htxName = profile.name ?? ''
    seasonLabel = profile.season_label ?? ''
  } catch (error) {
    if (error instanceof NotFoundError) {
      hasProfile = false
    } else {
      throw error
    }
  }

  const stats = {
    totalHa: 0,
    expectedYield: 0,
    readyLots: 0,
    pendingJournals: 0,
    draftLots: 0,
    parcels: 0,
    households: 0
  }
  let statusCounts: { status: string; count: number }[] = []
  let pending: { id: string; activity_type: string; entry_date: Date; activities?: { product_name: string | null }[]; parcel: { parcel_code: string; household: { name: string } } }[] = []

  let prices: { commodity: string; metric: string; value: number; unit: string; source: string; fetched_at: Date }[] = []

  if (hasProfile && profileId) {
    const [areaAgg, activeParcels, readyLots, pendingJournals, draftLots, fetchedPrices] = await Promise.all([
      prisma.parcel.aggregate({
        _sum: { area_ha: true },
        where: { household: { htx_profile_id: profileId } }
      }),
      prisma.parcel.findMany({
        where: {
          household: { htx_profile_id: profileId },
          status: { notIn: ['HARVESTED', 'DRAFT'] }
        },
        select: { area_ha: true, estimated_yield_per_ha: true }
      }),
      prisma.lot.count({
        where: { htx_profile_id: profileId, status: 'READY' }
      }),
      prisma.journalEntry.count({
        where: {
          parcel: { household: { htx_profile_id: profileId } },
          status: 'PENDING_APPROVAL'
        }
      }),
      prisma.lot.count({
        where: { htx_profile_id: profileId, status: 'DRAFT' }
      }),
      latestPrices()
    ])

    const [grouped, households, entries] = await Promise.all([
      prisma.parcel.groupBy({
        by: ['status'],
        _count: { _all: true },
        where: { household: { htx_profile_id: profileId } }
      }),
      prisma.household.count({ where: { htx_profile_id: profileId } }),
      prisma.journalEntry.findMany({
        where: { parcel: { household: { htx_profile_id: profileId } }, status: 'PENDING_APPROVAL' },
        orderBy: { entry_date: 'desc' },
        take: 5,
        select: {
          id: true,
          activity_type: true,
          entry_date: true,
          activities: { select: { product_name: true }, take: 1 },
          parcel: { select: { parcel_code: true, household: { select: { name: true } } } }
        }
      })
    ])
    statusCounts = grouped.map(g => ({ status: g.status, count: g._count._all }))
    stats.parcels = statusCounts.reduce((sum, g) => sum + g.count, 0)
    stats.households = households
    pending = entries

    stats.totalHa = areaAgg._sum.area_ha || 0

    const yieldKg = activeParcels.reduce((sum, p) => sum + ((p.area_ha || 0) * (p.estimated_yield_per_ha || 0)), 0)
    stats.expectedYield = Math.round((yieldKg / 1000) * 10) / 10

    stats.readyLots = readyLots
    stats.pendingJournals = pendingJournals
    stats.draftLots = draftLots
    prices = fetchedPrices
  }

  const uniqueSources = Array.from(new Set(prices.map(p => p.source)))

  return (
    <main className={hasProfile ? layout.page : styles.container}>
      {hasProfile ? (
        <>
          <HeroBanner
            eyebrow={htxName || 'Trưởng HTX'}
            title={`${getGreeting()}, ${session.user.name}`}
            subtitle={[formatDate(new Date()), seasonLabel].filter(Boolean).join(' · ')}
            status="Đang hoạt động"
            actions={[{ href: '/manager/lots', label: 'Tạo lô hàng', icon: <Plus size={18} aria-hidden="true" /> }]}
          />

          <RainAlert />

          <div className={layout.metrics}>
            <MetricCard
              icon={<Sprout />}
              label="Diện tích canh tác"
              value={`${stats.totalHa.toLocaleString('vi-VN')} ha`}
              detail={`${stats.parcels.toLocaleString('vi-VN')} thửa · ${stats.households.toLocaleString('vi-VN')} nông hộ`}
              tone="green"
            />
            <MetricCard
              icon={<TrendingUp />}
              label="Sản lượng dự kiến"
              value={`${stats.expectedYield.toLocaleString('vi-VN')} tấn`}
              tone="blue"
            />
            <MetricCard
              icon={<Clock />}
              label="Nhật ký chờ duyệt"
              value={stats.pendingJournals}
              detail={`${stats.draftLots.toLocaleString('vi-VN')} lô nháp`}
              tone="amber"
            />
            <MetricCard
              icon={<PackageCheck />}
              label="Lô sẵn sàng"
              value={`${stats.readyLots.toLocaleString('vi-VN')} lô`}
              tone="green"
            />
          </div>

          <nav className={layout.quickLinks} aria-label="Lối tắt">
            {[
              { href: '/manager/schedule', label: 'Lịch thu hái', icon: <Calendar size={20} /> },
              { href: '/manager/journal-approve', label: 'Duyệt nhật ký', icon: <CheckSquare size={20} /> },
              { href: '/manager/lots', label: 'In tem QR', icon: <QrCode size={20} /> },
              { href: '/manager/bulletin', label: 'Gửi bản tin', icon: <Newspaper size={20} /> },
            ].map(link => (
              <Link key={link.label} href={link.href} className={layout.quickLink}>
                {link.icon}
                <span>{link.label}</span>
                <ChevronRight size={18} aria-hidden="true" />
              </Link>
            ))}
          </nav>

          {/* No weekly harvest records yet, so the chart is labelled as an example. */}
          <div className={layout.columns}>
            <SampleYieldChart />

            <Panel title="Tình trạng thửa đất" href="/manager/farm-zones" linkLabel="Bản đồ">
              <div className={layout.tableWrap}>
                <table className={layout.table}>
                  <thead>
                    <tr><th>Trạng thái</th><th>Số thửa</th><th>Tỷ lệ</th></tr>
                  </thead>
                  <tbody>
                    {PARCEL_STATUSES.map(({ status, label, color }) => {
                      const count = statusCounts.find(g => g.status === status)?.count ?? 0
                      return (
                        <tr key={status}>
                          <td><Pill tone="muted"><span className={styles.statusDot} style={{ background: color }} />{label}</Pill></td>
                          <td><strong>{count.toLocaleString('vi-VN')}</strong></td>
                          <td><progress className={styles.share} max={stats.parcels || 1} value={count} style={{ '--share-color': color } as React.CSSProperties} aria-label={`Tỷ lệ ${label}`} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>

          <Panel title="Nhật ký chờ duyệt" href="/manager/journal-approve">
            {pending.length === 0 ? (
              <EmptyState icon={<CheckSquare />} title="Không có nhật ký chờ duyệt" />
            ) : (
              <PendingJournals rows={pending.map(entry => ({
                id: entry.id,
                parcel: entry.parcel.parcel_code,
                household: entry.parcel.household.name,
                activity: ACTIVITY_LABELS[entry.activity_type] ?? entry.activity_type,
                material: entry.activities?.[0]?.product_name || '—',
                date: entry.entry_date.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
              }))} />
            )}
          </Panel>

          <NoticesAndWeather />

          {/* Market Snapshot */}
          <Panel title="Chỉ số giá nông sản">
          <div className={layout.body}>

            <div className={styles.pricesGrid}>
              {prices.length > 0 ? prices.map((price, idx) => {
                const { badge, color, numericLabel } = formatIndexValue(price.value, price.unit)
                const isIndex = price.unit.toLowerCase().includes('index')
                return (
                  <div key={idx} className={styles.priceItem}>
                    <div>
                      <strong className={styles.priceCommodity}>
                        {toCommodityVN(price.commodity)}
                      </strong>
                      <span className={styles.priceMetric}>
                        {toMetricVN(price.metric)}
                      </span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {isIndex ? (
                        <>
                          <span style={{ fontWeight: 600, color }} className="inline-flex items-center gap-1.5">
                            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                            {badge}
                          </span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--color-ink-tertiary)', marginLeft: '0.4rem' }}>
                            {numericLabel}
                          </span>
                        </>
                      ) : (
                        <span style={{ fontWeight: 600, color }}>{numericLabel}</span>
                      )}
                    </div>
                  </div>
                )
              }) : (
                <div className={styles.emptyMarket}>
                  <BarChart3 size={36} className="text-primary mx-auto" />
                  <p style={{ margin: '0.5rem 0 0.25rem', fontWeight: 600, color: 'var(--color-ink-secondary)' }}>
                    Chưa có dữ liệu giá.
                  </p>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-ink-tertiary)' }}>
                    Hệ thống cập nhật tự động mỗi ngày. Vui lòng quay lại sau.
                  </p>
                </div>
              )}
            </div>

            <div className={styles.aiInfo}>
              <AiNote />
              {uniqueSources.length > 0 && <SourceBox count={uniqueSources.length} sources={uniqueSources} />}
            </div>
          </div>
          </Panel>
        </>
      ) : (
        <>
          <h1 className={styles.heading}>Tổng quan — Trưởng HTX</h1>
          <p className={styles.welcomeText}>Chào mừng bạn đến với bảng điều khiển dành cho Trưởng Hợp tác xã.</p>
          <section className={styles.ctaCard} aria-labelledby="onboarding-cta-title">
            <h2 id="onboarding-cta-title" className={styles.ctaTitle}>Chưa thiết lập Hợp tác xã</h2>
            <p className={styles.ctaDesc}>Bạn cần cập nhật thông tin Hợp tác xã trước khi sử dụng các tính năng khác.</p>
            <Link href="/manager/profile" className={styles.ctaButton}>
              Thiết lập ngay
            </Link>
          </section>
        </>
      )}
    </main>
  )
}
