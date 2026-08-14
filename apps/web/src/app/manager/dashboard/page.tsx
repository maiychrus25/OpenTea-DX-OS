// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Sprout, Package, PackageCheck, AlertCircle } from 'lucide-react'

import { GetHtxProfileUseCase } from '@/application/useCases/GetHtxProfileUseCase'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/repositories/PrismaHtxProfileRepository'
import { prisma } from '@/infrastructure/db/prisma.client'
import { NotFoundError } from '@/domain/errors'
import { auth } from '@/auth'
import { MetricCard, AiNote, SourceBox } from '@/components/ui'

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

export default async function ManagerDashboard() {
  const session = await auth()
  if (!session || session.user?.role !== 'manager') {
    redirect('/login')
  }

  const profileRepo = new PrismaHtxProfileRepository(prisma)
  const useCase = new GetHtxProfileUseCase(profileRepo)

  let hasProfile = false
  let profileId = ''
  
  try {
    const profile = await useCase.execute()
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
      prisma.marketData.findMany({
        orderBy: { fetched_at: 'desc' },
        take: 3,
        select: { commodity: true, metric: true, value: true, unit: true, source: true, fetched_at: true }
      })
    ])

    stats.totalHa = areaAgg._sum.area_ha || 0

    const yieldKg = activeParcels.reduce((sum, p) => sum + ((p.area_ha || 0) * (p.estimated_yield_per_ha || 0)), 0)
    stats.expectedYield = Math.round((yieldKg / 1000) * 10) / 10

    stats.readyLots = readyLots
    stats.pendingCount = pendingJournals + draftLots
    prices = fetchedPrices
  }

  const uniqueSources = Array.from(new Set(prices.map(p => p.source)))

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
            <span className={styles.eyebrow}>GIÁ THỊ TRƯỜNG HÔM NAY</span>
            
            <div className={styles.pricesGrid}>
              {prices.map((price, idx) => (
                <div key={idx} className={styles.priceItem}>
                  <strong className={styles.priceCommodity}>{price.commodity}</strong>
                  <span className={styles.priceValue}>{price.value.toLocaleString('vi-VN')} {price.unit}</span>
                </div>
              ))}
              {prices.length === 0 && <p className={styles.emptyText}>Chưa có dữ liệu thị trường</p>}
            </div>

            <div className={styles.aiInfo}>
              <AiNote />
              <SourceBox count={prices.length || 3} sources={uniqueSources.length > 0 ? uniqueSources : ['USDA', 'WTO', 'Sở NN&PTNT']} />
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
