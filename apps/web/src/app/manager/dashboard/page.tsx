// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Coins, Flame, Leaf, Package } from 'lucide-react'

import { GetHtxProfileUseCase } from '@/application/useCases/GetHtxProfileUseCase'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/repositories/PrismaHtxProfileRepository'
import { prisma } from '@/infrastructure/db/prisma.client'
import { NotFoundError } from '@/domain/errors'
import { auth } from '@/auth'
import { requireTenant } from '@/lib/api/tenant'
import { loadDirectorBoard } from '@/lib/board/director-board-data'
import { loadSeasonReport } from '@/lib/report/season-report-data'
import { changePercent, vnDay, weeklyKg, weeksStart } from '@/lib/manager/overview'
import { StatCards, type StatCard } from '@/components/features/manager-web/parts'
import type { SeasonReport } from '@/domain/report/views'
import { ManagerHero } from './_components/ManagerHero'
import { OverviewSection, type News, type Todo, type Warning } from './_components/OverviewSection'
import styles from './Dashboard.module.css'
import overview from './_components/overview.module.css'

const kgText = (value: number | undefined) => (value === undefined ? '—' : `${value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} kg`)
const revenue = (report: SeasonReport | null) => (report?.sales ? Number(report.sales.wholesale_vnd) + Number(report.sales.retail_vnd) : undefined)
const vnDate = (date: Date) => date.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' })

function getGreeting(): string {
  const hour = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh', hour: 'numeric', hourCycle: 'h23' }))
  if (hour < 12) return 'Chào buổi sáng'
  if (hour < 18) return 'Chào buổi chiều'
  return 'Chào buổi tối'
}

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
  // With nothing from last year the percentage is the design's example, and says so.
  const card = (label: string, value: string, icon: React.ReactNode, current: number | undefined, last: number | undefined, example: number): StatCard => {
    const change = current === undefined ? null : changePercent(current, last)
    return { label, value, icon, change: change ?? example, note: change === null ? 'So với cùng kỳ (Mẫu)' : 'So với cùng kỳ' }
  }
  const money = revenue(now)
  return [
    card('Sản lượng đã thu hái', kgText(now?.purchases?.total.net_kg), <Leaf size={26} />, now?.purchases?.total.net_kg, before?.purchases?.total.net_kg, 8.5),
    card('Đã sao sấy', kgText(now?.processing?.dry_kg), <Flame size={26} />, now?.processing?.dry_kg, before?.processing?.dry_kg, 6.2),
    card('Đã bán hàng', kgText(now?.sales?.kg_sold), <Package size={26} />, now?.sales?.kg_sold, before?.sales?.kg_sold, 12.4),
    card('Doanh thu', money === undefined ? '—' : `${money.toLocaleString('vi-VN')} đ`, <Coins size={26} />, money, revenue(before), 10.8),
  ]
}

/** The two warnings of the design: the board's real alerts first, examples for what is left. */
function warningsOf(alerts: { kind: string; message: string; href: string }[]): Warning[] {
  const real: Warning[] = alerts.slice(0, 2).map((alert, index) => ({
    key: alert.kind, title: alert.message, detail: 'Bấm để xem và xử lý', href: alert.href, tone: index === 0 ? 'amber' : 'red',
  }))
  const examples: Warning[] = [
    { key: 'sample-certificate', title: '2 lô sắp hết hạn chứng nhận VietGAP', detail: 'Kiểm tra và gia hạn trước ngày 15/12/2026', href: '/manager/certificates', tone: 'amber', sample: true },
    { key: 'sample-stock', title: 'Tồn kho thuốc BVTV dưới mức tối thiểu', detail: 'Còn 3 sản phẩm, cần bổ sung', href: '/manager/inputs', tone: 'red', sample: true },
  ]
  return [...real, ...examples.slice(real.length)]
}

export default async function ManagerDashboard() {
  const session = await auth()
  if (!session || session.user?.role !== 'manager') {
    redirect('/login')
  }

  const { htxCode } = await requireTenant()
  const useCase = new GetHtxProfileUseCase(new PrismaHtxProfileRepository(prisma))

  let profile: { id: string; name?: string | null } | null = null
  try {
    profile = await useCase.execute(htxCode)
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error
  }

  if (!profile) {
    return (
      <main className={styles.container}>
        <h1 className={styles.heading}>Tổng quan — Trưởng HTX</h1>
        <p className={styles.welcomeText}>Chào mừng bạn đến với bảng điều khiển dành cho Trưởng Hợp tác xã.</p>
        <section className={styles.ctaCard} aria-labelledby="onboarding-cta-title">
          <h2 id="onboarding-cta-title" className={styles.ctaTitle}>Chưa thiết lập Hợp tác xã</h2>
          <p className={styles.ctaDesc}>Bạn cần cập nhật thông tin Hợp tác xã trước khi sử dụng các tính năng khác.</p>
          <Link href="/manager/profile" className={styles.ctaButton}>Thiết lập ngay</Link>
        </section>
      </main>
    )
  }

  const profileId = profile.id
  const htxName = profile.name ?? ''
  const now = new Date()
  const today = vnDay(now)
  const year = Number(today.slice(0, 4))
  const lastDay = today.slice(5) === '02-29' ? '02-28' : today.slice(5)
  const household = { household: { htx_profile_id: profileId } }
  const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [board, thisYear, lastYear, tickets, waiting, due, drafts, notice] = await Promise.all([
    orElse(() => loadDirectorBoard(profileId, now, 'manager'), null),
    orElse(() => loadSeasonReport(profileId, `${year}-01-01`, today, htxName, now), null),
    orElse(() => loadSeasonReport(profileId, `${year - 1}-01-01`, `${year - 1}-${lastDay}`, htxName, now), null),
    orElse(() => prisma.freshLeafTicket.findMany({
      where: { htx_profile_id: profileId, status: 'VALID', weighed_at: { gte: weeksStart(now, 8) } },
      select: { weighed_at: true, net_kg: true },
    }), []),
    orElse(() => prisma.journalEntry.count({ where: { parcel: household, status: 'PENDING_APPROVAL' } }), 0),
    orElse(() => prisma.parcelCropCycle.count({ where: { parcel: household, harvested_at: null, estimated_harvest_date: { lte: soon } } }), 0),
    orElse(() => prisma.settlementPeriod.count({ where: { htx_profile_id: profileId, status: 'DRAFT' } }), 0),
    orElse(() => prisma.notification.findFirst({
      where: { htx_profile_id: profileId, recipient_id: null },
      orderBy: { created_at: 'desc' },
      select: { title: true, body: true, created_at: true },
    }), null),
  ])

  const todos: Todo[] = [
    { key: 'journals', title: 'Duyệt nhật ký canh tác', detail: `${waiting} nhật ký chờ duyệt`, href: '/manager/journal-approve' },
    { key: 'harvest', title: 'Xác nhận lịch thu hái', detail: `${due} lứa đến kỳ thu hái`, href: '/manager/schedule' },
    { key: 'tickets', title: 'Duyệt phiếu cân', detail: '5 phiếu cân chờ xác nhận', href: '/manager/leaf-tickets', sample: true },
    { key: 'settlements', title: 'Quyết toán xã viên', detail: `${drafts} kỳ quyết toán đến hạn`, href: '/manager/settlements' },
  ]
  const news: News = notice
    ? { title: notice.title, detail: notice.body, date: vnDate(notice.created_at) }
    : { title: 'HTX triển khai kế hoạch sản xuất vụ Xuân', detail: 'Thông báo kế hoạch chăm sóc và thu hái cho toàn bộ xã viên.', date: '25/11/2026', sample: true }

  return (
    <main className={overview.page}>
      <ManagerHero htxName={htxName || 'Hợp tác xã'} greeting={getGreeting()} />
      <StatCards items={yearFigures(thisYear, lastYear)} />
      <OverviewSection
        weeks={weeklyKg(tickets.map(t => ({ weighed_at: t.weighed_at, net_kg: Number(t.net_kg) })), now)}
        todos={todos}
        warnings={warningsOf(board?.alerts ?? [])}
        news={news}
      />
    </main>
  )
}
