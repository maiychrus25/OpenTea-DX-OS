// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Sprout, Package, PackageCheck, AlertCircle, BarChart3 } from 'lucide-react'

import { GetHtxProfileUseCase } from '@/application/useCases/GetHtxProfileUseCase'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/repositories/PrismaHtxProfileRepository'
import { prisma } from '@/infrastructure/db/prisma.client'
import { NotFoundError } from '@/domain/errors'
import { auth } from '@/auth'
import { requireTenant } from '@/lib/api/tenant'
import { MetricCard, AiNote, SourceBox } from '@/components/ui'
import { isSimulatedPrice, SIMULATED_PRICE_LABEL } from '@/domain/market/simulated-price'

import styles from './Dashboard.module.css'

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

const PRICE_SELECT = { commodity: true, metric: true, value: true, unit: true, source: true, fetched_at: true } as const
const PRICE_COUNT = 3

// Tea first, topped up with the newest other commodities when fewer than PRICE_COUNT tea rows exist.
async function latestPrices() {
  const tea = await prisma.marketData.findMany({
    where: { commodity: 'Tea' },
    orderBy: { fetched_at: 'desc' },
    take: PRICE_COUNT,
    select: PRICE_SELECT,
  })
  if (tea.length >= PRICE_COUNT) return tea
  const others = await prisma.marketData.findMany({
    where: { commodity: { not: 'Tea' } },
    orderBy: { fetched_at: 'desc' },
    take: PRICE_COUNT - tea.length,
    select: PRICE_SELECT,
  })
  return [...tea, ...others]
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
  
  try {
    const profile = await useCase.execute(htxCode)
    hasProfile = true
    profileId = profile.id
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
    pendingCount: 0
  }

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

    stats.totalHa = areaAgg._sum.area_ha || 0

    const yieldKg = activeParcels.reduce((sum, p) => sum + ((p.area_ha || 0) * (p.estimated_yield_per_ha || 0)), 0)
    stats.expectedYield = Math.round((yieldKg / 1000) * 10) / 10

    stats.readyLots = readyLots
    stats.pendingCount = pendingJournals + draftLots
    prices = fetchedPrices
  }

  const uniqueSources = Array.from(new Set(prices.map(p => p.source)))
  // Only real sources count as verified; a simulated price is named as such, and no data names no source.
  const verifiedSources = uniqueSources.filter(source => !isSimulatedPrice(source))
  const simulatedSources = uniqueSources.filter(source => isSimulatedPrice(source))

  return (
    <main className={styles.container}>
      {hasProfile ? (
        <>
          <section className={styles.hero}>
            <div className={styles.heroGreeting}>
              <h1 className={styles.heading}>
                {getGreeting()}, {session.user.name}
              </h1>
              <span className={styles.pillGreen}>Đang hoạt động</span>
            </div>
            <span className={styles.date}>{formatDate(new Date())}</span>
          </section>

          {/* Metrics */}
          <div className={styles.metricGrid}>
            <MetricCard
              icon={<Sprout />}
              label="Vùng canh tác"
              value={`${stats.totalHa.toLocaleString('vi-VN')} ha`}
              tone="green"
            />
            <MetricCard
              icon={<Package />}
              label="Sản lượng kỳ vọng"
              value={`${stats.expectedYield.toLocaleString('vi-VN')} tấn`}
              tone="blue"
            />
            <MetricCard
              icon={<PackageCheck />}
              label="Lô sẵn sàng"
              value={stats.readyLots}
              tone="green"
            />
            <MetricCard
              icon={<AlertCircle />}
              label="Cần xử lý"
              value={stats.pendingCount}
              tone="amber"
            />
          </div>

          {/* Market Snapshot */}
          <section className={styles.marketSnapshot}>
            <span className={styles.eyebrow}>CHỈ SỐ GIÁ NÔNG SẢN</span>

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
                      {isSimulatedPrice(price.source) && (
                        <span className={styles.priceMetric}>{SIMULATED_PRICE_LABEL}</span>
                      )}
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
                    Chưa có dữ liệu giá hôm nay
                  </p>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-ink-tertiary)' }}>
                    Hệ thống cập nhật tự động mỗi ngày. Vui lòng quay lại sau.
                  </p>
                </div>
              )}
            </div>

            <div className={styles.aiInfo}>
              <AiNote />
              {verifiedSources.length > 0 && <SourceBox count={verifiedSources.length} sources={verifiedSources} />}
              {simulatedSources.length > 0 && (
                <p className={styles.simulatedSource}>{`Nguồn mô phỏng: ${simulatedSources.join(' · ')}`}</p>
              )}
            </div>
          </section>
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
