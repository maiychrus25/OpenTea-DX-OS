// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronRight, Newspaper, BarChart3, Coins, Flame, Leaf, ShoppingBag } from 'lucide-react'

import { GetHtxProfileUseCase } from '@/application/useCases/GetHtxProfileUseCase'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/repositories/PrismaHtxProfileRepository'
import { PrismaInstalledAppRepository } from '@/infrastructure/db/repositories/prisma-installed-app-repository'
import { prisma } from '@/infrastructure/db/prisma.client'
import { NotFoundError } from '@/domain/errors'
import { auth } from '@/auth'
import { requireTenant } from '@/lib/api/tenant'
import { loadDirectorBoard } from '@/lib/board/director-board-data'
import { loadSeasonReport } from '@/lib/report/season-report-data'
import { changePercent, vnDay, weeklyKg, weeksStart } from '@/lib/manager/overview'
import { WeatherHero } from '@/components/features/farmer-web/WeatherHero'
import { StatCards, type StatCard } from '@/components/features/manager-web/parts'
import type { SeasonReport } from '@/domain/report/views'
import { OverviewSection, type Todo } from './_components/OverviewSection'
import { HeadNotices } from './_components/HeadNotices'

import { DirectorBoardView } from '@/components/features/board/DirectorBoardView'
import styles from './Dashboard.module.css'
import layout from '@/components/features/dashboard/dashboard.module.css'
import boardStyles from '@/components/features/board/board.module.css'

const kgText = (value: number | undefined) => (value === undefined ? '—' : `${value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} kg`)
const revenue = (report: SeasonReport | null) => (report?.sales ? Number(report.sales.wholesale_vnd) + Number(report.sales.retail_vnd) : undefined)

/** One figure that cannot be read leaves a dash or drops its line, never the whole page. */
async function orElse<T>(read: () => PromiseLike<T>, fallback: T): Promise<T> {
  try {
    return await read()
  } catch {
    return fallback
  }
}

/** From 1 January to today, against the same days of last year. */
function yearFigures(now: SeasonReport | null, before: SeasonReport | null): StatCard[] {
  const note = (change: number | null) => (change === null ? 'Từ đầu năm' : 'so cùng kỳ')
  const card = (label: string, value: string, icon: React.ReactNode, current: number | undefined, last: number | undefined): StatCard => {
    const change = current === undefined ? null : changePercent(current, last)
    return { label, value, icon, change, note: note(change) }
  }
  const money = revenue(now)
  return [
    card('Búp đã thu mua', kgText(now?.purchases?.total.net_kg), <Leaf size={26} />, now?.purchases?.total.net_kg, before?.purchases?.total.net_kg),
    card('Chè khô đã sao', kgText(now?.processing?.dry_kg), <Flame size={26} />, now?.processing?.dry_kg, before?.processing?.dry_kg),
    card('Chè đã bán', kgText(now?.sales?.kg_sold), <ShoppingBag size={26} />, now?.sales?.kg_sold, before?.sales?.kg_sold),
    card('Doanh thu', money === undefined ? '—' : `${money.toLocaleString('vi-VN')} đ`, <Coins size={26} />, money, revenue(before)),
  ]
}

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

  let board = null as Awaited<ReturnType<typeof loadDirectorBoard>> | null
  let analysisEnabled = false
  let figures: StatCard[] = []
  let weeks: ReturnType<typeof weeklyKg> = []
  const todos: Todo[] = []

  if (hasProfile && profileId) {
    const [loaded, enabled] = await Promise.all([
      loadDirectorBoard(profileId, new Date(), 'manager'),
      new PrismaInstalledAppRepository().isEnabledFor(ANALYSIS_APP_ID, htxCode).catch(() => false),
    ])
    board = loaded
    analysisEnabled = enabled

    // The figures above the board.
    const now = new Date()
    const today = vnDay(now)
    const year = Number(today.slice(0, 4))
    const lastDay = today.slice(5) === '02-29' ? '02-28' : today.slice(5)
    const household = { household: { htx_profile_id: profileId } }
    const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const [thisYear, lastYear, tickets, waiting, due, unscheduled, drafts] = await Promise.all([
      orElse(() => loadSeasonReport(profileId, `${year}-01-01`, today, htxName, now), null),
      orElse(() => loadSeasonReport(profileId, `${year - 1}-01-01`, `${year - 1}-${lastDay}`, htxName, now), null),
      orElse(() => prisma.freshLeafTicket.findMany({
        where: { htx_profile_id: profileId, status: 'VALID', weighed_at: { gte: weeksStart(now, 8) } },
        select: { weighed_at: true, net_kg: true },
      }), []),
      orElse(() => prisma.journalEntry.count({ where: { parcel: household, status: 'PENDING_APPROVAL' } }), 0),
      orElse(() => prisma.parcelCropCycle.count({ where: { parcel: household, harvested_at: null, estimated_harvest_date: { lte: soon } } }), 0),
      orElse(() => prisma.parcelCropCycle.count({ where: { parcel: household, harvested_at: null, estimated_harvest_date: null } }), 0),
      orElse(() => prisma.settlementPeriod.count({ where: { htx_profile_id: profileId, status: 'DRAFT' } }), 0),
    ])
    figures = yearFigures(thisYear, lastYear)
    weeks = weeklyKg(tickets.map(t => ({ weighed_at: t.weighed_at, net_kg: Number(t.net_kg) })), now)
    if (waiting) todos.push({ key: 'journals', title: 'Duyệt nhật ký canh tác', detail: `${waiting} nhật ký chờ duyệt`, href: '/manager/journal-approve' })
    if (due) todos.push({ key: 'harvest', title: 'Lứa đến hạn hái', detail: `${due} lứa đến hạn trong 7 ngày tới hoặc đã quá ngày`, href: '/manager/schedule' })
    if (unscheduled) todos.push({ key: 'unscheduled', title: 'Xếp lịch thu hái', detail: `${unscheduled} lứa chưa có ngày hái`, href: '/manager/schedule' })
    if (drafts) todos.push({ key: 'settlements', title: 'Chốt kỳ quyết toán', detail: `${drafts} kỳ đang ở bản nháp`, href: '/manager/settlements' })
  }

  const hero = (
    <WeatherHero
      eyebrow={htxName || 'Trưởng HTX'}
      title={`${getGreeting()}, ${session.user.name}`}
      subtitle={[formatDate(new Date()), seasonLabel].filter(Boolean).join(' · ')}
      actions={[]}
      place=""
      cached={null}
      forecastHref="/manager/bulletin"
    />
  )

  return (
    <main className={hasProfile ? layout.page : styles.container}>
      {hasProfile && board ? (
        <>
          {hero}

          <StatCards items={figures} />

          <OverviewSection weeks={weeks} todos={todos} />

          <HeadNotices />

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
        </>
      ) : hasProfile ? (
        <>
          {hero}
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
