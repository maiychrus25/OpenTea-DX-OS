// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CheckSquare, ChevronRight, Newspaper, BarChart3 } from 'lucide-react'

import { GetHtxProfileUseCase } from '@/application/useCases/GetHtxProfileUseCase'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/repositories/PrismaHtxProfileRepository'
import { PrismaInstalledAppRepository } from '@/infrastructure/db/repositories/prisma-installed-app-repository'
import { prisma } from '@/infrastructure/db/prisma.client'
import { NotFoundError } from '@/domain/errors'
import { auth } from '@/auth'
import { requireTenant } from '@/lib/api/tenant'
import { loadDirectorBoard } from '@/lib/board/director-board-data'
import { HeroBanner, Panel, EmptyState } from '@/components/ui'

import { NoticesAndWeather, RainAlert } from '@/components/features/dashboard/NoticesAndWeather'
import { PendingJournals } from '@/components/features/dashboard/PendingJournals'
import { DirectorBoardView } from '@/components/features/board/DirectorBoardView'
import styles from './Dashboard.module.css'
import layout from '@/components/features/dashboard/dashboard.module.css'
import boardStyles from '@/components/features/board/board.module.css'

/** The analysis mini-app's id in its manifest (miniapps/htx-dashboard/app.yaml). */
const ANALYSIS_APP_ID = 'htx-dashboard'

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

const ACTIVITY_LABELS: Record<string, string> = {
  SOWING: 'Gieo trồng',
  FERTILIZING: 'Bón phân',
  SPRAYING: 'Phun thuốc',
  IRRIGATION: 'Tưới tiêu',
  HARVEST: 'Thu hoạch',
  PRUNING: 'Đốn chè',
  OTHER: 'Khác',
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

  let pending: { id: string; activity_type: string; entry_date: Date; activities?: { product_name: string | null }[]; parcel: { parcel_code: string; household: { name: string } } }[] = []
  let board = null as Awaited<ReturnType<typeof loadDirectorBoard>> | null
  let analysisEnabled = false

  if (hasProfile && profileId) {
    const [entries, loaded, enabled] = await Promise.all([
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
      }),
      loadDirectorBoard(profileId, new Date(), 'manager'),
      new PrismaInstalledAppRepository().isEnabledFor(ANALYSIS_APP_ID, htxCode).catch(() => false),
    ])
    pending = entries
    board = loaded
    analysisEnabled = enabled
  }

  return (
    <main className={hasProfile ? layout.page : styles.container}>
      {hasProfile && board ? (
        <>
          <HeroBanner
            eyebrow={htxName || 'Trưởng HTX'}
            title={`${getGreeting()}, ${session.user.name}`}
            subtitle={[formatDate(new Date()), seasonLabel].filter(Boolean).join(' · ')}
            status="Đang hoạt động"
          />

          <RainAlert />

          <DirectorBoardView board={board} role="manager" />

          <nav className={boardStyles.linkRow} aria-label="Liên kết khác">
            {analysisEnabled && (
              <Link href={`/manager/apps/${ANALYSIS_APP_ID}`} className={boardStyles.linkChip}>
                <BarChart3 size={18} aria-hidden="true" />
                <span>Phân tích chi tiết</span>
                <ChevronRight size={16} aria-hidden="true" />
              </Link>
            )}
            <Link href="/manager/bulletin" className={boardStyles.linkChip}>
              <Newspaper size={18} aria-hidden="true" />
              <span>Giá chè thế giới</span>
              <ChevronRight size={16} aria-hidden="true" />
            </Link>
          </nav>

          <NoticesAndWeather />

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
        </>
      ) : hasProfile ? (
        <>
          <HeroBanner
            eyebrow={htxName || 'Trưởng HTX'}
            title={`${getGreeting()}, ${session.user.name}`}
            subtitle={[formatDate(new Date()), seasonLabel].filter(Boolean).join(' · ')}
            status="Đang hoạt động"
          />
          <p role="alert" className={boardStyles.failed}>Chưa tải được bảng điều hành. Vui lòng tải lại trang.</p>
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
